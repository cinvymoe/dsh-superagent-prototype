// @vitest-environment jsdom
// The project bar above the page tabs: tab switching, the overflow More menu and standalone project creation.
import { expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { usePanel, mount, all, click, type, text, at, tab } from './fixtures/panel.tsx'
import { localIssue, server } from './fixtures/panel-server.ts'

usePanel()

const project = (id: string, name: string, repository: string) => ({ id, name, repository,
  createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z' })
const WIDGETS = { ...project('p-widgets', 'Widgets', 'acme/widgets'), worktreeRoot: '/srv/worktrees' }
const OTHER = project('p-other', 'Other', 'acme/other')
const issue = (id: string, projectId: string, title: string) => ({ ...localIssue(title), id, project: projectId })
const posts = () => server.requests.filter(request => request.path === 'local/projects' && request.method === 'POST')
const openCreate = async () => {
  const button = document.querySelector<HTMLElement>('.dt-project-bar .dt-project-new')
  if (!button) throw new Error('No New project button')
  await click(button)
}
const requirementTitles = () => all('.dt-cards .dt-row-title').map(title => title.textContent)
const field = (label: string): HTMLInputElement => {
  const match = all('input').find(input => input.getAttribute('placeholder') === label || input.getAttribute('aria-label') === label)
  if (!match) throw new Error(`No input ${label}`)
  return match as HTMLInputElement
}
const description = (): HTMLTextAreaElement => {
  const match = all('textarea').find(area => area.getAttribute('aria-label') === zh['discuss.descriptionPlaceholder'])
  if (!match) throw new Error('No description field')
  return match as HTMLTextAreaElement
}
const selectedPageTab = () => document.querySelector('.dt-tabs [role="tab"][aria-selected="true"]')?.textContent

it('keeps the requirement list when switching projects there and refetches it', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'), issue('q-other', 'p-other', 'Other requirement')]
  at({ page: 'requirements' })
  await mount()
  const projectTabs = all('.dt-project-strip [role="tab"]')
  expect(projectTabs.map(item => item.textContent)).toEqual(['Widgets', 'Other'])
  expect(projectTabs.map(item => item.getAttribute('aria-selected'))).toEqual(['true', 'false'])
  // The page tablist is separate and selects Requirements.
  expect(document.querySelector('.dt-tabs')?.querySelectorAll('[role="tab"]')).toHaveLength(8)
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(requirementTitles()).toEqual(['Widgets requirement'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-widgets')).toBe(true)
  // Switching the project keeps the requirement list and refetches it for the new project.
  await click(tab('Other'))
  expect(all('.dt-project-strip [role="tab"]').map(item => item.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Other')
  expect(text()).toContain('acme/other')
  expect(requirementTitles()).toEqual(['Other requirement'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-other')).toBe(true)
})

it('keeps the New requirement tab when switching projects there and targets the new project', async () => {
  server.localProjects = [WIDGETS, OTHER]
  at({ page: 'newRequirement' })
  await mount()
  expect(selectedPageTab()).toBe(zh['tab.newRequirement'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(document.querySelector('.dt-card-head .dt-tag')?.textContent).toBe('Widgets')
  await click(tab('Other'))
  expect(selectedPageTab()).toBe(zh['tab.newRequirement'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Other')
  expect(text()).toContain('acme/other')
  expect(document.querySelector('.dt-card-head .dt-tag')?.textContent).toBe('Other')
  await type(description(), 'Other target')
  await click(zh['discuss.submit'])
  expect(server.requests.find(request => request.path === 'local/issues' && request.method === 'POST')?.body)
    .toEqual({ body: 'Other target', project: 'p-other' })
  expect(text()).toContain('项目：Other · acme/other')
})

it('lands on the requirement list when switching from another tab', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'), issue('q-other', 'p-other', 'Other requirement')]
  at({ page: 'overview' })
  await mount()
  expect(selectedPageTab()).toBe(zh['tab.overview'])
  await click(tab('Other'))
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Other')
  expect(requirementTitles()).toEqual(['Other requirement'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-other')).toBe(true)
})

it('offers every project from More only when the project strip overflows', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'), issue('q-other', 'p-other', 'Other requirement')]
  at({ page: 'requirements' })
  await mount()
  expect(document.querySelector('.dt-project-more')).toBeNull()
  const strip = document.querySelector<HTMLElement>('.dt-project-strip')!
  // jsdom has no layout: stub the strip's measured width so it overflows, then restore it after the test.
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, get: () => 640 })
  Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => 320 })
  try {
    // Selecting another project re-runs the overflow measurement.
    await click(tab('Other'))
    expect(document.querySelector('.dt-project-more')).not.toBeNull()
    await click(document.querySelector<HTMLElement>('.dt-project-more')!)
    const items = all('[role="menuitemradio"]')
    expect(items.map(item => item.querySelector('span')?.textContent)).toEqual(['Widgets', 'Other'])
    expect(items.map(item => item.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    await click(items[0]!)
    expect(document.querySelector('.dt-project-menu')).toBeNull()
    expect(tab('Widgets').getAttribute('aria-selected')).toBe('true')
    expect(requirementTitles()).toEqual(['Widgets requirement'])
    expect(server.requests.some(request => request.path === 'local/issues?project=p-widgets')).toBe(true)
  } finally {
    Reflect.deleteProperty(strip, 'scrollWidth')
    Reflect.deleteProperty(strip, 'clientWidth')
  }
})

it('creates a project on its own page, cancels without a request, and returns to its requirement list', async () => {
  at({ page: 'requirements' })
  await mount()
  expect(text()).toContain(zh['discuss.noProjects'])
  expect(document.querySelector('.dt-project-bar .dt-project-new')?.textContent).toBe(zh['discuss.newProject'])
  // The create button belongs to the bar above the page, not to the requirement page itself.
  expect(document.querySelector('#dt-page .dt-project-new')).toBeNull()
  await openCreate()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
  expect(all('.dt-cards')).toHaveLength(0)
  expect(all('#dt-page textarea')).toHaveLength(0)
  await click(zh.cancel)
  expect(posts()).toHaveLength(0)
  expect(text()).toContain(zh['discuss.noProjects'])
  // The page head's Back leaves the creation page without creating anything either.
  await openCreate()
  await click(document.querySelector<HTMLElement>('.dt-page-head button')!)
  expect(posts()).toHaveLength(0)
  expect(text()).toContain(zh['discuss.noProjects'])
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  // A submitted project becomes current and opens its own requirement list.
  await openCreate()
  await type(field(zh['discuss.projectName']), 'Rooted')
  await type(field(zh['discuss.projectRepository']), 'acme/rooted')
  await type(field(zh['discuss.projectWorktreeRoot']), '/srv/rooted')
  await click(zh['discuss.createProject'])
  expect(posts()[0]!.body).toEqual({ name: 'Rooted', repository: 'acme/rooted', worktreeRoot: '/srv/rooted' })
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Rooted')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Rooted')
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  expect(text()).toContain(zh['discuss.empty'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture')).toBe(true)
  // Leaving the worktree root empty omits it and the next project gets its own id.
  await openCreate()
  await type(field(zh['discuss.projectName']), 'Plain')
  await type(field(zh['discuss.projectRepository']), 'acme/plain')
  await click(zh['discuss.createProject'])
  expect(posts()).toHaveLength(2)
  expect(posts()[1]!.body).toEqual({ name: 'Plain', repository: 'acme/plain' })
  expect(posts()[1]!.body).not.toHaveProperty('worktreeRoot')
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Plain')
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture-2')).toBe(true)
})
