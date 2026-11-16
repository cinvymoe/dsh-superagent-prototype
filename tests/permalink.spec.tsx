// @vitest-environment jsdom
// Panel permalinks: every route round-trips through the address bar, a permalink opens its own page and project, and the
// title-bar link is the same permalink opened in a new tab.
import { expect, it } from 'vitest'
import { DECISION_FILTERS } from '../src/client/api.ts'
import { THREAD_FILTERS, TICKET_FILTERS } from '../src/app/api.ts'
import { zh } from '../src/client/locales.ts'
import { HOME, PANEL_VALUE, parseRoute, routeFromSearch, routeToSearch, STANDALONE_PARAM, type Route } from '../src/client/route.ts'
import { at, click, all, find, mount, text, usePanel } from './fixtures/panel.tsx'
import { localIssue, server } from './fixtures/panel-server.ts'

usePanel()

const project = (id: string, name: string, codeRepository: string) => ({ id, name, chain: id, intakeRepository: 'acme/intake',
  codeRepository, createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z' })
const WIDGETS = project('p-widgets', 'Widgets', 'acme/widgets')
const OTHER = project('p-other', 'Other', 'acme/other')
const issue = (id: string, projectId: string, title: string) => ({ ...localIssue(title), id, project: projectId })
const selectedPageTab = () => document.querySelector('.dt-tabs [role="tab"][aria-selected="true"]')?.textContent
const selectedProject = () => document.querySelector('.dt-project-strip [role="tab"][aria-selected="true"]')?.textContent
const pageTitle = () => document.querySelector('.dt-page-title h2')?.textContent
const link = () => document.querySelector<HTMLAnchorElement>(`a[aria-label="${zh.openPage}"]`)!

// Every route the panel can show, already normalized the way `parseRoute` returns it.
const ROUTES: Route[] = [
  { page: 'overview' },
  { page: 'source' },
  { page: 'discussions' },
  { page: 'discussions', id: 'discussion-1' },
  { page: 'requirements' },
  { page: 'requirements', query: { filter: 'confirmed' } },
  { page: 'requirements', query: { filter: 'all' } },
  { page: 'requirements', create: true },
  { page: 'requirements', edit: 'p-widgets' },
  { page: 'requirements', id: 'q-1' },
  { page: 'requirements', id: 'q-2', query: { filter: 'closed' } },
  { page: 'trigger' },
  { page: 'trigger', query: { filter: THREAD_FILTERS[1] } },
  { page: 'trigger', id: 'github:7' },
  { page: 'trigger', id: 'feishu:9', query: { trigger: 'e-9' } },
  { page: 'eval' },
  { page: 'eval', query: { filter: DECISION_FILTERS[1], window: '24h' } },
  { page: 'execution' },
  { page: 'execution', query: { filter: TICKET_FILTERS[1] } },
  { page: 'execution', id: 't-1' },
  { page: 'settings', query: { group: 'source' } },
  { page: 'settings', query: { group: 'eval' } },
  { page: 'settings', query: { group: 'source', source: 'p-widgets', version: 'v-2' } },
]

it('round-trips every route variant and the current project through a permalink', () => {
  for (const route of ROUTES) {
    const search = routeToSearch(route, 'p-widgets')
    expect(search.get('panel')).toBe(PANEL_VALUE)
    expect(search.get('page')).toBe(route.page)
    // A normal route is recovered exactly as `parseRoute` normalizes it, project included.
    expect(routeFromSearch(`?${search.toString()}`)).toEqual({ route: parseRoute(route), project: 'p-widgets' })
  }
  // A route alone still round-trips; the project simply travels only when one is current.
  expect(routeFromSearch(`?${routeToSearch({ page: 'overview' }).toString()}`)).toEqual({ route: HOME })
})

it('opens the page, record and project a permalink names', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'),
    issue('q-other', 'p-other', 'Other requirement')]
  await mount(zh, { url: '/?panel=dsh-superagent&page=requirements&id=q-other&project=p-other' })
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  expect(selectedProject()).toBe('Other')
  expect(pageTitle()).toBe('Other requirement')
  expect(text()).toContain('acme/other')
  // The permalink opened here stays the address bar's own state.
  const here = new URL(location.href)
  expect(here.searchParams.get('panel')).toBe('dsh-superagent')
  expect(here.searchParams.get('id')).toBe('q-other')
  expect(here.searchParams.get('project')).toBe('p-other')
})

it('falls back to the remembered route when the URL does not name the panel', async () => {
  server.localProjects = [WIDGETS]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement')]
  at({ page: 'execution' })
  // The parameters are a valid permalink, but without the panel marker the URL says nothing about this panel.
  await mount(zh, { url: '/?page=requirements&id=q-widgets' })
  expect(selectedPageTab()).toBe(zh['tab.execution'])
  expect(pageTitle()).not.toBe('Widgets requirement')
})

it('falls back to the remembered route, then HOME, when a permalink names no page the panel has', async () => {
  server.localProjects = [WIDGETS]
  at({ page: 'settings', query: { group: 'eval' } })
  await mount(zh, { url: '/?panel=dsh-superagent&page=nowhere&id=q-widgets' })
  expect(selectedPageTab()).toBe(zh['tab.settings'])
  sessionStorage.clear()
  await mount(zh, { url: '/?panel=dsh-superagent&page=nowhere' })
  expect(selectedPageTab()).toBe(zh['tab.overview'])
})

it('gives the header a new-tab link to the current page without the launch token', async () => {
  server.localProjects = [WIDGETS]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement')]
  // A launch URL carries the host's token; the panel replaces it with its own parameters instead of keeping it.
  await mount(zh, { url: '/?token=secret&panel=dsh-superagent&page=requirements&project=p-widgets' })
  expect(location.search).not.toContain('token')
  const here = location.origin + location.pathname + location.search
  // The link opens the page on its own, so it asks for the standalone page on top of this panel's parameters.
  expect(link().href).toBe(`${here}&${STANDALONE_PARAM}=1`)
  expect(link().href).not.toContain('token')
  expect(link().target).toBe('_blank')
  expect(link().rel).toContain('noopener')
  expect(link().getAttribute('title')).toBe(zh.openPage)
  // The link follows the page: opening the record moves it to that record's permalink too.
  await click(find('Widgets requirement'))
  expect(link().href).toBe(`${location.origin + location.pathname + location.search}&${STANDALONE_PARAM}=1`)
  expect(new URL(link().href).searchParams.get('page')).toBe('requirements')
  expect(new URL(link().href).searchParams.get('id')).toBe('q-widgets')
})

it('keeps the standalone marker in the address bar while the page is navigated', async () => {
  server.localProjects = [WIDGETS]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement')]
  await mount(zh, { url: '/?panel=dsh-superagent&page=requirements&standalone=1' })
  expect(new URL(location.href).searchParams.get(STANDALONE_PARAM)).toBe('1')
  // Navigating writes the next page's permalink and keeps the standalone marker, so a refresh stays standalone.
  await click(find('Widgets requirement'))
  expect(new URL(location.href).searchParams.get('id')).toBe('q-widgets')
  expect(new URL(location.href).searchParams.get(STANDALONE_PARAM)).toBe('1')
})

it('adds one link and no copy or share control', async () => {
  server.localProjects = [WIDGETS]
  await mount(zh, { url: '/' })
  expect(all('.dt-toolbar a')).toHaveLength(1)
  const names = all('.dt-toolbar [aria-label]').map(element => element.getAttribute('aria-label') ?? '')
  expect(names.filter(name => /复制|分享|copy|share/i.test(name))).toEqual([])
})
