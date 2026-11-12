/** The execution-strategy seam: what a slice Ticket's worker gets when its plan pins native or feature-exec. */
import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXECUTION_STRATEGY_REVISION, type Ticket } from '../src/core/index.ts'
import { resolveExecutionStrategy } from '../src/app/execution-strategy.ts'
import { Prompts, defaultPrompts } from '../src/app/prompts.ts'
import { Sessions } from '../src/app/sessions.ts'
import { Store } from '../src/app/store.ts'
import { executePrompt, nativeExecutePrompt } from '../src/app/context.ts'

type Plan = NonNullable<Ticket['plan']>
const plan = (execution?: Plan['execution']): Plan =>
  ({ issueId: 'q-1', sliceId: 'C1', acceptance: ['typecheck passes'], ...execution ? { execution } : {} })
const ticket = (execution?: Plan['execution'], ended = false): Ticket => ({ id: 'ticket-1', title: 'C1 · slice', decisionId: 'd', mandate: {} as never,
  channels: [], assignments: [], inputs: [], undelivered: [], createdAt: '', updatedAt: '', origin: { triggerId: 't', triggerIds: ['t'] }, plan: plan(execution),
  ...ended ? { ended: { at: '', by: 'human', outcome: 'stopped' as const } } : {} })
const FEATURE_EXEC = ['feature_exec_flow', 'feature_exec_start', 'feature_exec_status', 'feature_exec_gate', 'feature_exec_advance',
  'feature_exec_plan', 'feature_exec_dispatch', 'feature_exec_close']
const serves = { featureExec: true }, bare = { featureExec: false }, native = { mode: 'native' as const, version: EXECUTION_STRATEGY_REVISION }
const featureExec = { mode: 'feature-exec' as const, version: EXECUTION_STRATEGY_REVISION }
/** The tools of a Session's scope as `workOnly` restricted it, and the guard it installed. */
interface Restricted { allow?: readonly string[]; guard?: (execution?: { name: string }) => string | undefined }
/**
 * Run `Sessions.workOnly` for `ticket` on a host that registered (or did not register) the feature-exec service, and return what
 * it restricted the Session's tools to. The ticket is its own store record, so the guard sees the live ticket.
 */
function restricted(ticket: Ticket, featureExecService: boolean): Restricted {
  const received: Restricted = {}
  const context = new Context()
  if (featureExecService) context.reflect.provide('featureExec', { list: () => [] })
  const agentContext = new Context()
  agentContext.reflect.provide('tools', { get: (name: string) => ({ name }), register: () => () => {},
    restrict: (spec: { allow: readonly string[] }) => { received.allow = spec.allow; return () => {} },
    guard: (guard: (execution?: { name: string }) => string | undefined) => { received.guard = guard; return () => {} } })
  const sessions = new Sessions({ context, store: { tickets: { get: (id: string) => id === ticket.id ? ticket : undefined } },
    effects: { handle: () => {} }, health: { set: () => {} }, masterId: 'master', lifetime: new AbortController().signal,
    closing: () => false, environment: () => [], tools: () => [] } as never)
  ;(sessions as unknown as { workOnly(agent: unknown, ticket: Ticket): void }).workOnly({ id: 'worker-1', ctx: agentContext }, ticket)
  return received
}
function withStore(body: (prompts: Prompts) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'execution-strategy-')), store = new Store(join(dir, 'db'))
  try { body(new Prompts(store, () => 100000, () => undefined, () => false)) } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
}

