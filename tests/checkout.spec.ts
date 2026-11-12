/** The running checkout's read-only status: remote forms, the reason codes, the restart comparison, read-only git, and the route. */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECKOUT_GIT, CHECKOUT_REASONS, Checkout, checkoutReasons, readCheckout, repositoryOf, restartRequired, type Git }
  from '../src/app/checkout.ts'
import { registerHttp, type HttpHost } from '../src/app/http.ts'
import { gitEnv } from './fixtures/git.ts'

// Each case starts real git processes on its own temporary repository, which the suite's default timeout is too short for.
vi.setConfig({ testTimeout: 30_000 })
const exec = promisify(execFile)
const IDENTITY = { GIT_AUTHOR_NAME: 'Checkout Test', GIT_AUTHOR_EMAIL: 'checkout@example.com',
  GIT_COMMITTER_NAME: 'Checkout Test', GIT_COMMITTER_EMAIL: 'checkout@example.com' }
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dsh-superagent-checkout-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
/** Runs git in a test's own environment: no inherited repository, and the explicit identity commits need. */
const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await exec('git', args, { cwd, env: gitEnv(IDENTITY) })).stdout.trim()
/** A repository on `main` with one commit, whose `origin` is `remote` when one is given. */
async function repository(name: string, remote?: string): Promise<string> {
  const root = join(dir, name)
  mkdirSync(root)
  await git(root, 'init', '-q', '-b', 'main')
  if (remote !== undefined) await git(root, 'remote', 'add', 'origin', remote)
  writeFileSync(join(root, 'readme.md'), 'first\n')
  await git(root, 'add', 'readme.md')
  await git(root, 'commit', '-q', '-m', 'first')
  return root
}
const toplevel = (root: string): Promise<string> => git(root, 'rev-parse', '--show-toplevel')
/** Each work tree file's content hash, without the `.git` directory a read may refresh. */
function contents(directory: string, base = directory): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) Object.assign(hashes, contents(path, base))
    else hashes[relative(base, path)] = createHash('sha256').update(readFileSync(path)).digest('hex')
  }
  return hashes
}
/** Every fact a read must leave as it was: the commit, the index and refs, and each work tree file's content. */
async function snapshot(root: string): Promise<Record<string, unknown>> {
  return { head: await git(root, 'rev-parse', 'HEAD'), status: await git(root, 'status', '--porcelain'),
    refs: await git(root, 'for-each-ref'), files: contents(root) }
}
type Handler = (req: unknown, res: unknown) => Promise<void>
/** Mounts the management routes around one checkout, and returns a GET as the panel sends it. */
function serve(checkout: Pick<Checkout, 'status'>) {
  let handler: Handler = async () => {}
  const ctx = { webServer: { host: '127.0.0.1', port: 3082, protocol: 'http:', register: (route: { handler: Handler }) => {
    handler = route.handler
    return () => {}
  } } }
  registerHttp(ctx as never, { ready: Promise.resolve(), checkout } as unknown as HttpHost)
  return async (path: string) => {
    let status = 0, text = ''
    const req = { method: 'GET', url: `/orchestrator/api/${path}`, headers: { host: '127.0.0.1:3082', 'x-orchestrator-request': '1' },
      async *[Symbol.asyncIterator]() { /* A GET carries no body. */ } }
    await handler(req, { writeHead: (code: number) => { status = code }, end: (data: string) => { text = data } })
    return { status, body: JSON.parse(text) as Record<string, unknown> }
  }
}

describe('repositoryOf', () => {
  it('names the repository of every remote form GitHub serves, lowercased', () => {
    const remotes: [string, string][] = [
      ['https://github.com/acme/widgets', 'acme/widgets'],
      ['https://github.com/acme/widgets.git', 'acme/widgets'],
      ['https://GITHUB.COM/Acme/Widgets', 'acme/widgets'],
      ['https://github.com/Acme/Widgets.git/', 'acme/widgets'],
      ['https://bot:secret@github.com/acme/widgets.git', 'acme/widgets'],
      ['https://git@github.com/acme/widgets', 'acme/widgets'],
      ['git@github.com:Acme/Widgets.git', 'acme/widgets'],
      ['github.com:acme/widgets', 'acme/widgets'],
      ['ssh://git@github.com:22/acme/widgets.git', 'acme/widgets'],
      ['ssh://github.com/acme/widgets', 'acme/widgets'],
      ['git+ssh://git@github.com/acme/widgets.git', 'acme/widgets'],
      ['git://github.com/acme/widgets.git', 'acme/widgets'],
    ]
    for (const [remote, expected] of remotes) expect(repositoryOf(remote), remote).toBe(expected)
  })
  it('names no repository for another host, a local path, a missing name, or extra path segments', () => {
    for (const remote of ['https://gitlab.com/acme/widgets.git', '/srv/widgets.git', 'file:///srv/widgets.git', 'https://github.com/acme',
      'https://github.com/acme/widgets/tree/main', 'https://github.com/acme/widgets.git//', 'https://github.com/', ''])
      expect(repositoryOf(remote), remote).toBeUndefined()
  })
})

