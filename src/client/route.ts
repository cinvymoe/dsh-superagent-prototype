/** Typed panel routes, route parser, and sessionStorage location history. */
import { THREAD_FILTERS, TICKET_FILTERS, type ThreadFilter, type TicketFilter } from '../app/api.ts'
import type { SetupPlace } from '../setup.ts'
import { DECISION_FILTERS, type DecisionFilter } from './api.ts'
import type { T } from './text.ts'

export const TABS = ['overview', 'discussions', 'newRequirement', 'requirements', 'source', 'trigger', 'eval', 'execution', 'settings'] as const
export type Tab = typeof TABS[number]
export const REQUIREMENT_FILTERS = ['pending', 'confirmed', 'closed', 'all'] as const
export type RequirementFilter = typeof REQUIREMENT_FILTERS[number]
export const SETTINGS_GROUPS = ['source', 'eval', 'execution', 'agents', 'prompts', 'deployment'] as const
export type SettingsGroup = typeof SETTINGS_GROUPS[number]
export type Route = { page: 'overview' | 'source'; id?: undefined; query?: undefined }
  | { page: 'discussions'; id?: undefined; query?: undefined }
  | { page: 'discussions'; id: string; query?: undefined }
  // A New requirement page opened from a discussion carries that discussion, so its text prefills the form.
  | { page: 'newRequirement'; discussion?: string; id?: undefined; query?: undefined }
  | { page: 'requirements'; id?: undefined; create?: true; edit?: undefined; query?: { filter?: RequirementFilter } }
  | { page: 'requirements'; id?: undefined; create?: undefined; edit: string; query?: undefined }
  | { page: 'requirements'; id: string; create?: undefined; edit?: undefined; query?: { filter?: RequirementFilter } }
  | { page: 'trigger'; id?: undefined; query?: { filter?: ThreadFilter } }
  | { page: 'trigger'; id: string; query?: { trigger?: string } }
  | { page: 'eval'; id?: undefined; query?: { filter?: DecisionFilter; window?: '24h' } }
  | { page: 'execution'; id?: undefined; query?: { filter?: TicketFilter } }
  | { page: 'execution'; id: string; query?: undefined }
  | { page: 'settings'; id?: undefined; query: { group: SettingsGroup; source?: string; version?: string } }
export const HOME: Route = { page: 'overview' }
export const settingsRoute = (group: SettingsGroup, query: { source?: string; version?: string } = {}): Route =>
  ({ page: 'settings', query: { group, ...query } })
export const setupPage = (place: SetupPlace): Route =>
  place === 'deployment' ? settingsRoute('deployment') : settingsRoute('source', { source: place })
export const routeLabel = (t: T, route: Route): string =>
  'create' in route && route.create ? t('discuss.newProject')
    : 'edit' in route && route.edit ? t('discuss.editProject')
    : route.id ? t(route.page === 'trigger' ? 'term.thread' : route.page === 'requirements' ? 'term.issue'
      : route.page === 'discussions' ? 'term.discussion' : 'term.ticket')
    : t(`tab.${route.page}`)

const pick = <V extends string>(values: readonly V[], value: unknown): V | undefined => values.find(item => item === value)
function compact<Q extends object>(query: Q): Q | undefined {
  const set = Object.entries(query).filter(([, value]) => value !== undefined)
  return set.length ? Object.fromEntries(set) as Q : undefined
}
/** Validate and normalize a stored route, dropping unrecognized query filters or removed tabs (such as the legacy `policy` tab). */
export function parseRoute(value: unknown): Route | undefined {
  const { page, id, query, create, edit, discussion } = (value ?? {}) as { page?: unknown; id?: unknown; create?: unknown;
    edit?: unknown; discussion?: unknown; query?: Record<string, unknown> }
  const text = (name: string) => typeof query?.[name] === 'string' ? query[name] as string : undefined
  const record = typeof id === 'string' && id ? id : undefined
  switch (page) {
    case 'overview': case 'source': return { page }
    // A discussion can prefill the New requirement page; without one the page is the plain blank form.
    case 'newRequirement': return typeof discussion === 'string' && discussion ? { page, discussion } : { page }
    case 'discussions': return record ? { page, id: record } : { page }
    // The legacy Discuss tab stays readable: its detail, create page and list map onto the requirement pages.
    case 'requirements': case 'discuss': {
      // Pending is the default bucket and canonical: it is never written into a saved route.
      const chosen = pick(REQUIREMENT_FILTERS, query?.filter)
      const filter = chosen === 'pending' ? undefined : chosen
      const kept = filter ? { query: { filter } } : {}
      return record ? { page: 'requirements', id: record, ...kept }
        : typeof edit === 'string' && edit ? { page: 'requirements', edit }
        : create === true ? { page: 'requirements', create: true } : { page: 'requirements', ...kept }
    }
    case 'trigger': return record ? { page, id: record, query: compact({ trigger: text('trigger') }) }
      : { page, query: compact({ filter: pick(THREAD_FILTERS, query?.filter) }) }
    case 'eval': return { page, query: compact({ filter: pick(DECISION_FILTERS, query?.filter),
      window: query?.window === '24h' ? '24h' as const : undefined }) }
    case 'execution': return record ? { page, id: record } : { page, query: compact({ filter: pick(TICKET_FILTERS, query?.filter) }) }
    case 'settings': return { page, query: { group: pick(SETTINGS_GROUPS, query?.group) ?? 'source',
      ...compact({ source: text('source'), version: text('version') }) } }
    default: return undefined
  }
}

const ROUTE_KEY = 'dsh-superagent/route'
export interface Location { route: Route; stack: Route[]; group?: SettingsGroup | undefined; project?: string | undefined }
export const lastSettingsGroup = ({ route, group }: Location): SettingsGroup => route.page === 'settings' ? route.query.group
  : group ?? 'source'
export function initialLocation(): Location {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ROUTE_KEY) ?? 'null') as { route?: unknown; stack?: unknown; group?: unknown;
      project?: unknown } | null
    const route = parseRoute(stored?.route)
    const stack = Array.isArray(stored?.stack) ? stored.stack as unknown[] : []
    const project = typeof stored?.project === 'string' && stored.project ? stored.project : undefined
    if (route) return { route, stack: stack.flatMap(item => parseRoute(item) ?? []), group: pick(SETTINGS_GROUPS, stored?.group),
      ...(project ? { project } : {}) }
  } catch (error) {
    // Route memory is a convenience; an unreadable value falls back to HOME.
    void error
  }
  return { route: HOME, stack: [] }
}
export function remember(location: Location): void {
  try { sessionStorage.setItem(ROUTE_KEY, JSON.stringify(location)) } catch (failure) { void failure /* Route memory is a convenience. */ }
}