describe('resolving the strategy a slice Ticket pinned', () => {
  it('keeps a Ticket dispatched before strategies were pinned on the feature-exec flow, as it ran then', () => {
    const strategy = resolveExecutionStrategy(plan(), serves)!
    expect(strategy).toMatchObject({ mode: 'feature-exec', version: EXECUTION_STRATEGY_REVISION, preRunGuard: true, tools: FEATURE_EXEC })
    expect(strategy.degraded).toBeUndefined()
  })
  it('gives a native slice no execution tool and no pre-run guard', () => {
    const strategy = resolveExecutionStrategy(plan(native), serves)!
    expect(strategy).toMatchObject({ mode: 'native', version: EXECUTION_STRATEGY_REVISION, preRunGuard: false, tools: [] })
    expect(strategy.tools.some(name => name.startsWith('feature_exec_'))).toBe(false)
  })
  it('resolves a pinned feature-exec slice exactly as the legacy one, so its tools, guard and prompt do not change', () => {
    expect(resolveExecutionStrategy(plan(featureExec), serves)).toEqual(resolveExecutionStrategy(plan(), serves))
  })
  it('falls back to the current contract for a version this installation does not know', () => {
    expect(resolveExecutionStrategy(plan({ mode: 'native', version: 'execution-v9' }), serves))
      .toMatchObject({ mode: 'native', version: EXECUTION_STRATEGY_REVISION, tools: [] })
    expect(resolveExecutionStrategy(plan({ mode: 'feature-exec', version: 'execution-v9' }), serves))
      .toMatchObject({ mode: 'feature-exec', version: EXECUTION_STRATEGY_REVISION, tools: FEATURE_EXEC })
  })
  it('falls back to feature-exec for a mode the contract does not name, as for a Ticket that pinned nothing', () => {
    expect(resolveExecutionStrategy(plan({ mode: 'future' as never, version: EXECUTION_STRATEGY_REVISION }), serves)!.mode).toBe('feature-exec')
  })
  it('has no strategy for a Ticket without a plan, such as an aligner', () => {
    expect(resolveExecutionStrategy(undefined, serves)).toBeUndefined()
    expect(resolveExecutionStrategy(undefined, bare)).toBeUndefined()
  })
  it('degrades feature-exec to native when the host did not register its service, and leaves native as it is', () => {
    for (const pinned of [plan(), plan(featureExec)]) {
      expect(resolveExecutionStrategy(pinned, bare)).toMatchObject({ mode: 'native', version: EXECUTION_STRATEGY_REVISION, tools: [],
        preRunGuard: false, degraded: 'featureExec-unavailable' })
    }
    expect(resolveExecutionStrategy(plan(native), bare)).toMatchObject({ mode: 'native', tools: [] })
    expect(resolveExecutionStrategy(plan(native), bare)!.degraded).toBeUndefined()
  })
})

describe('the worker a slice Ticket gets', () => {
  it('restricts a native slice to the work tools, with no feature_exec_* tool and no pre-run guard', () => {
    const { allow, guard } = restricted(ticket(native), true)
    expect(allow!.some(name => name.startsWith('feature_exec_'))).toBe(false)
    expect(allow).toContain('bash')
    expect(guard!({ name: 'read' })).toBeUndefined()
    expect(guard!({ name: 'bash' })).toBeUndefined()
  })
  it('keeps a feature-exec slice\'s tools and pre-run guard as they were', () => {
    const { allow, guard } = restricted(ticket(featureExec), true)
    expect(allow).toEqual(expect.arrayContaining(FEATURE_EXEC))
    // No execution run exists yet, so file and shell tools wait for it.
    expect(guard!({ name: 'read' })).toMatch(/feature_exec_start/)
    expect(guard!({ name: 'bash' })).toMatch(/feature_exec_start/)
    expect(guard!({ name: 'feature_exec_start' })).toBeUndefined()
  })
  it('keeps the legacy Ticket on feature-exec, and gives a host without the service a native worker', () => {
    expect(restricted(ticket(), true).allow).toEqual(expect.arrayContaining(FEATURE_EXEC))
    const { allow, guard } = restricted(ticket(), false)
    expect(allow!.some(name => name.startsWith('feature_exec_'))).toBe(false)
    expect(guard!({ name: 'read' })).toBeUndefined()
  })
  it('keeps refusing work once the Ticket ended', () => {
    expect(restricted(ticket(native, true), true).guard!({ name: 'read' })).toBe('Ticket ended; new work needs a new authorized ticket')
  })
})

describe('the slice worker\'s prompt', () => {
  it('tells a native slice to implement the approved plan directly and deliver a PR, without naming feature-exec', () => {
    withStore(prompts => {
      const prompt = prompts.composeExecute(defaultPrompts(), 'native')
      expect(prompt.endsWith(nativeExecutePrompt)).toBe(true)
      expect(prompt).not.toContain('feature_exec')
      expect(prompt).toContain('Implement it directly: do not reopen the requirement, discuss it again, or decompose it into tasks.')
      expect(prompt).toContain('Open the PR against the deployment repository')
    })
  })
  it('keeps a feature-exec slice on the execution handoff, which still starts its run first', () => {
    withStore(prompts => {
      const prompt = prompts.composeExecute(defaultPrompts(), 'feature-exec')
      expect(prompt.endsWith(executePrompt)).toBe(true)
      expect(prompt).toContain('feature_exec_start')
      expect(prompt).not.toContain('native execution strategy')
      // Every existing caller passes no mode and keeps the feature-exec handoff.
      expect(prompts.composeExecute(defaultPrompts())).toBe(prompt)
    })
  })
})
