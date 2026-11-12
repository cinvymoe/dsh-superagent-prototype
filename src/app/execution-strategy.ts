/** The execution strategies a confirmed plan's slice runs, by the contract version its Ticket pins. */
import { EXECUTION_STRATEGY_REVISION, type ExecutionMode, type ExecutionStrategy, type Ticket } from '../core/index.ts'

/** The feature-exec execution tools a slice worker may call to run its pre-approved plan. */
const FEATURE_EXEC_TOOLS = ['feature_exec_flow', 'feature_exec_start', 'feature_exec_status', 'feature_exec_gate', 'feature_exec_advance',
  'feature_exec_plan', 'feature_exec_dispatch', 'feature_exec_close'] as const
/** What one mode of an execution contract version gives a slice worker, beyond the work tools every Executor Session has. */
interface StrategyDefinition {
  /** The execution tools added to the worker's work tools; none for a mode that implements the slice directly. */
  readonly tools: readonly string[]
  /** Whether the worker may not inspect or change files before its execution run exists. */
  readonly preRunGuard: boolean
  /** The host service the mode cannot run without. */
  readonly requires: 'featureExec' | 'none'
}
/** The strategies of each execution-contract version, by mode: a Ticket pins the version, which keeps its meaning. */
const STRATEGIES: Readonly<Record<string, Readonly<Record<ExecutionMode, StrategyDefinition>>>> = {
  [EXECUTION_STRATEGY_REVISION]: {
    'feature-exec': { tools: FEATURE_EXEC_TOOLS, preRunGuard: true, requires: 'featureExec' },
    native: { tools: [], preRunGuard: false, requires: 'none' },
  },
}
/** The host services an execution strategy depends on, as this installation registered them. */
export interface ExecutionServices {
  /** Whether the host registered the feature-exec service the `feature-exec` mode runs on. */
  readonly featureExec: boolean
}
/** The strategy a slice Ticket runs under here and now, after the version and host fallbacks. */
export interface ResolvedExecutionStrategy {
  readonly mode: ExecutionMode
  readonly version: string
  readonly tools: readonly string[]
  readonly preRunGuard: boolean
  /** Why another mode runs than the one the Ticket pinned, when a host service was missing. */
  readonly degraded?: 'featureExec-unavailable'
}
/** Whether `mode` names a strategy of `version`: text an outside writer stored is not trusted to. */
const knownMode = (version: string, mode: string): mode is ExecutionMode => Object.hasOwn(STRATEGIES[version]!, mode)
/**
 * Resolve the execution strategy a Ticket's plan pins.
 *
 * A Ticket dispatched before strategies were pinned has no `execution` and keeps running the feature-exec flow, as it did
 * then. A version this installation does not know falls back to the current contract, and a host that did not register the
 * feature-exec service degrades that mode to native, so no worker is told about tools or a guard that cannot exist.
 */
export function resolveExecutionStrategy(plan: NonNullable<Ticket['plan']>, services: ExecutionServices): ResolvedExecutionStrategy
/** Resolve the strategy of a Ticket's plan, or `undefined` for a Ticket without a plan. */
export function resolveExecutionStrategy(plan: Ticket['plan'], services: ExecutionServices): ResolvedExecutionStrategy | undefined
export function resolveExecutionStrategy(plan: Ticket['plan'], services: ExecutionServices): ResolvedExecutionStrategy | undefined {
  if (!plan) return undefined
  const pinned: ExecutionStrategy = plan.execution ?? { mode: 'feature-exec', version: EXECUTION_STRATEGY_REVISION }
  const version = Object.hasOwn(STRATEGIES, pinned.version) ? pinned.version : EXECUTION_STRATEGY_REVISION
  const pinnedMode = knownMode(version, pinned.mode) ? pinned.mode : 'feature-exec'
  const degraded = STRATEGIES[version]![pinnedMode].requires === 'featureExec' && !services.featureExec
  const mode: ExecutionMode = degraded ? 'native' : pinnedMode
  const resolved = STRATEGIES[version]![mode]
  return { mode, version, tools: resolved.tools, preRunGuard: resolved.preRunGuard,
    ...degraded ? { degraded: 'featureExec-unavailable' as const } : {} }
}
