// @vitest-environment jsdom
// The Discuss board: projects (with an optional worktree root) and requirement submission.
import { expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { usePanel, mount, all, click, type, text, at } from './fixtures/panel.tsx'
import { localIssue, server } from './fixtures/panel-server.ts'

usePanel()

/** The first input whose placeholder (or aria-label) is the given text. */
const input = (label: string): HTMLInputElement => {
  const match = all('input').find(element => element.getAttribute('placeholder') === label || element.getAttribute('aria-label') === label) as HTMLInputElement | undefined
  if (!match) throw new Error(`No input ${label}`)
  return match
}
const PROJECT = { id: 'p-fixture', name: 'Widgets', repository: 'acme/widgets', createdAt: '2026-09-23T00:00:00Z',
  updatedAt: '2026-09-23T00:00:00Z' }

it('creates a project with an optional absolute worktree root and shows it in the list', async () => {
  at({ page: 'discuss' })
  await mount()
  expect(text()).toContain(zh['discuss.noProjects'])
  await click(zh['discuss.newProject'])
  await type(input(zh['discuss.projectName']), 'Rooted')
  await type(input(zh['discuss.projectRepository']), 'acme/rooted')
  await type(input(zh['discuss.projectWorktreeRoot']), '/srv/worktrees')
  await click(zh['discuss.createProject'])
  const projectRequest = server.requests.find(request => request.path === 'local/projects' && request.method === 'POST')!
  expect(projectRequest).toMatchObject({ method: 'POST', body: { name: 'Rooted', repository: 'acme/rooted', worktreeRoot: '/srv/worktrees' } })
  expect(text()).toContain('/srv/worktrees')
})

it('omits the worktree root from the payload when the field is left empty', async () => {
  at({ page: 'discuss' })
  await mount()
  await click(zh['discuss.newProject'])
  await type(input(zh['discuss.projectName']), 'Plain')
  await type(input(zh['discuss.projectRepository']), 'acme/plain')
  await click(zh['discuss.createProject'])
  const request = server.requests.find(entry => entry.path === 'local/projects' && entry.method === 'POST')!
  expect(request.body).toEqual({ name: 'Plain', repository: 'acme/plain' })
  expect(request.body).not.toHaveProperty('worktreeRoot')
})

it('submits a requirement into the selected project and tags the row with it', async () => {
  server.localProjects = [PROJECT, { ...PROJECT, id: 'p-other', name: 'Other', repository: 'acme/other' }]
  server.localIssues = [localIssue('Existing requirement')]
  at({ page: 'discuss' })
  await mount()
  expect(all('.dt-select option').map(option => option.textContent)).toEqual(['Widgets · acme/widgets', 'Other · acme/other'])
  await type(input(zh['discuss.titlePlaceholder']), 'New requirement')
  await click(zh['discuss.submit'])
  expect(server.requests.find(request => request.path === 'local/issues' && request.method === 'POST'))
    .toMatchObject({ method: 'POST', body: { title: 'New requirement', project: 'p-fixture' } })
  // Submitting opens the new issue, whose detail names the requirement and its project.
  expect(text()).toContain('New requirement')
  expect(text()).toContain('项目：Widgets · acme/widgets')
})
