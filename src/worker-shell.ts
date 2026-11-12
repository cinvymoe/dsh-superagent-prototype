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
  environment(): Record<string, string>
}

/** Bash executor used only by dsh-superagent worker Sessions. */
export class WorkerShell extends SandboxBashExecutor {
  /** Carry the worker-only environment on every resolved command while preserving the inherited sandbox policy. */
  override resolve(request: ShellExecRequest): ShellExecSpec {
    const spec = super.resolve(request)
    const provider = this.ctx.get('dshSuperagentWorkerEnv') as WorkerEnvironment | undefined
    const environment = provider?.environment() ?? {}
    return { ...spec, env: { ...spec.env, ...environment } }
  }
}

/** Registers the worker shell as this preset's `ctx.shell`; the parent context supplies the environment provider. */
export function apply(ctx: Context, config: SandboxConfig): void {
  new WorkerShell(ctx, config)
}
