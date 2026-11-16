/** Typed panel routes, route parser, and sessionStorage location history. */
import { THREAD_FILTERS, TICKET_FILTERS, type ThreadFilter, type TicketFilter } from '../app/api.ts'
import type { SetupPlace } from '../setup.ts'
import { DECISION_FILTERS, type DecisionFilter } from './api.ts'
import type { T } from './text.ts'

export const TABS = ['overview', 'discussions', 'requirements', 'source', 'trigger', 'eval', 'execution', 'settings'] as const
export type Tab = typeof TABS[number]
export const REQUIREMENT_FILTERS = ['pending', 'confirmed', 'closed', 'all'] as const
export type RequirementFilter = typeof REQUIREMENT_FILTERS[number]
export const SETTINGS_GROUPS = ['source', 'eval', 'execution', 'projects', 'agents', 'prompts', 'deployment'] as const
export type SettingsGroup = typeof SETTINGS_GROUPS[number]
export type Route = { page: 'overview' | 'source'; id?: undefined; query?: undefined }
  | { page: 'discussions'; id?: undefined; query?: undefined }
  | { page: 'discussions'; id: string; query?: undefined }
  | { page: 'requirements'; id?: undefined; create?: true; query?: { filter?: RequirementFilter } }
  | { page: 'requirements'; id: string; create?: undefined; query?: { filter?: RequirementFilter } }
  | { page: 'trigger'; id?: undefined; query?: { filter?: ThreadFilter } }
  | { page: 'trigger'; id: string; query?: { trigger?: string } }
  | { page: 'eval'; id?: undefined; query?: { filter?: DecisionFilter; window?: '24h' } }
  | { page: 'execution'; id?: undefined; query?: { filter?: TicketFilter } }
  | { page: 'execution'; id: string; query?: undefined }
  | { page: 'settings'; id?: string; query: { group: SettingsGroup; source?: string; version?: string } }
export const HOME: Route = { page: 'overview' }
/** A settings page: the group, an optional record it names (a project's own page), and its own query values. */
export const settingsRoute = (group: SettingsGroup,
  query: { source?: string; version?: string; project?: string } = {}): Route => {
  const { project, ...rest } = query
  return { page: 'settings', ...(project ? { id: project } : {}), query: { group, ...rest } }
}
export const setupPage = (place: SetupPlace): Route =>
  place === 'deployment' ? settingsRoute('deployment') : settingsRoute('source', { source: place })
export const routeLabel = (t: T, route: Route): string =>
  'create' in route && route.create ? t('discuss.newProject')
    : route.id ? t(route.page === 'settings' ? 'settingsGroup.projects' : route.page === 'trigger' ? 'term.thread'
      : route.page === 'requirements' ? 'term.issue'
      : route.page === 'discussions' ? 'term.discussion' : 'term.ticket')
    : t(`tab.${route.page}`)

const pick = <V extends string>(values: readonly V[], value: unknown): V | undefined => values.find(item => item === value)
function compact<Q extends object>(query: Q): Q | undefined {
  const set = Object.entries(query).filter(([, value]) => value !== undefined)
  return set.length ? Object.fromEntries(set) as Q : undefined
}
/** Validate and normalize a stored route, dropping unrecognized query filters or removed tabs (such as the legacy `policy` tab). */
export function parseRoute(value: unknown): Route | undefined {
  const { page, id, query, create, edit } = (value ?? {}) as { page?: unknown; id?: unknown; create?: unknown;
    edit?: unknown; query?: Record<string, unknown> }
  const text = (name: string) => typeof query?.[name] === 'string' ? query[name] as string : undefined
  const record = typeof id === 'string' && id ? id : undefined
  switch (page) {
    case 'overview': case 'source': return { page }
    case 'discussions': return record ? { page, id: record } : { page }
    // The legacy New requirement tab is gone: its saved routes land on the requirement list, where creation now opens in
    // a dialog, so its id, create flag and discussion prefill no longer name a page.
    case 'newRequirement': return { page: 'requirements' }
    // The legacy Discuss tab stays readable: its list, detail and project edit pages are the requirement pages.
    case 'requirements': case 'discuss': {
      // Pending is the default bucket and canonical: it is never written into a saved route.
      const chosen = pick(REQUIREMENT_FILTERS, query?.filter)
      const filter = chosen === 'pending' ? undefined : chosen
      const kept = filter ? { query: { filter } } : {}
      // A project's stored edit route now opens that project's own page under Settings → Projects.
      if (edit !== undefined) return typeof edit === 'string' && edit
        ? { page: 'settings', id: edit, query: { group: 'projects' } }
        : { page: 'settings', query: { group: 'projects' } }
      return record ? { page: 'requirements', id: record, ...kept }
        : create === true ? { page: 'requirements', create: true } : { page: 'requirements', ...kept }
    }
    case 'trigger': return record ? { page, id: record, query: compact({ trigger: text('trigger') }) }
      : { page, query: compact({ filter: pick(THREAD_FILTERS, query?.filter) }) }
    case 'eval': return { page, query: compact({ filter: pick(DECISION_FILTERS, query?.filter),
      window: query?.window === '24h' ? '24h' as const : undefined }) }
    case 'execution': return record ? { page, id: record } : { page, query: compact({ filter: pick(TICKET_FILTERS, query?.filter) }) }
    case 'settings': return { page, ...(record ? { id: record } : {}), query: {
      group: pick(SETTINGS_GROUPS, query?.group) ?? 'source',
      ...compact({ source: text('source'), version: text('version') }) } }
    default: return undefined
  }
}

