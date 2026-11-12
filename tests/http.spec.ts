import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { registerHttp } from '../src/app/http.ts'
import type { PrepareStatus } from '../src/app/prepare.ts'
import { UserError } from '../src/core/index.ts'
import { PromptConflict } from '../src/app/prompts.ts'
import { SettingsConflict } from '../src/app/settings.ts'
import type { HttpHost } from '../src/app/http.ts'
import { SettingsSchema } from '../src/policy.ts'
import { SetupError } from '../src/setup.ts'

type Handler = (req: unknown, res: unknown) => Promise<void>
type Headers = Record<string, string | undefined>
/** Mount management HTTP routes on a fake web server and return a request helper that includes default panel headers. */
function serve(runtime: Partial<Record<keyof HttpHost, unknown>>, host = '127.0.0.1') {
  let handler: Handler = async () => {}
  const ctx = { webServer: { host, port: 3082, protocol: 'http:', register: (route: { handler: Handler }) => { handler = route.handler; return () => {} } } }
  registerHttp(ctx as never, { ready: Promise.resolve(), ...runtime } as unknown as HttpHost)
  return async (method: string, path: string, body?: unknown, headers: Headers = {}) => {
    let status = 0, text = ''
    const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
    const sent = Object.fromEntries(Object.entries({ host: '127.0.0.1:3082', 'x-orchestrator-request': '1', ...headers }).filter(([,
      value]) => value !== undefined))
    const req = { method, url: `/orchestrator/api/${path}`, headers: sent, async *[Symbol.asyncIterator]() { yield* chunks } }
    await handler(req, { writeHead: (code: number) => { status = code }, end: (data: string) => { text = data } })
    return { status, body: JSON.parse(text) as Record<string, unknown> }
  }
}

it('answers each kind of failure with its own status', async () => {
  const saves: unknown[] = []
  const call = serve({
    store: { tickets: { get: () => undefined }, blockRevision: () => 0 },
    sources: { instances: () => [{ id: 'github' }] },
    settings: { save: async (...args: unknown[]) => {
      saves.push(args)
      if (args[1] === 'stale') throw new SettingsConflict('Settings changed. Reload before saving.')
      if (args[1] === 'invalid') z.object({ maxWorkers: z.number() }).parse({})
      if (args[1] === 'refused') throw new SetupError('agentCliUnset')
      if (args[1] === 'broken') throw new Error('disk full')
      return { saved: true, revision: 1, restarting: false }
    } },
  })
  expect(await call('PUT', 'settings/executor', { value: 'stale', revision: 0 })).toMatchObject({ status: 409 })
  expect(await call('PUT', 'settings/executor', { value: 'invalid', revision: 0 })).toMatchObject({ status: 400, body: { issues: [{ path: 'maxWorkers' }] } })
  expect(await call('PUT', 'settings/source:github', { value: 'refused', revision: 0 })).toMatchObject({ status: 400, body: { setup: { code: 'agentCliUnset', place: 'github' } } })
  expect(await call('PUT', 'settings/executor', { value: 'broken', revision: 0 })).toEqual({ status: 500, body: { error: 'disk full' } })
  // Block names are validated before calling settings.save: reject unknown blocks or non-existent Sources.
  expect(await call('PUT', 'settings/pause', { value: {}, revision: 0 })).toMatchObject({ status: 400 })
  expect(await call('PUT', 'settings/source:feishu', { value: {}, revision: 0 })).toEqual({ status: 404, body: { error: 'Source not found' } })
  expect(saves).toHaveLength(4)
  expect(await call('POST', 'tickets/t9/retry')).toEqual({ status: 404, body: { error: 'Ticket not found' } })
  expect(await call('GET', 'nothing/here')).toEqual({ status: 404, body: { error: 'Unknown operation' } })
  expect(await call('POST', 'executor/pause', 'not json')).toEqual({ status: 400, body: { error: 'The request body is not JSON' } })
})

it('decodes path parameters and parses each route\'s query', async () => {
  const seen: unknown[] = []
  const call = serve({
    store: { settings: () => SettingsSchema.parse({}),
      read: { decisions: (filter: unknown, offset: number, limit: number) => { seen.push({ filter, offset, limit }); return { items: [], more: false } } } },
    links: () => () => ({ url: '', label: { zh: '', en: '' } }),
    engine: { unsubscribe: (key: string) => { seen.push(key); return true } },
    sessions: { delivery: async () => 'injected' },
  })
  expect(await call('POST', `threads/${encodeURIComponent('feishu:oc_1:om/root')}/unsubscribe`)).toMatchObject({ status: 200, body: { context_delivery: 'injected' } })
  // Invalid offsets default to 0, and limits above the route maximum are clamped.
  expect(await call('GET', 'decisions?kind=accept%2Creopen&limit=500&offset=x&window=24h')).toEqual({ status: 200, body: { items: [], next_offset: null } })
  expect(seen).toEqual(['feishu:oc_1:om/root', { filter: { kinds: ['accept', 'reopen'], since: expect.any(String) }, offset: 0, limit: 200 }])
})

