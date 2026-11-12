// @vitest-environment jsdom
// The project bar above the page tabs: tab switching, the overflow More menu and standalone project creation.
import { expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { usePanel, mount, all, click, type, text, at, tab } from './fixtures/panel.tsx'
import { localIssue, server } from './fixtures/panel-server.ts'

usePanel()

const project = (id: string, name: string, intakeRepository: string, codeRepository: string) => ({ id, name, chain: id,
  intakeRepository, codeRepository, createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z' })
const WIDGETS = { ...project('p-widgets', 'Widgets', 'acme/intake', 'acme/widgets'), worktreeRoot: '/srv/worktrees' }
const OTHER = project('p-other', 'Other', 'acme/intake', 'acme/other')
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

it('switches the current project from its tab and scopes Discuss to it', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'), issue('q-other', 'p-other', 'Other requirement')]
  at({ page: 'discuss' })
  await mount()
  const projectTabs = all('.dt-project-strip [role="tab"]')
  expect(projectTabs.map(item => item.textContent)).toEqual(['Widgets', 'Other'])
  expect(projectTabs.map(item => item.getAttribute('aria-selected'))).toEqual(['true', 'false'])
  // The page tablist is separate and still selects Discuss.
  expect(document.querySelector('.dt-tabs')?.querySelectorAll('[role="tab"]')).toHaveLength(7)
  expect(document.querySelector('.dt-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe(zh['tab.discuss'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(text()).toContain('acme/intake → acme/widgets')
  expect(text()).toContain('/srv/worktrees')
  // Projects are chosen in the bar, so Discuss carries no project list, project filter or inline creation form.
  expect(all('.dt-section-title .dt-section-name').map(name => name.textContent)).toEqual([zh['discuss.issues']])
  expect(all('.dt-card-title').map(title => title.textContent)).toEqual([zh['discuss.new']])
  expect(requirementTitles()).toEqual(['Widgets requirement'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-widgets')).toBe(true)
  // The page tabs still work, and moving between them keeps the current project.
  await click(tab(zh['tab.overview']))
  expect(document.querySelector('.dt-project-strip [role="tab"][aria-selected="true"]')?.textContent).toBe('Widgets')
  await click(tab(zh['tab.discuss']))
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  await click(tab('Other'))
  expect(all('.dt-project-strip [role="tab"]').map(item => item.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Other')
  expect(text()).toContain('acme/intake → acme/other')
  expect(requirementTitles()).toEqual(['Other requirement'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-other')).toBe(true)
  // A new requirement now targets the switched project, so the two projects do not mix data.
  await type(field(zh['discuss.titlePlaceholder']), 'Other target')
  await click(zh['discuss.submit'])
  expect(server.requests.find(request => request.path === 'local/issues' && request.method === 'POST')?.body)
    .toEqual({ title: 'Other target', project: 'p-other' })
  expect(text()).toContain('项目：Other · acme/intake → acme/other')
})

it('offers every project from More only when the project strip overflows', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'), issue('q-other', 'p-other', 'Other requirement')]
  at({ page: 'discuss' })
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
    // Each menu row shows the project's two repositories, not only its name.
    expect(items.map(item => item.querySelector('.dt-mono')?.textContent)).toEqual(['acme/intake → acme/widgets', 'acme/intake → acme/other'])
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

it('creates a project on its own page, cancels without a request, and returns to the new project', async () => {
  at({ page: 'discuss' })
  await mount()
  expect(text()).toContain(zh['discuss.noProjects'])
  expect(document.querySelector('.dt-project-bar .dt-project-new')?.textContent).toBe(zh['discuss.newProject'])
  // The create button belongs to the bar above the page, not to the Discuss page itself.
  expect(document.querySelector('#dt-page .dt-project-new')).toBeNull()
  expect(text()).not.toContain('只看这个项目')
  expect(text()).not.toContain('查看全部项目')
  await openCreate()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
  expect(all('.dt-cards')).toHaveLength(0)
  expect(all('textarea')).toHaveLength(0)
  expect(all('input').some(input => input.getAttribute('placeholder') === zh['discuss.titlePlaceholder'])).toBe(false)
  await click(zh['cancel'])
  expect(posts()).toHaveLength(0)
  expect(text()).toContain(zh['discuss.noProjects'])
  // The page head's Back leaves the creation page without creating anything either.
  await openCreate()
  await click(document.querySelector<HTMLElement>('.dt-page-head button')!)
  expect(posts()).toHaveLength(0)
  expect(text()).toContain(zh['discuss.noProjects'])
  // A submitted project becomes current and Discuss returns to its own list.
  await openCreate()
  await type(field(zh['discuss.projectName']), 'Rooted')
  await type(field(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/rooted')
  await type(field(zh['discuss.projectWorktreeRoot']), '/srv/rooted')
  await click(zh['discuss.createProject'])
  expect(posts()[0]!.body).toEqual({ name: 'Rooted', intakeRepository: 'acme/intake', codeRepository: 'acme/rooted', worktreeRoot: '/srv/rooted' })
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Rooted')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Rooted')
  expect(text()).toContain(zh['discuss.empty'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture')).toBe(true)
  // Leaving the worktree root empty omits it and the next project gets its own id.
  await openCreate()
  await type(field(zh['discuss.projectName']), 'Plain')
  await type(field(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/plain')
  await click(zh['discuss.createProject'])
  expect(posts()).toHaveLength(2)
  expect(posts()[1]!.body).toEqual({ name: 'Plain', intakeRepository: 'acme/intake', codeRepository: 'acme/plain' })
  expect(posts()[1]!.body).not.toHaveProperty('worktreeRoot')
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Plain')
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture-2')).toBe(true)
})

const putRequests = () => server.requests.filter(request => request.method === 'PUT' && request.path.startsWith('local/projects/'))
/** The project form's inputs, found by their labels; editing pre-fills them from the stored project. */
const editButton = () => {
  const button = document.querySelector<HTMLElement>('.dt-page-head .dt-project-edit')
  if (!button) throw new Error('No Edit project button')
  return button
}
const values = () => [zh['discuss.projectName'], zh['discuss.projectIntakeRepository'], zh['discuss.projectCodeRepository'],
  zh['discuss.projectWorktreeRoot']].map(label => field(label).value)

it('edits one project from the Discuss page head and leaves the other project\'s repositories alone', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'), issue('q-other', 'p-other', 'Other requirement')]
  at({ page: 'discuss' })
  await mount()
  // The Discuss page head shows the current project's two repositories and offers its edit entry.
  expect(text()).toContain('acme/intake → acme/widgets')
  expect(text()).toContain('/srv/worktrees')
  await click(editButton())
  // The edit page is its own route with the current project's values already filled in.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.editProject'])
  expect(values()).toEqual(['Widgets', 'acme/intake', 'acme/widgets', '/srv/worktrees'])
  expect(all('textarea')).toHaveLength(0)
  await type(field(zh['discuss.projectName']), 'Widgets renamed')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/gadgets')
  await click(zh['discuss.saveProject'])
  // Only the edited project is written, and the update carries every field of its form.
  expect(putRequests()).toHaveLength(1)
  expect(putRequests()[0]).toMatchObject({ method: 'PUT', path: 'local/projects/p-widgets',
    body: { name: 'Widgets renamed', intakeRepository: 'acme/intake', codeRepository: 'acme/gadgets', worktreeRoot: '/srv/worktrees' } })
  // Saving returns to Discuss with the renamed project current and its new chain in the page head.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets renamed')
  expect(text()).toContain('acme/intake → acme/gadgets')
  expect(text()).toContain('acme/intake → acme/gadgets')
  // The other project kept its own two repositories, in its page head and in the More menu alike.
  await click(tab('Other'))
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Other')
  expect(text()).toContain('acme/intake → acme/other')
  expect(text()).not.toContain('acme/intake → acme/gadgets')
  expect(server.localProjects.find(item => item.id === 'p-other'))
    .toMatchObject({ name: 'Other', intakeRepository: 'acme/intake', codeRepository: 'acme/other' })
  // Editing the other project later writes only that project.
  await click(editButton())
  expect(values()).toEqual(['Other', 'acme/intake', 'acme/other', ''])
  await type(field(zh['discuss.projectName']), 'Other renamed')
  await click(zh['discuss.saveProject'])
  expect(putRequests()).toHaveLength(2)
  expect(putRequests()[1]).toMatchObject({ path: 'local/projects/p-other', body: { name: 'Other renamed', intakeRepository: 'acme/intake',
    codeRepository: 'acme/other', worktreeRoot: '' } })
  expect(server.localProjects.find(item => item.id === 'p-widgets'))
    .toMatchObject({ name: 'Widgets renamed', intakeRepository: 'acme/intake', codeRepository: 'acme/gadgets', worktreeRoot: '/srv/worktrees' })
  expect(text()).toContain('acme/intake → acme/other')
})

it('keeps the edit page and its values when the update is refused, then clears an emptied worktree root', async () => {
  server.localProjects = [{ ...WIDGETS }, OTHER]
  at({ page: 'discuss' })
  await mount()
  await click(editButton())
  await type(field(zh['discuss.projectName']), 'Widgets kept')
  await type(field(zh['discuss.projectWorktreeRoot']), 'relative/root')
  await click(zh['discuss.saveProject'])
  // A refused save shows the existing localized refusal and leaves the person on the form with their edits intact.
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['userError.projectWorktreeRoot'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.editProject'])
  expect(values()).toEqual(['Widgets kept', 'acme/intake', 'acme/widgets', 'relative/root'])
  expect(server.localProjects.find(item => item.id === 'p-widgets')).toMatchObject({ name: 'Widgets', worktreeRoot: '/srv/worktrees' })
  // An emptied root is sent as an empty string, which clears the stored root.
  await type(field(zh['discuss.projectWorktreeRoot']), '')
  await click(zh['discuss.saveProject'])
  expect(putRequests().at(-1)).toMatchObject({ path: 'local/projects/p-widgets',
    body: { name: 'Widgets kept', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets', worktreeRoot: '' } })
  expect(server.localProjects.find(item => item.id === 'p-widgets')).not.toHaveProperty('worktreeRoot')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets kept')
  expect(text()).not.toContain('/srv/worktrees')
})

it('leaves the edit page without a request from Cancel or Back', async () => {
  server.localProjects = [WIDGETS, OTHER]
  at({ page: 'discuss' })
  await mount()
  await click(editButton())
  await type(field(zh['discuss.projectName']), 'Discarded')
  await click(zh['cancel'])
  expect(putRequests()).toHaveLength(0)
  expect(server.localProjects.find(item => item.id === 'p-widgets')).toMatchObject({ name: 'Widgets' })
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  await click(editButton())
  await click(document.querySelector<HTMLElement>('.dt-page-head button')!)
  expect(putRequests()).toHaveLength(0)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
})
