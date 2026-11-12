// @vitest-environment jsdom
// The New requirement and Requirements pages scoped to the current local project, and the standalone project creation page.
import { expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { usePanel, mount, remount, all, click, type, text, at, tab } from './fixtures/panel.tsx'
import { localIssue, server } from './fixtures/panel-server.ts'

usePanel()

/** The first input whose placeholder (or aria-label) is the given text. */
const input = (label: string): HTMLInputElement => {
  const match = all('input').find(element => element.getAttribute('placeholder') === label || element.getAttribute('aria-label') === label) as HTMLInputElement | undefined
  if (!match) throw new Error(`No input ${label}`)
  return match
}
/** The description textarea of the New requirement page. */
const area = (label: string): HTMLTextAreaElement => {
  const match = all('textarea').find(element => element.getAttribute('placeholder') === label || element.getAttribute('aria-label') === label) as HTMLTextAreaElement | undefined
  if (!match) throw new Error(`No textarea ${label}`)
  return match
}
const submitButton = (): HTMLButtonElement => {
  const match = all('#dt-page button').find(button => button.textContent?.trim() === zh['discuss.submit'])
  if (!match) throw new Error('No submit button')
  return match as HTMLButtonElement
}
/** The top-level New project button of the project bar, which opens its own page. */
const openCreate = async () => {
  const button = document.querySelector<HTMLElement>('.dt-project-bar .dt-project-new')
  if (!button) throw new Error('No New project button')
  await click(button)
}
const PROJECT = { id: 'p-fixture', name: 'Widgets', repository: 'acme/widgets', createdAt: '2026-09-23T00:00:00Z',
  updatedAt: '2026-09-23T00:00:00Z' }

it('creates a project on its own page with an optional absolute worktree root and makes it current', async () => {
  at({ page: 'requirements' })
  await mount()
  expect(text()).toContain(zh['discuss.noProjects'])
  expect(all('.dt-select')).toEqual([])
  await openCreate()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
  expect(all('.dt-cards')).toHaveLength(0)
  await type(input(zh['discuss.projectName']), 'Rooted')
  await type(input(zh['discuss.projectRepository']), 'acme/rooted')
  await type(input(zh['discuss.projectWorktreeRoot']), '/srv/worktrees')
  expect(text()).toContain(zh['discuss.projectWorktreeRootHint'])
  await click(zh['discuss.createProject'])
  const projectRequest = server.requests.find(request => request.path === 'local/projects' && request.method === 'POST')!
  expect(projectRequest).toMatchObject({ method: 'POST', body: { name: 'Rooted', repository: 'acme/rooted', worktreeRoot: '/srv/worktrees' } })
  // The new project is the current tab and its requirement list opens.
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Rooted')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Rooted')
  expect(text()).toContain('acme/rooted')
  expect(text()).toContain('/srv/worktrees')
  expect(tab(zh['tab.requirements']).getAttribute('aria-selected')).toBe('true')
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture')).toBe(true)
})

it('omits the worktree root from the payload when the field is left empty', async () => {
  at({ page: 'requirements' })
  await mount()
  await openCreate()
  await type(input(zh['discuss.projectName']), 'Plain')
  await type(input(zh['discuss.projectRepository']), 'acme/plain')
  await click(zh['discuss.createProject'])
  const request = server.requests.find(entry => entry.path === 'local/projects' && entry.method === 'POST')!
  expect(request.body).toEqual({ name: 'Plain', repository: 'acme/plain' })
  expect(request.body).not.toHaveProperty('worktreeRoot')
})

it('shows only the current project and one description field on New requirement', async () => {
  server.localProjects = [PROJECT, { ...PROJECT, id: 'p-other', name: 'Other', repository: 'acme/other' }]
  server.localIssues = [localIssue('Existing requirement')]
  at({ page: 'newRequirement' })
  await mount()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(text()).toContain(zh['discuss.newSubtitle'])
  expect(text()).toContain('acme/widgets')
  // The page has no title input, no requirement list and no back button, in particular none labelled Overview.
  expect(document.querySelectorAll('#dt-page input')).toHaveLength(0)
  expect(all('.dt-cards')).toHaveLength(0)
  expect(document.querySelector('.dt-page-head button')).toBeNull()
  expect(all('#dt-page button').some(button => button.textContent?.trim() === zh['tab.overview'])).toBe(false)
  expect(text()).not.toContain('Existing requirement')
})

it('keeps submission disabled while the description is blank and submits the description alone', async () => {
  server.localProjects = [PROJECT]
  at({ page: 'newRequirement' })
  await mount()
  expect(submitButton().disabled).toBe(true)
  await type(area(zh['discuss.descriptionPlaceholder']), '   ')
  expect(submitButton().disabled).toBe(true)
  const description = 'Ship the widget\n\nDetails about the widget'
  await type(area(zh['discuss.descriptionPlaceholder']), description)
  expect(submitButton().disabled).toBe(false)
  await click(submitButton())
  const posted = server.requests.find(request => request.path === 'local/issues' && request.method === 'POST')!
  expect(posted).toMatchObject({ method: 'POST', body: { body: description, project: 'p-fixture' } })
  expect(posted.body).not.toHaveProperty('title')
  // The detail names the requirement after the description's first line and shows the text exactly once.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Ship the widget')
  expect(text()).toContain('Details about the widget')
  expect(text().split('Details about the widget').length - 1).toBe(1)
  expect(document.querySelector('.dt-timeline')?.textContent).not.toContain('Details about the widget')
})