describe('readCheckout and the reason codes', () => {
  it('names the codes in the order a status reports them, and refuses a checkout that is no repository alone', () => {
    expect(CHECKOUT_REASONS).toEqual(['notGit', 'noRepository', 'detached', 'notMain', 'dirty'])
    expect(checkoutReasons({ root: null, repository: 'acme/widgets', branch: null, head: 'abc123', dirty: true })).toEqual(['notGit'])
    expect(checkoutReasons({ root: '/srv/widgets', repository: null, branch: 'main', head: 'abc123', dirty: false })).toEqual(['noRepository'])
    expect(checkoutReasons({ root: '/srv/widgets', repository: 'acme/widgets', branch: null, head: 'abc123', dirty: true }))
      .toEqual(['detached', 'dirty'])
    expect(checkoutReasons({ root: '/srv/widgets', repository: 'acme/widgets', branch: 'feature', head: 'abc123', dirty: false }))
      .toEqual(['notMain'])
    expect(checkoutReasons({ root: '/srv/widgets', repository: 'acme/widgets', branch: 'main', head: 'abc123', dirty: true })).toEqual(['dirty'])
  })
  it('reads a checkout it cannot inspect as notGit, and a tree it cannot inspect as dirty, never throwing', async () => {
    const missing: Git = async () => { throw new Error('git is unavailable') }
    expect(await readCheckout(missing, join(dir, 'gone'))).toEqual({ root: null, repository: null, branch: null, head: null, dirty: false })
    const unreadable: Git = async args => {
      if (args[0] === 'status') throw new Error('the index is locked')
      if (args[0] === 'symbolic-ref') return 'main\n'
      if (args[0] === 'config') return 'https://github.com/Acme/Widgets.git\n'
      if (args[1] === '--show-toplevel') return `${join(dir, 'repository')}\n`
      return 'abc123\n'
    }
    expect(await readCheckout(unreadable, dir)).toEqual({ root: join(dir, 'repository'), repository: 'acme/widgets', branch: 'main',
      head: 'abc123', dirty: true })
  })
  it('reports a clean main checkout on an https remote as available', async () => {
    const root = await repository('widgets', 'https://github.com/acme/widgets.git')
    expect(await new Checkout(root).status()).toEqual({ path: await toplevel(root), repository: 'acme/widgets', branch: 'main',
      head: await git(root, 'rev-parse', 'HEAD'), dirty: false, available: true, reasons: [], restartRequired: false })
  })
  it('reads an ssh scp remote whatever its case and `.git` suffix', async () => {
    const root = await repository('scp', 'git@github.com:Acme/Widgets.git')
    expect(await new Checkout(root).status()).toMatchObject({ repository: 'acme/widgets', branch: 'main', dirty: false, available: true, reasons: [] })
  })
  it('names no repository for a checkout whose origin is missing or on another host, and still reads its branch and commit', async () => {
    const root = await repository('local')
    const view = await new Checkout(root).status()
    expect(view).toMatchObject({ path: await toplevel(root), repository: null, branch: 'main', available: false, reasons: ['noRepository'] })
    expect(view.head).toMatch(/^[0-9a-f]{40}$/)
    // A remote that names no GitHub repository leaves the checkout unavailable, whatever else it reads.
    const foreign = await repository('foreign', 'https://gitlab.com/acme/widgets.git')
    expect(await new Checkout(foreign).status()).toMatchObject({ path: await toplevel(foreign), repository: null, branch: 'main',
      available: false, reasons: ['noRepository'] })
  })
  it('reports a directory that is not a checkout as notGit alone, at the directory it read', async () => {
    const plain = join(dir, 'plain')
    mkdirSync(plain)
    writeFileSync(join(plain, 'note.txt'), 'not a repository\n')
    expect(await new Checkout(plain).status()).toEqual({ path: plain, repository: null, branch: null, head: null, dirty: false,
      available: false, reasons: ['notGit'], restartRequired: false })
  })
  it('reports a detached HEAD as detached, with the commit it points at', async () => {
    const root = await repository('detached', 'https://github.com/acme/widgets.git')
    await git(root, 'checkout', '-q', '--detach')
    const view = await new Checkout(root).status()
    expect(view).toMatchObject({ branch: null, available: false, reasons: ['detached'] })
    expect(view.head).toBe(await git(root, 'rev-parse', 'HEAD'))
  })
  it('reports another branch as notMain', async () => {
    const root = await repository('branch', 'https://github.com/acme/widgets.git')
    await git(root, 'checkout', '-q', '-b', 'feature')
    expect(await new Checkout(root).status()).toMatchObject({ branch: 'feature', available: false, reasons: ['notMain'] })
  })
  it('reports a changed tracked file as dirty, with the branch and commit still readable', async () => {
    const root = await repository('dirty', 'https://github.com/acme/widgets.git')
    writeFileSync(join(root, 'readme.md'), 'changed\n')
    const view = await new Checkout(root).status()
    expect(view).toMatchObject({ branch: 'main', dirty: true, available: false, reasons: ['dirty'] })
    expect(view.head).toBe(await git(root, 'rev-parse', 'HEAD'))
  })
})

