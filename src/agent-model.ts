/** The one implementation of each Agent role's effective model, shared by the runtime and the browser-safe panel bundle. */
import type { AgentRole, RoleModel, Settings } from './policy.ts'

/**
 * The model a role's new Session starts with: its own override, else the role's default. An aligner inherits the executor's
 * effective model, so configuring the executor also moves an aligner that sets no override of its own; an existing Session
 * keeps the model it started with, as `initializeRoleModel` leaves a Session that has run alone.
 */
export function roleModel(settings: Pick<Settings, 'agents' | 'eval' | 'executor'>, role: AgentRole): RoleModel | null {
  switch (role) {
    case 'main': return settings.agents.main.model ?? settings.eval.model
    case 'executor': return settings.agents.executor.model ?? settings.executor.model
    case 'aligner': return settings.agents.aligner.model ?? roleModel(settings, 'executor')
  }
}