it('lists the current project requirements newest first with their tags, time and slice count', async () => {
  const slice = { id: 'C1', title: 'One', outcome: '', inScope: [], outOfScope: [], acceptance: [], dependsOn: [], lane: 'full' as const }
  const newer = { ...localIssue('Newer requirement'), id: 'q-newer', createdAt: '2026-09-23T00:00:00Z',
    alignment: { status: 'proposed' as const, summary: '', slices: [slice, { ...slice, id: 'C2' }], acceptance: [],
      proposedAt: '2026-09-23T00:00:00Z' } }
  const older = { ...localIssue('Older requirement'), id: 'q-older', createdAt: '2026-09-20T00:00:00Z', state: 'closed' as const }
  server.localProjects = [PROJECT, { ...PROJECT, id: 'p-other', name: 'Other', repository: 'acme/other' }]
  server.localIssues = [newer, older, { ...localIssue('Other requirement'), id: 'q-other', project: 'p-other' }]
  at({ page: 'requirements' })
  await mount()
  expect(tab(zh['tab.requirements']).getAttribute('aria-selected')).toBe('true')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(text()).toContain(zh['discuss.listSubtitle'])
  expect(text()).toContain('acme/widgets')
  expect(all('.dt-section-title .dt-section-name').map(name => name.textContent)).toEqual([zh['discuss.requirements']])
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Newer requirement', 'Older requirement'])
  expect(text()).not.toContain('Other requirement')
  const metas = all('.dt-cards .dt-row-meta').map(meta => meta.textContent ?? '')
  expect(metas[0]).toContain(zh['discuss.open'])
  expect(metas[0]).toContain(zh['discuss.proposed'])
  expect(metas[0]).toContain('2 个切片')
  expect(metas[1]).toContain(zh['discuss.closed'])
  expect(metas[1]).toContain(zh['discuss.pending'])
  expect(metas[1]).toContain('0 个切片')
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture')).toBe(true)
  // A row opens its requirement detail.
  await click(all('.dt-cards .dt-row-title button')[0]!)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Newer requirement')
  expect(server.requests.some(request => request.path === 'local/issues/q-newer')).toBe(true)
})

it('returns from a requirement detail to the requirement list rather than the overview', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Only requirement')]
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Only requirement')
  const back = document.querySelector<HTMLElement>('.dt-page-head button')!
  expect(back.textContent).toBe(zh['discuss.back'])
  await click(back)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(tab(zh['tab.requirements']).getAttribute('aria-selected')).toBe('true')
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Only requirement'])
})

it('shows a requirement text once and leaves its original message out of the timeline', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Titled requirement', 'The full description')]
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(text().split('The full description').length - 1).toBe(1)
  expect(text()).toContain(zh['discuss.timeline'])
  expect(document.querySelector('.dt-timeline')?.textContent).not.toContain('The full description')
})

it('opens a saved Discuss route on its matching requirement page after reload', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Legacy requirement')]
  at({ page: 'discuss', id: 'q-fixture' })
  await mount()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Legacy requirement')
})

it('opens a saved Discuss list route on the requirement list after reload', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Legacy requirement')]
  at({ page: 'discuss' })
  await mount()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Legacy requirement'])
})

it('names the project worktree root field and hint in English as well', async () => {
  at({ page: 'requirements' })
  await mount()
  await remount(en)
  expect(text()).toContain(en['discuss.noProjects'])
  await openCreate()
  expect(input(en['discuss.projectWorktreeRoot'])).toBeInstanceOf(HTMLInputElement)
  expect(text()).toContain(en['discuss.projectWorktreeRootHint'])
})

it('omits a whitespace-only worktree root from the payload', async () => {
  at({ page: 'requirements' })
  await mount()
  await openCreate()
  await type(input(zh['discuss.projectName']), 'Spaced')
  await type(input(zh['discuss.projectRepository']), 'acme/spaced')
  await type(input(zh['discuss.projectWorktreeRoot']), '   ')
  await click(zh['discuss.createProject'])
  const request = server.requests.find(entry => entry.path === 'local/projects' && entry.method === 'POST')!
  expect(request.body).toEqual({ name: 'Spaced', repository: 'acme/spaced' })
  expect(request.body).not.toHaveProperty('worktreeRoot')
})

it('shows the project worktree root on a requirement detail', async () => {
  server.localProjects = [{ ...PROJECT, worktreeRoot: '/srv/worktrees' }]
  server.localIssues = [localIssue('Rooted requirement')]
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(text()).toContain('项目：Widgets · acme/widgets · /srv/worktrees')
})

it('renders a legacy requirement whose project has no worktree root', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Legacy requirement')]
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(text()).toContain('项目：Widgets · acme/widgets')
  expect(text()).not.toContain('/srv/worktrees')
})

it('shows the localized refusal when the worktree root is relative and stays on the creation page', async () => {
  at({ page: 'requirements' })
  await mount()
  await openCreate()
  await type(input(zh['discuss.projectName']), 'Relative')
  await type(input(zh['discuss.projectRepository']), 'acme/relative')
  await type(input(zh['discuss.projectWorktreeRoot']), 'relative/root')
  await click(zh['discuss.createProject'])
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['userError.projectWorktreeRoot'])
  expect(server.localProjects).toHaveLength(0)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
})
