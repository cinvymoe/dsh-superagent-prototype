// @vitest-environment jsdom
// The Discuss board scoped to the current local project, and the standalone project creation page.
import { expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { usePanel, mount, remount, all, click, type, text, at } from './fixtures/panel.tsx'
import { localIssue, server } from './fixtures/panel-server.ts'

usePanel()

/** The first input whose placeholder (or aria-label) is the given text. */
const input = (label: string): HTMLInputElement => {
  const match = all('input').find(element => element.getAttribute('placeholder') === label || element.getAttribute('aria-label') === label) as HTMLInputElement | undefined
  if (!match) throw new Error(`No input ${label}`)
  return match
}
/** The top-level New project button of the project bar, which opens its own page. */
const openCreate = async () => {
  const button = document.querySelector<HTMLElement>('.dt-project-bar .dt-project-new')
  if (!button) throw new Error('No New project button')
  await click(button)
}
const PROJECT = { id: 'p-fixture', name: 'Widgets', chain: 'p-fixture', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets',
  createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z' }

it('creates a project on its own page with an optional absolute worktree root and makes it current', async () => {
  at({ page: 'discuss' })
  await mount()
  expect(text()).toContain(zh['discuss.noProjects'])
  expect(all('.dt-select')).toEqual([])
  await openCreate()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
  expect(all('.dt-cards')).toHaveLength(0)
  await type(input(zh['discuss.projectName']), 'Rooted')
  await type(input(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(input(zh['discuss.projectCodeRepository']), 'acme/rooted')
  await type(input(zh['discuss.projectWorktreeRoot']), '/srv/worktrees')
  expect(text()).toContain(zh['discuss.projectWorktreeRootHint'])
  await click(zh['discuss.createProject'])
  const projectRequest = server.requests.find(request => request.path === 'local/projects' && request.method === 'POST')!
  expect(projectRequest).toMatchObject({ method: 'POST', body: { name: 'Rooted', intakeRepository: 'acme/intake', codeRepository: 'acme/rooted',
    worktreeRoot: '/srv/worktrees' } })
  // The new project is the current tab and Discuss returns to its own requirement list.
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Rooted')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Rooted')
  expect(text()).toContain('acme/intake → acme/rooted')
  expect(text()).toContain('/srv/worktrees')
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture')).toBe(true)
})

it('omits the worktree root from the payload when the field is left empty', async () => {
  at({ page: 'discuss' })
  await mount()
  await openCreate()
  await type(input(zh['discuss.projectName']), 'Plain')
  await type(input(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(input(zh['discuss.projectCodeRepository']), 'acme/plain')
  await click(zh['discuss.createProject'])
  const request = server.requests.find(entry => entry.path === 'local/projects' && entry.method === 'POST')!
  expect(request.body).toEqual({ name: 'Plain', intakeRepository: 'acme/intake', codeRepository: 'acme/plain' })
  expect(request.body).not.toHaveProperty('worktreeRoot')
})

it('submits a requirement into the current project and tags the row with it', async () => {
  server.localProjects = [PROJECT, { ...PROJECT, id: 'p-other', name: 'Other', chain: 'p-other', intakeRepository: 'acme/intake',
    codeRepository: 'acme/other' }]
  server.localIssues = [localIssue('Existing requirement'), { ...localIssue('Other requirement'), id: 'q-other', project: 'p-other' }]
  at({ page: 'discuss' })
  await mount()
  // The requirement form targets the current project instead of offering a project select.
  expect(all('.dt-select')).toEqual([])
  expect(text()).toContain('Existing requirement')
  expect(text()).not.toContain('Other requirement')
  expect(document.querySelector('.dt-card-head .dt-tag')?.textContent).toBe('Widgets')
  await type(input(zh['discuss.titlePlaceholder']), 'New requirement')
  await click(zh['discuss.submit'])
  expect(server.requests.find(request => request.path === 'local/issues' && request.method === 'POST'))
    .toMatchObject({ method: 'POST', body: { title: 'New requirement', project: 'p-fixture' } })
  // Submitting opens the new issue, whose detail names the requirement and its project.
  expect(text()).toContain('New requirement')
  expect(text()).toContain('项目：Widgets · acme/intake → acme/widgets')
})

it('names the project worktree root field and hint in English as well', async () => {
  at({ page: 'discuss' })
  await mount()
  await remount(en)
  expect(text()).toContain(en['discuss.noProjects'])
  await openCreate()
  expect(input(en['discuss.projectWorktreeRoot'])).toBeInstanceOf(HTMLInputElement)
  expect(text()).toContain(en['discuss.projectWorktreeRootHint'])
})

it('omits a whitespace-only worktree root from the payload', async () => {
  at({ page: 'discuss' })
  await mount()
  await openCreate()
  await type(input(zh['discuss.projectName']), 'Spaced')
  await type(input(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(input(zh['discuss.projectCodeRepository']), 'acme/spaced')
  await type(input(zh['discuss.projectWorktreeRoot']), '   ')
  await click(zh['discuss.createProject'])
  const request = server.requests.find(entry => entry.path === 'local/projects' && entry.method === 'POST')!
  expect(request.body).toEqual({ name: 'Spaced', intakeRepository: 'acme/intake', codeRepository: 'acme/spaced' })
  expect(request.body).not.toHaveProperty('worktreeRoot')
})

it('shows the project worktree root on a requirement detail', async () => {
  server.localProjects = [{ ...PROJECT, worktreeRoot: '/srv/worktrees' }]
  server.localIssues = [localIssue('Rooted requirement')]
  at({ page: 'discuss', id: 'q-fixture' })
  await mount()
  expect(text()).toContain('项目：Widgets · acme/intake → acme/widgets · /srv/worktrees')
})

it('renders a legacy requirement whose project has no worktree root', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Legacy requirement')]
  at({ page: 'discuss', id: 'q-fixture' })
  await mount()
  expect(text()).toContain('项目：Widgets · acme/intake → acme/widgets')
  expect(text()).not.toContain('/srv/worktrees')
})

it('shows the localized refusal when the worktree root is relative and stays on the creation page', async () => {
  at({ page: 'discuss' })
  await mount()
  await openCreate()
  await type(input(zh['discuss.projectName']), 'Relative')
  await type(input(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(input(zh['discuss.projectCodeRepository']), 'acme/relative')
  await type(input(zh['discuss.projectWorktreeRoot']), 'relative/root')
  await click(zh['discuss.createProject'])
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['userError.projectWorktreeRoot'])
  expect(server.localProjects).toHaveLength(0)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
})