describe('restartRequired', () => {
  it('is required once the commit on disk moved past the one this instance started on', async () => {
    const root = await repository('moved')
    const checkout = new Checkout(root)
    expect(await checkout.status()).toMatchObject({ dirty: false, restartRequired: false })
    await git(root, 'commit', '-q', '--allow-empty', '-m', 'second')
    expect(await checkout.status()).toMatchObject({ head: await git(root, 'rev-parse', 'HEAD'), dirty: false, restartRequired: true })
  })
  it('stays required once a checkout that started dirty is cleaned', async () => {
    const root = await repository('started-dirty')
    writeFileSync(join(root, 'scratch.txt'), 'pending\n')
    const checkout = new Checkout(root)
    expect(await checkout.status()).toMatchObject({ dirty: true, restartRequired: true })
    rmSync(join(root, 'scratch.txt'))
    expect(await checkout.status()).toMatchObject({ dirty: false, restartRequired: true })
  })
  it('is not required for a clean commit that did not move, at the same commit twice, nor for a directory that is no checkout', async () => {
    const root = await repository('clean')
    const checkout = new Checkout(root)
    expect(await checkout.status()).toMatchObject({ dirty: false, restartRequired: false })
    expect(await checkout.status()).toMatchObject({ head: await git(root, 'rev-parse', 'HEAD'), restartRequired: false })
    const plain = join(dir, 'not-git')
    mkdirSync(plain)
    expect(await new Checkout(plain).status()).toMatchObject({ restartRequired: false })
  })
  it('starts the reading this instance compares against at construction, before any status request', async () => {
    const root = await repository('started-before-status', 'https://github.com/acme/widgets.git')
    const calls: string[][] = []
    const checkout = new Checkout(root, async (args, cwd) => { calls.push([...args]); return await git(cwd, ...args) })
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 10_000 })
    expect(await checkout.status()).toMatchObject({ available: true, restartRequired: false })
  })
  it('is the start tree alone or a changed head', () => {
    expect(restartRequired({ head: 'a', dirty: false }, 'a')).toBe(false)
    expect(restartRequired({ head: 'a', dirty: false }, 'b')).toBe(true)
    expect(restartRequired({ head: null, dirty: false }, null)).toBe(false)
    expect(restartRequired({ head: 'a', dirty: true }, 'a')).toBe(true)
  })
})

describe('read-only reading', () => {
  it('runs local read-only git commands only and leaves the checkout as it was', async () => {
    const root = await repository('readonly', 'git@github.com:acme/widgets.git')
    const before = await snapshot(root)
    const calls: string[][] = []
    const recording: Git = async (args, cwd) => { calls.push([...args]); return await git(cwd, ...args) }
    expect(await new Checkout(root, recording).status()).toMatchObject({ available: true, reasons: [] })
    expect(calls.length).toBeGreaterThan(1)
    // Each argument is compared whole: `remote.origin.url` is the config key a read asks about, not the `git remote` command.
    const forbidden = ['fetch', 'pull', 'push', 'ls-remote', 'clone', 'remote', 'submodule']
    for (const argv of calls) {
      expect([...CHECKOUT_GIT]).toContain(argv[0])
      for (const word of argv) expect(forbidden, word).not.toContain(word)
    }
    expect(await snapshot(root)).toEqual(before)
  })
})

describe('GET deployment/checkout', () => {
  it('answers the checkout view, and notGit for a directory that is no checkout', async () => {
    const root = await repository('routed', 'https://github.com/acme/widgets.git')
    const answer = await serve(new Checkout(root))('deployment/checkout')
    expect(answer.status).toBe(200)
    expect(answer.body).toEqual(JSON.parse(JSON.stringify(await new Checkout(root).status())))
    const plain = join(dir, 'plain-route')
    mkdirSync(plain)
    const refused = await serve(new Checkout(plain))('deployment/checkout')
    expect(refused).toEqual({ status: 200, body: { path: plain, repository: null, branch: null, head: null, dirty: false, available: false,
      reasons: ['notGit'], restartRequired: false } })
  })
})
