/** Lifecycle, prompt/tool/skill decoration, message delivery, and budget retry tracking for orchestrator and worker DSH sessions. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import { scopeParentOf } from '@deepseek-ai/dsh-scope'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { dirname } from 'node:path'
import { z } from 'zod'
import { key, liveTicket, type Ticket } from '../core/index.ts'
import { mandateInstructions, ticketOfSession } from '../executor/dsh.ts'
import type { HealthEntry } from '../infra/health.ts'
import { AGENT_TOOLS, MAIN_TOOLS, ROUTER_PRESET, roleTools, WORKER_PRESET } from './agent-tools.ts'
import { Capabilities } from './capabilities.ts'
import { AgentDelivery, messageId } from './delivery.ts'
import type { Effects } from './effects.ts'
import { resolveExecutionStrategy, type ExecutionServices } from './execution-strategy.ts'
import type { Variable } from './execution-environment.ts'
import { RetryHealth } from './retry-health.ts'
import { initializeRoleModel, roleModel, workerRole } from './role-models.ts'
import { bundledSkills } from './skill-files.ts'
import { SKILL_PREFIX, type PromptVersion, type Prompts } from './prompts.ts'
import type { LocalDiscussion } from '../sources/local-format.ts'
import type { Store } from './store.ts'
import { KV } from '../kv.ts'
import type { RegisterTool, Tool } from './tools/tool.ts'

/** Host dependencies used by `Sessions`. */
export interface SessionsHost {
  /** DSH Cordis context: sessions, agents, persistence, and their events. */
  readonly context: Context
  readonly store: Pick<Store, 'tickets' | 'settings' | 'get' | 'set' | 'keys'>
  readonly prompts: Pick<Prompts, 'current' | 'version' | 'compose' | 'composeAlign' | 'composeDiscuss' | 'composeExecute' | 'composeAnswer' | 'skills'>
  readonly effects: Pick<Effects, 'enqueue' | 'handle' | 'idle' | 'pending'>
  /** The `models` health entry, which reports managed sessions waiting on a model-budget retry. */
  readonly health: HealthEntry
  readonly masterId: string
  readonly lifetime: AbortSignal
  closing(): boolean
  /** Execution environment variables for `ticket`, rendered into its worker's system prompt. */
  environment(ticket: Ticket): Variable[]
  /** Tools to register on the main Session (`ticket === undefined`) or on `ticket`'s worker Session. */
  tools(agent: Agent, ticket?: Ticket): Tool[]
}

/**
 * What Sessions registered for an agent it decorated: the releases of its prompt section, tools and skill scope, the scope
 * its skills are registered in, and the skills of one prompt revision; for a worker's subagent, only its tool limits.
 * `tools` recomputes the Session's tool restriction from the saved `agents` block, so a settings save reaches it.
 */
interface SessionBinding { disposers: (() => void)[]; scope?: Context; skills?: { revision: number; dispose: () => void }; subagent?: true
  /** Standard-mode plugins this Session mounts for its role, reconciled on every tool refresh and released with the binding. */
  capabilities?: Capabilities
  tools?: () => void }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** DSH's agent preset registry selected `agentPreset` for a Session. */
    'agent-preset/selected'(sessionId: string, agentPreset: string): void
  }
}
/** Tools a slice worker may not call before its feature-exec run starts, so it cannot spend its turn exploring first. */
const PRE_RUN_TOOLS = new Set(['bash', 'read', 'read_image', 'write', 'edit', 'glob', 'grep', 'web_search', 'web_fetch'])
/**
 * The only tools a Ticket's Q&A Session gets, in this order: reading its inherited conversation and the Ticket directory,
 * nothing that writes, runs or messages. The whitelist, not the permission, is what keeps the answer read-only.
 */
const ANSWER_TOOLS = ['read', 'read_image', 'glob', 'grep']
/** What the main Session is told when it would wait: what it waits for comes to it, and a waiting step holds back the next. */
const NO_WAIT = 'Reports, follow_up notices, new candidates and a background job\'s end with its output arrive by themselves as messages; '
  + 'end the turn instead of waiting for them.'
/** What a main Session under `standard` is told when its command would wait the shell's default. */
const DEFAULT_WAIT = 'This shell waits up to 60 seconds by default: pass timeoutMs of at most 30000, or run_in_background, '
  + 'as a waiting step holds back new candidates.'
