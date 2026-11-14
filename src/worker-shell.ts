/** Worker shell executor: injects dsh-superagent's isolated gh/git environment without mutating the host process environment. */
import type { Context } from '@deepseek-ai/cordis'
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox'
import type { Config as SandboxConfig } from '@deepseek-ai/dsh-bash-sandbox'
import type { ShellExecRequest, ShellExecSpec } from '@deepseek-ai/dsh-shell'

export const name = 'dsh-superagent/worker-shell'
export const inject = [...SandboxBashExecutor.inject, 'dshSuperagentWorkerEnv']
export const Config = SandboxBashExecutor.Config

/** The environment provider exposed by the main dsh-superagent plugin. */
export interface WorkerEnvironment {
  /** The environment of the calling Session's ticket chain; without one, the deployment's primary chain. */
  environment(sessionId?: string): Record<string, string>
}

/** The Session a shell execution belongs to, when the caller provided DSH's managed environment. */
export const sessionOf = (request: Pick<ShellExecRequest, 'dshEnv'>): string | undefined => request.dshEnv?.DSH_SESSION_ID

/** The resolved spec with the worker environment of `sessionId` applied over the caller's own environment. */
export function withWorkerEnvironment(spec: ShellExecSpec, provider: WorkerEnvironment | undefined, sessionId?: string): ShellExecSpec {
  const environment = provider?.environment(sessionId) ?? {}
  return { ...spec, env: { ...spec.env, ...environment } }
}

/** Bash executor used only by dsh-superagent worker Sessions. */
export class WorkerShell extends SandboxBashExecutor {
  /** Carry the worker-only environment of the calling Session's chain on every resolved command while preserving the inherited sandbox policy. */
  override resolve(request: ShellExecRequest): ShellExecSpec {
    const provider = this.ctx.get('dshSuperagentWorkerEnv') as WorkerEnvironment | undefined
    return withWorkerEnvironment(super.resolve(request), provider, sessionOf(request))
  }
}

/** Registers the worker shell as this preset's `ctx.shell`; the parent context supplies the environment provider. */
export function apply(ctx: Context, config: SandboxConfig): void {
  new WorkerShell(ctx, config)
}