it('answers only a same-origin request from the panel on the bound address', async () => {
  const call = serve({ sessions: { delivery: async () => 'injected' }, engine: { unsubscribe: () => true } }, '10.126.126.6')
  const post = (headers: Headers) => call('POST', 'threads/github%3A1/unsubscribe', undefined, headers)
  for (const headers of [{ 'x-orchestrator-request': undefined }, { host: 'evil.example:3082' }, { host: '127.0.0.1:9999' },
    { origin: 'http://evil.example' }, { host: 'localhost:3082', origin: 'http://127.0.0.1:3082' },
    { host: '10.126.126.6:3082', origin: 'http://10.126.126.6:8399' }]) {
    expect(await post(headers), JSON.stringify(headers)).toEqual({ status: 403,
      body: { error: 'Same-origin management request required' } })
  }
  expect(await post({ host: 'localhost:3082', origin: 'http://localhost:3082' })).toMatchObject({ status: 200 })
  expect(await post({ host: '10.126.126.6:3082', origin: 'http://10.126.126.6:3082' })).toMatchObject({ status: 200 })
  // A non-loopback Web server is allowed: the same-origin check binds to its host.
  expect(() => serve({}, '0.0.0.0')).not.toThrow()
})

it('answers a prompt save that lost a race with 409, and a settings body over 128 KiB with 400', async () => {
  const saves: unknown[] = []
  const call = serve({
    machine: { promptMaxChars: { get: () => 100_000 } },
    store: { atomic: (work: () => unknown) => work(), blockRevision: () => 0 },
    prompts: { save: () => { throw new PromptConflict('Prompt version changed to 3; compare the latest version before saving') } },
    sessions: { notify: () => {}, delivery: async () => 'injected' },
    settings: { save: async (...args: unknown[]) => { saves.push(args); return { saved: true, revision: 1, restarting: false } } },
  })
  expect(await call('PUT', 'prompts', { config: {}, baseRevision: 2 }))
    .toEqual({ status: 409, body: { error: 'Prompt version changed to 3; compare the latest version before saving' } })
  const value = { prepare: 'x'.repeat(128 * 1024) }
  expect(await call('PUT', 'settings/executor', { value, revision: 0 })).toEqual({ status: 400,
    body: { error: `Request exceeds ${128 * 1024} bytes` } })
  expect(saves).toEqual([])
})

const PREPARE: PrepareStatus = {
  checkout: { path: '/srv/dsh-superagent', repository: 'acme/widgets', branch: 'main', head: '0123456789abcdef0123456789abcdef01234567',
    committedAt: '2026-11-12T00:00:00Z', dirty: false, remotes: [{ name: 'origin', repository: 'acme/widgets' }], available: true,
    reasons: [], restartRequired: false },
  chain: 'default', repository: 'acme/widgets', available: true, reasons: [], running: false,
}
const MERGED = { merged: true, head: 'fedcba9876543210fedcba9876543210fedcba98', log: '/srv/dsh-superagent/prepare/prepare-1.log' }
/** A runtime whose prepare answers the given status and result, or throws the given failure from a merge. */
const prepareRuntime = (merge: () => Promise<typeof MERGED>) => ({
  store: { settings: () => SettingsSchema.parse({}), tickets: { open: () => [] } },
  executor: { activeCount: () => 0 },
  machine: { stateDir: '/srv/dsh-superagent', promptMaxChars: { get: () => 100_000 }, admissionContextMaxPages: { get: () => 10 },
    admissionContextTimeoutMs: { get: () => 15_000 } },
  health: {}, masterId: 'master', configured: () => false,
  prepare: { status: async () => PREPARE, merge },
})

it('answers the running checkout\'s local merge, and each refusal with its own code', async () => {
  const status = serve({ prepare: { status: async () => PREPARE, merge: async () => MERGED } })
  expect(await status('GET', 'deployment/prepare')).toEqual({ status: 200, body: PREPARE })
  expect(await status('POST', 'deployment/prepare')).toEqual({ status: 200, body: MERGED })
  const refusing = (error: Error) => serve({ prepare: { status: async () => PREPARE, merge: async () => { throw error } } })
  expect(await refusing(new UserError('prepareUnavailable', { reasons: 'dirty,noChain' }))('POST', 'deployment/prepare'))
    .toEqual({ status: 400, body: { error: 'The checkout cannot take a local merge: dirty,noChain', code: 'prepareUnavailable',
      values: { reasons: 'dirty,noChain' } } })
  expect(await refusing(new UserError('prepareBusy'))('POST', 'deployment/prepare'))
    .toEqual({ status: 400, body: { error: 'A pull and build is already running', code: 'prepareBusy', values: {} } })
  expect(await refusing(new UserError('prepareFailed', { message: 'prepare: uncommitted changes', log: '/tmp/prepare.log' }))
    ('POST', 'deployment/prepare')).toEqual({ status: 400, body: { error: 'The pull and build failed: prepare: uncommitted changes',
      code: 'prepareFailed', values: { message: 'prepare: uncommitted changes', log: '/tmp/prepare.log' } } })
})

it('sends no restart or exit signal from a pull and build, and keeps answering after it', async () => {
  const kill = vi.spyOn(process, 'kill')
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  onTestFinished(() => { kill.mockRestore(); exit.mockRestore() })
  const call = serve(prepareRuntime(async () => MERGED))
  expect(await call('POST', 'deployment/prepare')).toEqual({ status: 200, body: MERGED })
  expect(await call('GET', 'state')).toMatchObject({ status: 200, body: { masterId: 'master', setup: { accounts: null } } })
  expect(kill).not.toHaveBeenCalled()
  expect(exit).not.toHaveBeenCalled()
})
