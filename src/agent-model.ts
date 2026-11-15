/** The one implementation of each Agent role's effective model, shared by the runtime and the browser-safe panel bundle. */
import type { AgentRole, RoleModel, Settings } from './policy.ts'

/**
 * The model a role's new Session starts with: its own override, else the role's default. The Answerer inherits the worker's
 * effective model, so configuring the worker also moves an Answerer that sets no override of its own; an existing Session
 * keeps the model it started with, as `initializeRoleModel` leaves a Session that has run alone.
 */
export function roleModel(settings: Pick<Settings, 'agents' | 'eval' | 'executor'>, role: AgentRole): RoleModel | null {
  switch (role) {
    case 'main': return settings.agents.main.model ?? settings.eval.model
    case 'worker': return settings.agents.worker.model ?? settings.executor.model
    case 'answerer': return settings.agents.answerer.model ?? roleModel(settings, 'worker')
  }
}