/** Query parameter that marks a URL as this panel's permalink and the value it must carry. */
export const PANEL_PARAM = 'panel'
export const PANEL_VALUE = 'dsh-superagent'
/** The browser's current URL search, empty outside a browser. */
export const currentSearch = (): string => typeof location === 'undefined' ? '' : location.search
/** Whether the address bar names this panel, either as a permalink or because the panel wrote it while mounted. */
export const panelRequested = (search: string): boolean => new URLSearchParams(search).get(PANEL_PARAM) === PANEL_VALUE
/**
 * Query parameter that asks for the panel alone: the shell's own columns are hidden, so a page opened from the title
 * bar's new-tab link reads as this panel rather than as the host it is mounted in.
 */
export const STANDALONE_PARAM = 'standalone'
export const standaloneRequested = (search: string): boolean => new URLSearchParams(search).get(STANDALONE_PARAM) === '1'
/**
 * Encode one route and the current project into the permalink parameters. Page names, record ids, filters, the
 * settings group and the project stay readable in the address bar; the project is only written when one is current.
 */
export function routeToSearch(route: Route, project?: string | undefined): URLSearchParams {
  const search = new URLSearchParams({ [PANEL_PARAM]: PANEL_VALUE, page: route.page })
  const id = 'id' in route ? route.id : undefined
  if (id) search.set('id', id)
  if ('create' in route && route.create === true) search.set('create', '1')
  const query = ('query' in route ? route.query : undefined) as Record<string, unknown> | undefined
  for (const name of ['filter', 'group', 'source', 'version', 'window', 'trigger'] as const) {
    const value = query?.[name]
    if (typeof value === 'string' && value) search.set(name, value)
  }
  // A project settings page carries the project it edits; every other route carries the project it is browsed in.
  if (project && search.get('project') === null) search.set('project', project)
  return search
}
/**
 * Read a permalink back into a route and its project, or `undefined` when the URL does not name this panel or names no
 * route this panel can show. The decoded value goes through `parseRoute`, so a hand-edited URL cannot introduce a page,
 * a record type or a filter the panel does not have.
 */
export function routeFromSearch(search: string): { route: Route; project?: string } | undefined {
  const params = new URLSearchParams(search)
  if (params.get(PANEL_PARAM) !== PANEL_VALUE) return undefined
  const page = params.get('page')
  if (!page) return undefined
  const raw: Record<string, unknown> = { page }
  const id = params.get('id'); if (id) raw.id = id
  if (params.get('create') === '1') raw.create = true
  const edit = params.get('edit'); if (edit) raw.edit = edit
  const query: Record<string, string> = {}
  for (const name of ['filter', 'group', 'source', 'version', 'window', 'trigger']) {
    const value = params.get(name); if (value !== null) query[name] = value
  }
  if (Object.keys(query).length) raw.query = query
  const route = parseRoute(raw)
  if (!route) return undefined
  const project = params.get('project') ?? undefined
  return { route, ...(project ? { project } : {}) }
}
/**
 * The absolute permalink of a route: the page path with only this panel's parameters, so a launch token that happened
 * to be in the address bar is never carried into a link or a copied URL. `standalone` adds the parameter that opens the
 * page with the shell's own columns hidden, which is what the title bar's new-tab link wants.
 */
export function permalink(route: Route, project?: string | undefined, standalone = false): string {
  const search = routeToSearch(route, project)
  if (standalone) search.set(STANDALONE_PARAM, '1')
  if (typeof location === 'undefined') return `?${search.toString()}`
  return `${location.origin}${location.pathname}?${search.toString()}`
}
const ROUTE_KEY = 'dsh-superagent/route'
export interface Location { route: Route; stack: Route[]; group?: SettingsGroup | undefined; project?: string | undefined }
export const lastSettingsGroup = ({ route, group }: Location): SettingsGroup => route.page === 'settings' ? route.query.group
  : group ?? 'source'
/** The location to open with: a permalink in the address bar wins, then the session's remembered route, then HOME. */
export function initialLocation(): Location {
  const fromUrl = routeFromSearch(currentSearch())
  if (fromUrl) return { route: fromUrl.route, stack: [], ...(fromUrl.project ? { project: fromUrl.project } : {}) }
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
/**
 * Point the address bar at the current page, or clear this panel's parameters when the panel stops showing, so a plain
 * refresh away from the panel keeps the pre-permalink behaviour. The search is replaced, never pushed: the panel's own
 * back stack stays the only history.
 */
export function reflect(shown: Location | undefined): void {
  if (typeof location === 'undefined' || typeof history === 'undefined' || typeof history.replaceState !== 'function') return
  const search = shown === undefined ? undefined : routeToSearch(shown.route, shown.project)
  // The standalone page keeps its own marker: navigating inside it must not turn the next refresh back into a framed page.
  if (search && standaloneRequested(location.search)) search.set(STANDALONE_PARAM, '1')
  const target = search === undefined ? '' : `?${search.toString()}`
  const url = `${location.pathname}${target}`
  if (`${location.pathname}${location.search}` === url) return
  history.replaceState(history.state, '', url)
}
