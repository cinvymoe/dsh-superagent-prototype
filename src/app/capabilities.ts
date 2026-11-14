/**
 * Runtime mounting of the standard-mode plugins a superagent role enables.
 *
 * A role's enabled `mount` plugins (`capabilityMounts` in `agent-tools.ts`) are not registered by the bundle's presets, so a
 * Session loads them itself: each one is mounted into the Agent's own scope, which
 *
 * - registers its tools in that scope's own layer, which `tools.restrict` cannot mask. The allow list therefore never names
 *   them (`roleTools` skips mounted plugins), and a disabled capability is simply absent — no tool, no system-prompt section;
 * - keeps everything the plugin brings (services, commands, prompt sections) out of the composition until it is mounted;
 * - drops it all again when the capability is switched off, because disposing the mounted fiber unregisters what it registered.
 *
 * Mounting is serialized per Session and idempotent: a settings save reconciles the mounted set, so toggling a capability in
 * the panel reaches a running Session at its next step without restarting the host.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentRole, AgentsConfig } from '../policy.ts'
import { capabilityMounts } from './agent-tools.ts'

/** One mounted plugin, as this module needs to unmount it. */
export interface CapabilityInstance { dispose(): unknown }
/** Loads and mounts one plugin module for the Session, resolving it the way the profile's loader would. */
export type CapabilityLoader = (module: string, config: Readonly<Record<string, unknown>>) => Promise<CapabilityInstance>
/** The cordis loader the profile runs, as this module reads it; absent in a host that loads plugins another way. */
interface LoaderService {
  internal?: { import(specifier: string, parentURL: string, attributes?: Record<string, string>): Promise<unknown> }
}
/** Build one capability loader whose modules resolve from the Session's `baseUrl` (the profile that loaded this bundle). */
export function contextCapabilityLoader(ctx: Context, warn: (message: string) => void): CapabilityLoader {
  return async (module, config) => {
    const namespace = await importModule(ctx, module)
    const plugin = (namespace as { default?: unknown } | undefined)?.default ?? namespace
    // A cordis plugin is either an apply function or an object carrying `apply` (the DSH tool packages export the latter).
    const applicable = typeof plugin === 'function' || (typeof plugin === 'object' && plugin !== null && typeof (plugin as { apply?: unknown }).apply === 'function')
    if (!applicable) throw new Error(`${module} does not export a cordis plugin`)
    // `ctx.plugin` validates the plugin's Config the way a loader entry does, and registers everything through this
    // Session's scope, so the tools land in the own layer that the allow list cannot hide.
    const fiber = ctx.plugin(plugin as never, config as never)
    return { dispose: () => fiber.dispose() }
  }
}
/**
 * Resolve a plugin module from the profile that loaded this bundle: the cordis loader's own importer first, which anchors
 * on `ctx.baseUrl`, then a `createRequire` fallback for a host without that service.
 */
async function importModule(ctx: Context, module: string): Promise<unknown> {
  const loader = ctx.get('loader') as LoaderService | undefined
  const baseUrl = ctx.baseUrl
  if (loader?.internal && baseUrl) return loader.internal.import(module, baseUrl, {})
  const require = createRequire(new URL('package.json', baseUrl ?? `file://${process.cwd()}/`))
  return import(pathToFileURL(fileURLToPath(require.resolve(module))).href)
}
/** Everything one Session's capability set needs, kept on its binding. */
export class Capabilities {
  private readonly load: CapabilityLoader
  private readonly warn: (message: string) => void
  /** Mounted capabilities by plugin id, so a reconcile unmounts only what the role no longer enables. */
  private readonly mounted = new Map<string, CapabilityInstance>()
  /** Ids that failed once: a broken module is reported once instead of on every save and step. */
  private readonly failed = new Set<string>()
  /** What the latest save asks for; a load that finishes late checks it, and can be superseded while it runs. */
  private wanted = new Set<string>()
  /** Mounts run one at a time: two overlapping reconciles would mount the same module twice. */
  private queue: Promise<void> = Promise.resolve()
  private stopped = false
  constructor(ctx: Context, options: { load?: CapabilityLoader; warn?: (message: string) => void } = {}) {
    this.warn = options.warn ?? (message => { ctx.logger.warn('%s', message) })
    this.load = options.load ?? contextCapabilityLoader(ctx, this.warn)
  }
  /** Reconcile the mounted set with the role's enabled capabilities; safe to call on every tool refresh. */
  sync(role: AgentRole, agents: AgentsConfig): void {
    if (this.stopped) return
    const mounts = capabilityMounts(role, agents)
    // Record the target first: a reconcile already running must see that its in-flight load was superseded.
    this.wanted = new Set(mounts.map(mount => mount.id))
    this.queue = this.queue.then(() => this.apply(mounts))
      .catch(error => { this.warn(`dsh-superagent could not reconcile a Session's capabilities: ${String(error)}`) })
  }
  /** Resolves once every queued reconcile finished; the runtime does not wait, tests and shutdown do. */
  settle(): Promise<void> {
    return this.queue
  }
  /** Unmount everything this Session mounted. Idempotent: a released binding may be stopped while a reconcile is queued. */
  stop(): void {
    this.stopped = true
    this.wanted.clear()
    for (const [id, instance] of [...this.mounted]) {
      this.mounted.delete(id)
      dispose(id, instance, this.warn)
    }
  }
  private async apply(mounts: { id: string; module: string; config: Readonly<Record<string, unknown>> }[]): Promise<void> {
    if (this.stopped) return
    for (const [id, instance] of [...this.mounted]) {
      if (this.wanted.has(id)) continue
      this.mounted.delete(id)
      dispose(id, instance, this.warn)
    }
    for (const mount of mounts) {
      if (this.stopped || !this.wanted.has(mount.id)) continue
      if (this.mounted.has(mount.id) || this.failed.has(mount.id)) continue
      let instance: CapabilityInstance
      try {
        instance = await this.load(mount.module, mount.config)
      } catch (error) {
        this.failed.add(mount.id)
        this.warn(`dsh-superagent could not mount the ${mount.id} capability (${mount.module}): ${String(error)}`)
        continue
      }
      // The Session may have been released, or the capability switched off, while the module was loading.
      if (this.stopped || !this.wanted.has(mount.id)) { dispose(mount.id, instance, this.warn); continue }
      this.mounted.set(mount.id, instance)
    }
  }
}
/** Dispose one mounted plugin, reporting instead of throwing: releasing a Session must not fail on one capability. */
function dispose(id: string, instance: CapabilityInstance, warn: (message: string) => void): void {
  try {
    const result = instance.dispose()
    if (result instanceof Promise) result.catch((error: unknown) => { warn(`dsh-superagent could not unmount the ${id} capability: ${String(error)}`) })
  } catch (error) { warn(`dsh-superagent could not unmount the ${id} capability: ${String(error)}`) }
}