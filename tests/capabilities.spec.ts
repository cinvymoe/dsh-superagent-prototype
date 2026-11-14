/**
 * A Session's mounted capabilities: the plugins a role enables are loaded into the Session's own scope on the first refresh,
 * reconciled when a save changes the enabled set, and disposed with the Session.
 */
import { expect, it, vi } from 'vitest'
import { AgentsConfigSchema, type AgentRole, type AgentsConfig } from '../src/policy.ts'
import type { Context } from '@deepseek-ai/cordis'
import { Capabilities, contextCapabilityLoader, type CapabilityInstance } from '../src/app/capabilities.ts'

const ctx = {} as Context
// The default plugin surface enables no capability, so every mount below is one the test switched on.
const emptyAgents = AgentsConfigSchema.parse({})
const withPlugins = (role: AgentRole, ...ids: string[]) =>
  ({ ...emptyAgents, [role]: { ...emptyAgents[role], enabledPlugins: [...emptyAgents[role].enabledPlugins.filter(id => !ids.includes(id)), ...ids] } })
/** A loader that records every mount and hands back a dispose spy, so the test sees exactly what a Session loaded. */
function recordingLoader() {
  const loaded: string[] = []
  const disposed: string[] = []
  const load = vi.fn(async (module: string): Promise<CapabilityInstance> => {
    loaded.push(module)
    return { dispose: () => { disposed.push(module) } }
  })
  return { load, loaded, disposed }
}

it('mounts what a role enables, keeps it mounted across refreshes, and unmounts what a save switches off', async () => {
  const loader = recordingLoader()
  const warn = vi.fn()
  const capabilities = new Capabilities(ctx, { load: loader.load, warn })
  const enabled = withPlugins('executor', 'ask-user', 'web-fetch')
  capabilities.sync('executor', enabled)
  // A second refresh with the same block mounts nothing again: a save that changes something else is not a remount.
  capabilities.sync('executor', enabled)
  await capabilities.settle()
  expect(loader.loaded).toEqual(['@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-web'])
  expect(loader.load.mock.calls[1]).toEqual(['@deepseek-ai/dsh-tool-web', { search: false, fetch: true }])
  // Switching one off unmounts only that one; the other keeps the instance it already had.
  capabilities.sync('executor', withPlugins('executor', 'ask-user'))
  await capabilities.settle()
  expect(loader.disposed).toEqual(['@deepseek-ai/dsh-tool-web'])
  expect(loader.load).toHaveBeenCalledTimes(2)
  expect(warn).not.toHaveBeenCalled()
})

it('stops with the Session and never mounts anything after it was released', async () => {
  const loader = recordingLoader()
  const capabilities = new Capabilities(ctx, { load: loader.load, warn: vi.fn() })
  capabilities.sync('main', withPlugins('main', 'present'))
  await capabilities.settle()
  capabilities.stop()
  expect(loader.disposed).toEqual(['@deepseek-ai/dsh-tool-present'])
  // A tool refresh that races the release must not mount into a disposed scope.
  capabilities.sync('main', withPlugins('main', 'present', 'ask-user'))
  await capabilities.settle()
  expect(loader.load).toHaveBeenCalledTimes(1)
})

it('reports a module that fails once and does not retry it on every refresh', async () => {
  const warn = vi.fn()
  const load = vi.fn(async (module: string): Promise<CapabilityInstance> => {
    if (module.endsWith('dsh-tool-present')) throw new Error('module not installed')
    return { dispose: vi.fn() }
  })
  const capabilities = new Capabilities(ctx, { load, warn })
  capabilities.sync('executor', withPlugins('executor', 'present'))
  await capabilities.settle()
  // A module this host cannot load is reported once, with the capability it belonged to, and is not retried on a refresh.
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('present capability (@deepseek-ai/dsh-tool-present)'))
  capabilities.sync('executor', withPlugins('executor', 'present'))
  await capabilities.settle()
  expect(load).toHaveBeenCalledTimes(1)
})

it('disposes a module that finishes loading after the capability was switched off', async () => {
  let finish: ((instance: CapabilityInstance) => void) | undefined
  const load = vi.fn(async (): Promise<CapabilityInstance> => new Promise(resolve => { finish = resolve }))
  const capabilities = new Capabilities(ctx, { load, warn: vi.fn() })
  const enabled = withPlugins('executor', 'fork-subagent')
  capabilities.sync('executor', enabled)
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  // The person switches the capability off while its module is still loading: the late instance must not stay live.
  capabilities.sync('executor', withPlugins('executor'))
  const instance = { dispose: vi.fn() }
  finish!(instance)
  await capabilities.settle()
  expect(instance.dispose).toHaveBeenCalledTimes(1)
})
it('loads the object-style plugin a DSH tool package exports and mounts it through ctx.plugin', async () => {
  const dispose = vi.fn()
  const plugin = { name: 'tool-example', apply: () => {} }
  const importModule = vi.fn(async () => plugin)
  const pluginMount = vi.fn(() => ({ dispose }))
  const fake = {
    baseUrl: 'file:///root/.dsh/profiles/example/',
    get: (name: string) => name === 'loader' ? { internal: { import: importModule } } : undefined,
    plugin: pluginMount,
  } as unknown as Context
  const instance = await contextCapabilityLoader(fake, vi.fn())('@deepseek-ai/dsh-tool-ask-user', { mode: 'legacy' })
  expect(importModule).toHaveBeenCalledWith('@deepseek-ai/dsh-tool-ask-user', 'file:///root/.dsh/profiles/example/', {})
  expect(pluginMount).toHaveBeenCalledWith(plugin, { mode: 'legacy' })
  instance.dispose()
  expect(dispose).toHaveBeenCalled()
})