/** `sleep` at a command position: the start, after ; & | ( { ! ` or a newline, or after a keyword or a command that runs it. */
const SLEEP = /(?:^|[;&|({!`\n]|\b(?:do|then|else|elif|if|while|until|time|exec|nohup|command|env)\s)\s*(?:\S*\/)?sleep\b/
/**
 * The main Session's guard: it refuses a bash command that runs sleep or asks to hold the step longer than 30 seconds, and a
 * job wait longer than 5 seconds. Under `standard`, as a main Session created before the router preset runs, the shell holds
 * a command 60 seconds and a job wait lasts 30 seconds by default, so a command needs a timeout or the background, and a
 * job wait its timeout; the router preset ends both after 5 seconds.
 */
function noWait({ name, arguments: input }: { name: string; arguments: unknown }, routed: () => boolean): string | undefined {
  const args = (input ?? {}) as { command?: unknown; timeoutMs?: unknown; run_in_background?: unknown; wait?: unknown; timeout_ms?: unknown }
  if (name === 'bash') {
    const sleeps = typeof args.command === 'string' && SLEEP.test(args.command)
    if (sleeps || typeof args.timeoutMs === 'number' && args.timeoutMs > 30_000) return NO_WAIT
    if (args.timeoutMs === undefined && args.run_in_background !== true && !routed()) return DEFAULT_WAIT
  }
  if (name === 'job_output' && args.wait === true && (typeof args.timeout_ms === 'number' ? args.timeout_ms > 5_000 : !routed())) return NO_WAIT
  return undefined
}

/**
 * Creates and decorates orchestrator and worker DSH `Agent` sessions with role models, system prompt sections from `Prompts`, runtime skills, and restricted tool sets.
 * `Runtime`, `DshExecutor`, `MasterAssessor`, `Settings`, and management routes/tools use it to ensure sessions, deliver deduplicated messages via `AgentDelivery`, and process ordered `relay` and `notice` effects.
 * Feeds session events into `RetryHealth` to report model budget waits on the `models` `HealthEntry`, and durably records which prompt revisions each session has worked under in `Store` (`KV.sessions.prompts`) to authorize prompt version reads.
 */
export class Sessions {
  private readonly agentDelivery: AgentDelivery
  /** Decorated agents mapped to their registered disposers and skill scope until the agent is disposed or `Sessions.dispose()` runs. */
  private readonly bindings = new Map<Agent, SessionBinding>()
  /** Answerer Sessions, by Session id, so decoration gives them the discussion prompt and read tools instead of a worker's. */
  private readonly answerers = new Map<string, LocalDiscussion>()
  private readonly retryHealth = new RetryHealth()
  private readonly ctx: Context
  /** Registers ordered `relay` and `notice` effect handlers that deliver to the main Session. */
  constructor(private readonly host: SessionsHost) {
    this.ctx = host.context
    this.agentDelivery = new AgentDelivery(host.context)
    // Deliver relays and notices to the main Session in the order they were queued.
    host.effects.handle('relay', ({ text }, requestId) => this.prompt(host.masterId, requestId, text, 'steer'), { ordered: true })
    host.effects.handle('notice', ({ value, summary }, name) => this.inject(name, value, summary), { ordered: true })
  }
  /** Subscribes to host agent and session events so newly created sessions are decorated and model-budget retries are reflected in health. Call once at startup. */
  install(): void {
    const ctx = this.ctx
    ctx.on('agent/disposed', ({ agent }) => {
      this.release(agent)
      this.retryHealth.clear(agent.id); this.updateModelHealth()
    })
    ctx.on('session/event', (session, event) => {
      const agent = ctx.agents.get(session.id)
      const binding = agent && agent.session === session ? this.bindings.get(agent) : undefined
      if (!agent || !binding || binding.subagent) return
      this.retryHealth.observe(agent.id, event)
      this.updateModelHealth()
    })
    ctx.on('agent/created', async ({ agent }) => { await this.decorate(agent); return undefined })
    // Opening a Session in DSH's Web UI before its first turn may select the default preset for it: select ours again. After
    // its first turn DSH refuses any selection, which leaves it as it is.
    ctx.inject(['agentPresets'], child => {
      child.on('agent-preset/selected', (sessionId, preset) => {
        const ticketId = ticketOfSession(sessionId), agent = ctx.agents.get(sessionId as SessionId)
        const ours = sessionId === this.host.masterId ? ROUTER_PRESET
          : this.answerers.has(sessionId) || ticketId && this.host.store.tickets.get(ticketId) ? WORKER_PRESET : undefined
        if (!ours || preset === ours || !agent) return
        const presets = child.get('agentPresets') as { select(agent: Agent, preset: string): Promise<string> }
        presets.select(agent, ours).catch(() => {})
      })
    })
    ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'idle' && !this.host.closing()) { this.retryHealth.clear(agent.id); this.updateModelHealth() }
    })
  }
  /**
   * Resolves or creates session `id` in workspace `cwd`, initializes its role model, decorates it with prompts/skills/tools,
   * sets `danger-full-access` permissions, and renames it to `title`. An `answerer` marks the Session as a discussion's own
   * Answerer, which is decorated read-only and never holds a Ticket.
   */
  async ensure(id: string, cwd: string, title: string, role: 'orchestrator' | 'worker', answerer?: LocalDiscussion): Promise<Agent> {
    const ctx = this.ctx
    if (answerer) this.answerers.set(id, answerer)
    let result = await ctx.sessionController.resolveAgent(id as SessionId)
    if ('error' in result && result.error.code === 'session/not-found') {
      const workspace = await ctx.workspaceRegistry.create(cwd)
      // A Session keeps the preset it was created with, one of the bundle's own (cordis.patch.yml).
      await ctx.sessionController.create({ sessionId: id as SessionId, workspaceId: workspace.id,
        agentPreset: role === 'worker' ? WORKER_PRESET : ROUTER_PRESET })
      result = await ctx.sessionController.resolveAgent(id as SessionId)
    }
    if ('error' in result) throw result.error
    const settings = this.host.store.settings()
    await initializeRoleModel(ctx, result.agent, role === 'orchestrator' ? roleModel(settings, 'main')
      : roleModel(settings, answerer ? 'aligner' : workerRole(this.ticketFor(id))))
    await this.decorate(result.agent)
    ctx.permissionPresets.set(result.agent.session, 'danger-full-access')
    await ctx.sessionController.rename({ sessionId: id as SessionId, title })
    return result.agent
  }
  /** Resolves or creates one discussion's Answerer Session in its own workspace, decorated read-only under the discussion's prompt. */
  async ensureAnswerer(id: string, cwd: string, title: string, discussion: LocalDiscussion): Promise<Agent> {
    return await this.ensure(id, cwd, title, 'worker', discussion)
  }
  /**
   * Decorates a Session forked from a Ticket's worker Session so it answers one question about that Ticket: the answer
   * prompt in place of the worker preset's, exactly `read`, `read_image`, `glob` and `grep`, the executor role's model, and
   * `danger-full-access` so those reading tools reach the Ticket directory. The whitelist is the read-only boundary; the
   * question port archives the Session after the answer, and `agent/disposed` releases these registrations.
   */
  async answer(sessionId: SessionId, ticket: Ticket): Promise<Agent> {
    const ctx = this.ctx
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if ('error' in resolved) throw resolved.error
    const agent = resolved.agent
    // Read inherited tools through the parent scope, as `workOnly` does; a missing one fails here rather than shrinking the whitelist.
    const parent = scopeParentOf(agent)
    const missing = ANSWER_TOOLS.filter(name => !agent.ctx.tools.get(name, parent))
    if (missing.length > 0) throw new Error(`dsh-superagent needs the Q&A Session's tools ${missing.join(', ')}, which this host does not provide`)
    await initializeRoleModel(ctx, agent, roleModel(this.host.store.settings(), 'executor'))
    const binding: SessionBinding = { disposers: [] }
    this.bindings.set(agent, binding)
    binding.disposers.push(agent.ctx.systemPrompt.section({ name: 'dsh-superagent-answer', order: 9999, complete: true, text: () => {
      const version = this.host.prompts.current()
      return `[dsh-superagent prompt revision ${version.revision}]\n${this.host.prompts.composeAnswer()}`
    } }))
    binding.disposers.push(agent.ctx.tools.restrict({ allow: [...ANSWER_TOOLS] }))
    ctx.permissionPresets.set(agent.session, 'danger-full-access')
    await ctx.sessionController.rename({ sessionId, title: `Ticket question · ${ticket.title}` })
    return agent
  }
  /** Returns whether `sessionId` already holds the message delivered under `requestId`, or `false` if the session does not exist. */
  async holds(sessionId: string, requestId: string): Promise<boolean> {
    const result = await this.ctx.sessionController.resolveAgent(sessionId as SessionId)
    return !('error' in result) && await this.agentDelivery.holds(result.agent, key(requestId))
  }
  /** Deliver a message once per request id: to the next turn, the current one, or `inject`ed with its label without waking the agent. */
  async prompt(sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | { inject: string }, authorize?: () => void,
    accepted?: () => void): Promise<void> {
    const result = await this.ctx.sessionController.resolveAgent(sessionId as SessionId)
    if ('error' in result) throw result.error
    await this.agentDelivery.send(result.agent, key(requestId), text, mode, this.host.lifetime, authorize, accepted)
  }
  /** The id of the message `prompt` delivers under `requestId`, which DSH's inbox events name it by. */
  promptedId(requestId: string): MessageId { return messageId(key(requestId)) }
  /** Enqueues a steering relay to the main Session; relays are durable and retried by `Effects` until delivered, at most once per `requestId`. */
  relay(requestId: string, text: string): void { this.host.effects.enqueue('relay', requestId, { text }) }
  /** Enqueues a durable background notice for injection into the main Session; a new notice with the same `name` replaces a still-waiting notice of that `name`. */
  notify(name: string, value: Record<string, unknown>, summary: string): void { this.host.effects.enqueue('notice', name, { value, summary }) }
  /** Waits for currently runnable `notice` effects to settle and returns `'injected'` if notice `name` has reached the main Session or `'pending'` if it is still queued. */
  async delivery(name: string): Promise<'injected' | 'pending'> {
    await this.host.effects.idle('notice')
    return this.host.effects.pending('notice', name) ? 'pending' : 'injected'
  }
  /** Injects a notice into the main Session without waking it; no-op if the main Session does not exist yet. */
  private async inject(name: string, value: Record<string, unknown>, summary: string): Promise<void> {
    const resolved = await this.ctx.sessionController.resolveAgent(this.host.masterId as SessionId)
    if ('error' in resolved) return
    // Deduplicate by notice name and payload hash so retries are idempotent while updated payloads still deliver.
    const text = JSON.stringify(value)
    await this.agentDelivery.send(resolved.agent, `notice:${name}:${key(text)}`, text, { inject: summary }, this.host.lifetime)
  }
  /** Returns the current prompt revision, the active prompt revision of each loaded Session, and whether the main Session still has a pending `'prompts'` notice. */
  status() {
    const { store, prompts, effects } = this.host
    const sessions = store.keys(KV.sessions.prompts).flatMap(name => {
      const sessionId = name.slice(KV.sessions.prompts.prefix.length), revision = store.get(name)?.at(-1)
      return this.ctx.agents.get(sessionId as SessionId) && revision !== undefined ? [{ sessionId, revision }] : []
    })
    return { revision: prompts.current().revision, sessions, notificationPending: effects.pending('notice', 'prompts') }
  }
  /** Returns the prompt version a Session runs under (the one bound on its latest model request, or the current version). */
  promptVersion(sessionId: string): PromptVersion {
    const revision = this.host.store.get(KV.sessions.prompts(sessionId))?.at(-1)
    return revision === undefined ? this.host.prompts.current() : this.host.prompts.version(revision)
  }
  /** Whether a Session is authorized to read `revision` (its active revision or any revision it previously ran under). */
  mayRead(sessionId: string, revision: number): boolean {
    return revision === this.promptVersion(sessionId).revision || (this.host.store.get(KV.sessions.prompts(sessionId)) ?? []).includes(revision)
  }
  /** Returns a tool registrar for `agent` that renders tool output as JSON text and attaches `output.image` as an image when present. */
  private registerTool(agent: Agent, binding: SessionBinding): RegisterTool {
    return (name, description, schema, execute) => {
      binding.disposers.push(agent.ctx.tools.register({ name, description, parameters: z.toJSONSchema(schema),
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => {
          const text = { type: 'text' as const, text: JSON.stringify(value) }
          const image = value && typeof value === 'object' && 'image' in value ? (value as { image: never }).image : undefined
          return image ? [text, { type: 'image' as const, attachment: image }] : [text]
        } },
        execute: (args, execution) => execute(schema.parse(args), execution.signal) }))
    }
  }
  /** Returns `sessionId`'s active model-budget retry state (`{ model_retry }`) for status listings, or `{}` when not waiting on one. */
  modelRetry(sessionId: string | undefined) {
    const retry = sessionId ? this.retryHealth.get(sessionId) : undefined
    return retry ? { model_retry: retry } : {}
  }
  private updateModelHealth(): void {
    const retries = this.retryHealth.list()
    this.host.health.set(retries.length
      ? { state: 'error', detail: retries.slice(0, 5).map(item => `${item.sessionId}: ${item.provider} is over its model budget; retried ${item.attempts} times, waiting since ${item.since}; the model and retry policy are unchanged`).join('; ') + (retries.length > 5 ? `; ${retries.length - 5} more Sessions` : ''), at: retries.at(-1)!.lastAt }
      : { state: 'ready', detail: 'No managed Session is waiting on a model budget retry' })
  }
  private ticketOf(agent: Agent): Ticket | undefined {
    return this.ticketFor(agent.id)
  }
  /** The Ticket a Session id names, `worker-<ticket id>`, or undefined for the main Session and any other Session. */
  private ticketFor(sessionId: string): Ticket | undefined {
    const ticketId = ticketOfSession(sessionId)
    return ticketId === undefined ? undefined : this.host.store.tickets.get(ticketId)
  }
  private async decorate(agent: Agent): Promise<void> {
    if (this.bindings.has(agent)) return
    const host = this.host
    const master = agent.id === host.masterId
    const ticket = master ? undefined : this.ticketOf(agent)
    const discussion = master ? undefined : this.answerers.get(agent.id)
    if (!master && !ticket && !discussion) { await this.limitSubagent(agent); return }
    const binding: SessionBinding = { disposers: [] }
    this.bindings.set(agent, binding)
    // The role's mounted capabilities come from this Session's own scope: enabled ones are loaded now, and the tool refresh
    // installed below reconciles them after a save.
    binding.capabilities = new Capabilities(agent.ctx)
    this.retryHealth.restore(agent.id, agent.session.snapshotEvents())
    if (agent.status === 'idle') this.retryHealth.clear(agent.id)
    this.updateModelHealth()
    // Disable variable interpolation so literal ${{ ... }} expressions in team prompts are preserved.
    binding.disposers.push(agent.ctx.systemPrompt.section({ name: 'dsh-superagent-policy', order: 9999, interpolate: false, text: context => {
      const version = this.promptFor(agent, context.signal !== undefined)
      const current = ticket && host.store.tickets.get(ticket.id)
      // A slice worker is told to run the execution strategy its Ticket pinned; any other worker implements directly.
      const strategy = current?.plan && resolveExecutionStrategy(current.plan, this.executionServices())
      const composed = master ? host.prompts.compose(version.config, 'orchestrator', current ? host.environment(current) : undefined)
        : discussion ? host.prompts.composeDiscuss(version.config, [])
        : current?.mode === 'align' ? host.prompts.composeAlign(version.config, host.environment(current))
        : strategy ? host.prompts.composeExecute(version.config, strategy.mode, host.environment(current))
        : host.prompts.compose(version.config, 'worker', current ? host.environment(current) : undefined)
      return `[dsh-superagent prompt revision ${version.revision}]\n${composed}\n${current ? mandateInstructions(current.mandate) : ''}`
    }, ...(master ? { complete: true } : {}) }))
    // A recreated skill scope (e.g. after the skills service restarts) starts empty, so reset `binding.skills` before rebinding.
    const skillScope = agent.ctx.inject(['skills'], scope => {
      binding.scope = scope
      binding.skills = undefined
      this.bindSkills(binding, host.prompts.current())
    })
    binding.disposers.push(() => { skillScope.dispose().catch((error: unknown) => { this.ctx.logger.warn('dsh-superagent could not release a skill scope: %s', String(error)) }) })
    await skillScope
    // Bail out if the agent was disposed while awaiting the skill scope.
    if (this.bindings.get(agent) !== binding) return
    const register = this.registerTool(agent, binding)
    if (!discussion) for (const tool of host.tools(agent, ticket)) register(tool.name, tool.description, tool.schema, tool.execute)
    if (master) {
      binding.disposers.push(...this.mainTools(agent, binding), agent.ctx.tools.guard(execution => noWait(execution, () => this.routed(agent))))
    } else if (discussion) {
      // The discussion Answerer reads the workspace and nothing else; the whitelist, not the permission, is the boundary.
      binding.disposers.push(...this.answerOnly(agent))
    } else {
      // An Executor Session keeps the profile's work tools it has, which DSH requires to be known; its own tools are not masked.
      binding.disposers.push(...this.workOnly(agent, ticket!, binding))
    }
    // The first turn must see the capabilities the role enables, not just the ones whose import happened to finish first.
    await binding.capabilities?.settle()
  }
  /**
   * The main Session's tools: its required core tools plus the tools of the plugins the saved `agents` block enables for it.
   * A plugin's tool is named only while this host provides it, so a name left in the block by an uninstalled plugin (such as
   * billion-context's compression tools, which arrive asynchronously, often after the Session exists) neither fails the
   * decoration nor admits anything else. The allow list is recomputed on DSH's unfiltered `tools/change`, and saving `agents`
   * recomputes it through the same binding. A new filter is installed before the old one is lifted: filters intersect, so the
   * old one would keep masking the tools the new list admits.
   */
  private mainTools(agent: Agent, binding: SessionBinding): (() => void)[] {
    const parent = scopeParentOf(agent)
    // Read through the parent scope like `workOnly` does: it includes the preset's and the host's global tools and bypasses
    // this Session's own restriction.
    const missing = AGENT_TOOLS.main.required.filter(name => !agent.ctx.tools.get(name, parent))
    if (missing.length > 0) throw new Error(`dsh-superagent needs the main Session's tools ${missing.join(', ')}, which this host does not provide`)
    const restrict = this.installTools(agent, binding, () => {
      const agents = this.host.store.settings().agents
      // Mounted capabilities register in this Session's own scope, so their tools never enter this allow list; the call only
      // keeps the mounted set in step with the saved block.
      binding.capabilities?.sync('main', agents)
      const tools = roleTools('main', agents)
      // A required tool was checked above, so it stays exactly as before; a plugin tool is dropped while its plugin is not
      // installed, instead of making `restrict` refuse a name it cannot resolve.
      return tools.filter(name => AGENT_TOOLS.main.required.includes(name) || agent.ctx.tools.get(name, parent))
    })
    const off = this.ctx.on('tools/change', () => binding.tools?.())
    return [restrict, off]
  }
  /**
   * Installs a Session's tool restriction from a computed allow list, and returns its disposer. Installing and lifting both
   * notify `tools/change`, even re-entrantly: this drains those notifications, so a change made while they run is not lost.
   * A rebuild that races a tool unregistering keeps the previous filter in force and lets the next change retry; only the
   * first install, which has no filter to fall back on, fails the decoration.
   */
  private installTools(agent: Agent, binding: SessionBinding, allow: () => string[]): () => void {
    // Undefined until a filter is installed, so an empty allow list still installs one instead of leaving the Session open.
    let current: string[] | undefined
    let release: (() => void) | undefined
    let applying = false
    let pending = false
    let disposed = false
    const refresh = () => {
      if (disposed) return
      if (applying) { pending = true; return }
      applying = true
      try {
        do {
          pending = false
          const next = allow()
          const applied = current
          // The filter just installed notifies again, and that recomputation settles here.
          if (applied !== undefined && next.length === applied.length && next.every((name, index) => name === applied[index])) continue
          let installed: (() => void) | undefined
          try { installed = agent.ctx.tools.restrict({ allow: next }) } catch (error) {
            if (!release) throw error
            this.ctx.logger.warn('dsh-superagent could not set a Session\'s tools: %s', String(error))
            continue
          }
          current = next
          const previous = release
          release = installed
          // The new filter is in force, so the old one can go now: lifting first would briefly unmask everything the old
          // filter hid.
          try { previous?.() } catch (error) {
            this.ctx.logger.warn('dsh-superagent could not lift a Session\'s previous tools restriction: %s', String(error))
          }
        } while (pending && !disposed)
      } finally { applying = false }
    }
    refresh()
    binding.tools = refresh
    return () => {
      // A late `tools/change`, or a refresh queued during this release, must not reinstall a filter on a released binding.
      disposed = true
      if (binding.tools === refresh) binding.tools = undefined
      release?.(); release = undefined
    }
  }
  /** Re-applies the saved `agents` block to every decorated Session, a worker's subagents included, from its next step. */
  agentsChanged(): void {
    for (const binding of this.bindings.values()) binding.tools?.()
  }
  /**
   * Whether a Session runs the router preset: as DSH's preset registry last selected it, read through the session projection
   * on a DSH whose registry has no `presetForSession`, else as it was created; `standard`, the safer caps, when unreadable.
   */
  private routed(agent: Agent): boolean {
    try {
      const presets = this.ctx.get('agentPresets') as { presetForSession?: (session: Agent['session']) => string | null } | undefined
      const projections = this.ctx.get('sessionProjections') as { stateOf?: (session: Agent['session'], key: string) => unknown } | undefined
      const selected = typeof presets?.presetForSession === 'function' ? presets.presetForSession(agent.session)
        : projections?.stateOf?.(agent.session, 'agentPreset')
      return (selected ?? agent.session.header.agentPreset) === ROUTER_PRESET
    } catch { return false }
  }
  /**
   * An Executor Session's tools: its required core tools plus the tools of the plugins its role enables, and none once its
   * ticket ended; the saved `agents` block reaches it at the next step after a save. A failed or blocked worker keeps its
   * tools, so a person may continue it in its Session; only
   * automated input waits (see the executor). A slice Ticket adds the execution tools and pre-run guard its pinned strategy
   * runs. Read inherited tools through the parent scope, which includes the preset's tools. The global view misses preset
   * tools; the agent's own view also includes local tools such as subagent, which restrict refuses to name.
   */
  private workOnly(agent: Agent, ticket: Ticket, binding: SessionBinding): (() => void)[] {
    const store = this.host.store
    const parent = scopeParentOf(agent)
    const current = () => store.tickets.get(ticket.id) ?? ticket
    const strategyOf = (now: Ticket) => now.plan ? resolveExecutionStrategy(now.plan, this.executionServices()) : undefined
    // The role follows the Ticket: an aligner Session uses the aligner's plugins, every other one the executor's.
    // Execution tools a slice's strategy adds never come from a plugin, so no `agents` save can turn them off.
    const allow = () => {
      const now = current()
      const agents = store.settings().agents
      binding.capabilities?.sync(workerRole(now), agents)
      const tools = [...roleTools(workerRole(now), agents), ...strategyOf(now)?.tools ?? []]
      return [...new Set(tools)].filter(name => agent.ctx.tools.get(name, parent))
    }
    const strategy = strategyOf(current())
    const featureExec = strategy?.preRunGuard && agent.ctx.tools.get('feature_exec_start', parent)
      ? this.ctx.get('featureExec') as { list(): readonly { flow: string; status: string; subject?: { issue?: { id?: string } } }[] } | undefined
      : undefined
    return [this.installTools(agent, binding, allow), agent.ctx.tools.guard((execution?: { name: string }) => {
      const now = store.tickets.get(ticket.id)
      if (!now || !liveTicket(now)) return 'Ticket ended; new work needs a new authorized ticket'
      if (featureExec && now.plan && execution?.name && PRE_RUN_TOOLS.has(execution.name)) {
        const issue = `${now.plan.issueId}:${now.plan.sliceId}`
        const started = featureExec.list().some(run => run.flow === 'execute' && run.status === 'active' && run.subject?.issue?.id === issue)
        if (!started) return 'Start this slice with feature_exec_start({flow:"execute"}) before inspecting or changing files.'
      }
      return undefined
    })]
  }
  /** The host services execution strategies run on: whether this host registered the feature-exec service. */
  private executionServices(): ExecutionServices { return { featureExec: this.ctx.get('featureExec') !== undefined } }
  /** Restricts an Answerer Session to the read-only tools, failing when this host does not provide them. */
  private answerOnly(agent: Agent): (() => void)[] {
    const parent = scopeParentOf(agent)
    // The aligner's own plugin switches narrow the read-only whitelist; a switch it disables removes its tool, not `read`.
    const enabled = new Set(roleTools('aligner', this.host.store.settings().agents))
    const allow = ANSWER_TOOLS.filter(name => enabled.has(name) && agent.ctx.tools.get(name, parent))
    if (!allow.includes('read')) throw new Error('dsh-superagent needs the discussion Answerer\'s read tool, which this host does not provide')
    return [agent.ctx.tools.restrict({ allow })]
  }
  /**
   * A subagent of an Executor Session, or of one of its subagents, which runs under DSH's `standard` preset with the worker's
   * permissions, gets the same work tools as the worker, and none once the worker's ticket ended. Any other agent is left as
   * it is.
   */
  private async limitSubagent(agent: Agent): Promise<void> {
    let parent = agent.session.header.parentSession
    // Up the subagents' parents to the worker, which are loaded while their subagents run.
    for (let depth = 0; parent !== undefined && ticketOfSession(parent) === undefined && depth < 8; depth++) {
      parent = this.ctx.agents.get(parent)?.session.header.parentSession
    }
    const ticketId = parent === undefined ? undefined : ticketOfSession(parent)
    const ticket = ticketId === undefined ? undefined : this.host.store.tickets.get(ticketId)
    if (!ticket) return
    // A subagent inherits its worker's tools without a role of its own, and follows a save through the same binding. Its
    // capability set follows the same role, so a capability the executor enabled is mounted in the subagent too.
    const binding: SessionBinding = { disposers: [], subagent: true }
    this.bindings.set(agent, binding)
    binding.capabilities = new Capabilities(agent.ctx)
    binding.disposers.push(...this.workOnly(agent, ticket, binding))
    await binding.capabilities.settle()
  }
  /** Register the skills of a prompt version in the agent's skill scope, in place of an earlier version's. */
  private bindSkills(binding: SessionBinding, version: PromptVersion): void {
    const { scope, skills: previous } = binding
    if (!scope || previous?.revision === version.revision) return
    previous?.dispose()
    const disposers: (() => void)[] = []
    for (const [name, content] of this.host.prompts.skills(version.config)) {
      const bundled = name === 'feishu' || name === 'github' ? bundledSkills[name] : undefined
      const body = version.config.skills[name] ?? ''
      const description = bundled?.description ?? (body.replace(/\s+/g, ' ').slice(0, 120) || 'Custom dsh-superagent operational skill.')
      disposers.push(scope.skills.register({ name: `${SKILL_PREFIX}${name}`, description, content, source: 'runtime',
        ...(bundled ? { resourceBase: { kind: 'directory' as const, path: dirname(bundled.path) } } : {}) }))
    }
    binding.skills = { revision: version.revision, dispose: () => { disposers.forEach(dispose => dispose()) } }
  }
  /** Return the current prompt version, updating the agent's skills and recording the revision in Store when bound to a model request. */
  private promptFor(agent: Agent, bind: boolean): PromptVersion {
    const version = this.host.prompts.current()
    if (!bind) return version
    const binding = this.bindings.get(agent)
    if (binding) this.bindSkills(binding, version)
    const { store } = this.host
    const revisions = store.get(KV.sessions.prompts(agent.id)) ?? []
    const bound = [...revisions.filter(revision => revision !== version.revision), version.revision]
    if (revisions.at(-1) !== version.revision) store.set(KV.sessions.prompts(agent.id), bound)
    return version
  }
  /** Releases registrations for `agent` in reverse order (LIFO); disposing its skill scope releases its skills as well. */
  private release(agent: Agent): void {
    this.answerers.delete(agent.id)
    const binding = this.bindings.get(agent)
    if (!binding) return
    this.bindings.delete(agent)
    binding.skills?.dispose()
    // Unmount first: the mounted tools must go with the capability set, before the tool filters below are lifted.
    binding.capabilities?.stop()
    for (const dispose of binding.disposers.splice(0).reverse()) {
      try { dispose() } catch (error) { this.ctx.logger.warn('dsh-superagent could not release what it registered for a Session: %s', String(error)) }
    }
  }
  /** Releases prompt sections, skills, and tools registered by `Sessions` across all decorated agents. */
  dispose(): void { for (const agent of [...this.bindings.keys()]) this.release(agent) }
}
