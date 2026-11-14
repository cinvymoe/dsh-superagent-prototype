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
/** An open requirement whose alignment was confirmed, so it belongs to the 已确认 bucket rather than 待处理. */
const confirmed = (row: ReturnType<typeof issue>) => ({ ...row, alignment: { roundId: 'al-1', status: 'confirmed' as const, summary: '',
  slices: [], acceptance: [], proposedAt: '2026-09-23T00:00:00Z' } })
const posts = () => server.requests.filter(request => request.path === 'local/projects' && request.method === 'POST')
const openCreate = async () => {
  const button = document.querySelector<HTMLElement>('.dt-project-bar .dt-project-new')
  if (!button) throw new Error('No New project button')
  await click(button)
}
const requirementTitles = () => all('.dt-cards .dt-row-title').map(title => title.textContent)
const field = (label: string): HTMLInputElement | HTMLTextAreaElement => {
  const match = all('input, textarea').find(element => element.getAttribute('placeholder') === label || element.getAttribute('aria-label') === label)
  if (!match) throw new Error(`No field ${label}`)
  return match as HTMLInputElement | HTMLTextAreaElement
}
const description = (): HTMLTextAreaElement => {
  const match = all('textarea').find(area => area.getAttribute('aria-label') === zh['discuss.descriptionPlaceholder'])
  if (!match) throw new Error('No description field')
  return match as HTMLTextAreaElement
}
const selectedPageTab = () => document.querySelector('.dt-tabs [role="tab"][aria-selected="true"]')?.textContent

it('keeps the requirement list when switching projects there and refetches it', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [confirmed(issue('q-widgets', 'p-widgets', 'Widgets requirement')), issue('q-widgets-open', 'p-widgets', 'Widgets pending'),
    confirmed(issue('q-other', 'p-other', 'Other requirement')), issue('q-other-open', 'p-other', 'Other pending')]
  at({ page: 'requirements', query: { filter: 'confirmed' } })
  await mount()
  const projectTabs = all('.dt-project-strip [role="tab"]')
  expect(projectTabs.map(item => item.textContent)).toEqual(['Widgets', 'Other'])
  expect(projectTabs.map(item => item.getAttribute('aria-selected'))).toEqual(['true', 'false'])
  // The page tablist is separate and selects Requirements.
  expect(document.querySelector('.dt-tabs')?.querySelectorAll('[role="tab"]')).toHaveLength(9)
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(text()).toContain('acme/intake → acme/widgets')
  expect(text()).toContain('/srv/worktrees')
  // The list opens on the non-default 已确认 filter, so only the confirmed and not the pending row shows.
  expect(all('.dt-filters .dt-pill').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
  expect(requirementTitles()).toEqual(['Widgets requirement'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-widgets')).toBe(true)
  // Switching the project keeps that filter, refetches the new project and shows only its confirmed rows.
  await click(tab('Other'))
  expect(all('.dt-project-strip [role="tab"]').map(item => item.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Other')
  expect(text()).toContain('acme/intake → acme/other')
  expect(all('.dt-filters .dt-pill').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
  expect(requirementTitles()).toEqual(['Other requirement'])
  expect(server.requests.some(request => request.path === 'local/issues?project=p-other')).toBe(true)
  expect((JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown }).route)
    .toEqual({ page: 'requirements', query: { filter: 'confirmed' } })
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
  expect(text()).toContain('项目：Other · acme/intake → acme/other')
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
  expect(all('#dt-page textarea').map(area => area.getAttribute('aria-label'))).toEqual([zh['discuss.projectPrepare']])
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
  await type(field(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/rooted')
  await type(field(zh['discuss.projectWorktreeRoot']), '/srv/rooted')
  await click(zh['discuss.createProject'])
  expect(posts()[0]!.body).toEqual({ name: 'Rooted', intakeRepository: 'acme/intake', codeRepository: 'acme/rooted', worktreeRoot: '/srv/rooted' })
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Rooted')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Rooted')
  expect(selectedPageTab()).toBe(zh['tab.requirements'])
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

it('keeps a refused project on its form with the localized reason', async () => {
  at({ page: 'requirements' })
  await mount()
  await openCreate()
  server.refuseProjectCreate = { status: 400, error: 'Intake repository acme/intake is already used by project Widgets',
    code: 'projectIntakeTaken', values: { repository: 'acme/intake', project: 'Widgets' } }
  await type(field(zh['discuss.projectName']), 'Duplicate')
  await type(field(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/plain')
  await click(zh['discuss.createProject'])
  // A 400 arrives as a structured user error, so the panel shows the localized sentence naming the owning project.
  expect(document.querySelector('.dt-toast')?.textContent)
    .toBe(zh['userError.projectIntakeTaken'].replace('{repository}', 'acme/intake').replace('{project}', 'Widgets'))
  // The creation page and its values stay, so the person can choose another intake repository.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
  expect(field(zh['discuss.projectIntakeRepository']).value).toBe('acme/intake')
  expect(server.localProjects).toEqual([])
})

it('creates a project with its own execution environment and shows it in the project head', async () => {
  at({ page: 'requirements' })
  await mount()
  await openCreate()
  await type(field(zh['discuss.projectName']), 'Isolated')
  await type(field(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/isolated')
  await type(field(zh['discuss.projectWorktreeRoot']), '/srv/isolated')
  // The form trims the prepare command and splits the blocked names on spaces or commas.
  await type(field(zh['discuss.projectPrepare']), '  git -C /srv/isolated worktree add "$DSH_SUPERAGENT_DIR"  ')
  await type(field(zh['discuss.projectBlockedCommands']), 'rm, curl  personal-gh')
  await click(zh['discuss.createProject'])
  expect(posts()[0]!.body).toEqual({ name: 'Isolated', intakeRepository: 'acme/intake', codeRepository: 'acme/isolated',
    worktreeRoot: '/srv/isolated', prepare: 'git -C /srv/isolated worktree add "$DSH_SUPERAGENT_DIR"',
    blockedCommands: ['rm', 'curl', 'personal-gh'] })
  // The project head shows its own execution environment, so it is visible without opening the form.
  expect(text()).toContain('/srv/isolated')
  expect(text()).toContain(zh['discuss.projectPrepareSet'])
  expect(text()).toContain(zh['discuss.projectBlockedCommandsValue'].replace('{commands}', 'rm curl personal-gh'))
})

it('omits a blank prepare command and an empty blocked list from a new project payload', async () => {
  at({ page: 'requirements' })
  await mount()
  await openCreate()
  await type(field(zh['discuss.projectName']), 'Spaced env')
  await type(field(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/spaced-env')
  await type(field(zh['discuss.projectPrepare']), '   ')
  await type(field(zh['discuss.projectBlockedCommands']), '  ,  ')
  await click(zh['discuss.createProject'])
  expect(posts()[0]!.body).toEqual({ name: 'Spaced env', intakeRepository: 'acme/intake', codeRepository: 'acme/spaced-env' })
  expect(posts()[0]!.body).not.toHaveProperty('prepare')
  expect(posts()[0]!.body).not.toHaveProperty('blockedCommands')
})

it('keeps the project form and its values when the host refuses a blocked command', async () => {
  at({ page: 'requirements' })
  await mount()
  await openCreate()
  await type(field(zh['discuss.projectName']), 'Reserved')
  await type(field(zh['discuss.projectIntakeRepository']), 'acme/intake')
  await type(field(zh['discuss.projectCodeRepository']), 'acme/reserved')
  // A command every worker needs, then a name that is not a bare command name, are both refused by the host.
  await type(field(zh['discuss.projectBlockedCommands']), 'gh')
  await click(zh['discuss.createProject'])
  expect(document.querySelector('.dt-toast')?.textContent)
    .toBe(zh['userError.projectBlockedWorkerCommand'].replace('{name}', 'gh'))
  expect(server.localProjects).toEqual([])
  await type(field(zh['discuss.projectBlockedCommands']), 'bad/name')
  await click(zh['discuss.createProject'])
  expect(document.querySelector('.dt-toast')?.textContent)
    .toBe(zh['userError.projectBlockedCommand'].replace('{name}', 'bad/name'))
  // The creation page and its typed values stay, so one field can be corrected instead of starting over.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.newProject'])
  expect(field(zh['discuss.projectBlockedCommands']).value).toBe('bad/name')
  expect(server.localProjects).toEqual([])
})

const putRequests = () => server.requests.filter(request => request.method === 'PUT' && request.path.startsWith('local/projects/'))
/** The project form's inputs, found by their labels; editing pre-fills them from the stored project. */
const editButton = () => {
  const button = document.querySelector<HTMLElement>('.dt-page-head .dt-project-edit')
  if (!button) throw new Error('No Edit project button')
  return button
}
const values = () => [zh['discuss.projectName'], zh['discuss.projectIntakeRepository'], zh['discuss.projectCodeRepository'],
  zh['discuss.projectWorktreeRoot'], zh['discuss.projectPrepare'], zh['discuss.projectBlockedCommands'],
  zh['discuss.projectBot']].map(label => field(label).value)

it('edits one project from the New requirement page head and leaves the other project\'s repositories alone', async () => {
  server.localProjects = [WIDGETS, OTHER]
  server.localIssues = [issue('q-widgets', 'p-widgets', 'Widgets requirement'), issue('q-other', 'p-other', 'Other requirement')]
  at({ page: 'newRequirement' })
  await mount()
  // The New requirement page head shows the current project's two repositories and offers its edit entry.
  expect(text()).toContain('acme/intake → acme/widgets')
  expect(text()).toContain('/srv/worktrees')
  await click(editButton())
  // The edit page is its own route with the current project's values already filled in.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.editProject'])
  expect(values()).toEqual(['Widgets', 'acme/intake', 'acme/widgets', '/srv/worktrees', '', '', ''])
  expect(all('textarea').map(area => area.getAttribute('aria-label'))).toEqual([zh['discuss.projectPrepare']])
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
  expect(values()).toEqual(['Other', 'acme/intake', 'acme/other', '', '', '', ''])
  await type(field(zh['discuss.projectName']), 'Other renamed')
  await click(zh['discuss.saveProject'])
  expect(putRequests()).toHaveLength(2)
  expect(putRequests()[1]).toMatchObject({ path: 'local/projects/p-other', body: { name: 'Other renamed', intakeRepository: 'acme/intake',
    codeRepository: 'acme/other', worktreeRoot: '' } })
  expect(server.localProjects.find(item => item.id === 'p-widgets'))
    .toMatchObject({ name: 'Widgets renamed', intakeRepository: 'acme/intake', codeRepository: 'acme/gadgets', worktreeRoot: '/srv/worktrees' })
  expect(text()).toContain('acme/intake → acme/other')
})

it('pre-fills and clears the project execution environment when editing', async () => {
  server.localProjects = [{ ...WIDGETS, prepare: 'npm ci', blockedCommands: ['rm', 'curl'] }, OTHER]
  at({ page: 'newRequirement' })
  await mount()
  await click(editButton())
  expect(values()).toEqual(['Widgets', 'acme/intake', 'acme/widgets', '/srv/worktrees', 'npm ci', 'rm curl', ''])
  // An emptied prepare is sent as the empty string and an emptied list as an empty array; both clear the stored fields.
  await type(field(zh['discuss.projectPrepare']), '   ')
  await type(field(zh['discuss.projectBlockedCommands']), '')
  await click(zh['discuss.saveProject'])
  expect(putRequests().at(-1)).toMatchObject({ path: 'local/projects/p-widgets',
    body: { name: 'Widgets', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets', worktreeRoot: '/srv/worktrees',
      prepare: '', blockedCommands: [] } })
  expect(server.localProjects.find(item => item.id === 'p-widgets')).not.toHaveProperty('prepare')
  expect(server.localProjects.find(item => item.id === 'p-widgets')).not.toHaveProperty('blockedCommands')
  expect(text()).not.toContain(zh['discuss.projectPrepareSet'])
})

it('keeps the edit page and its values when the update is refused, then clears an emptied worktree root', async () => {
  server.localProjects = [{ ...WIDGETS }, OTHER]
  at({ page: 'newRequirement' })
  await mount()
  await click(editButton())
  await type(field(zh['discuss.projectName']), 'Widgets kept')
  await type(field(zh['discuss.projectWorktreeRoot']), 'relative/root')
  await click(zh['discuss.saveProject'])
  // A refused save shows the existing localized refusal and leaves the person on the form with their edits intact.
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['userError.projectWorktreeRoot'])
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.editProject'])
  expect(values()).toEqual(['Widgets kept', 'acme/intake', 'acme/widgets', 'relative/root', '', '', ''])
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
  at({ page: 'newRequirement' })
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

it('shows each project\'s own bot account in the page head and the More menu, switching with the project', async () => {
  server.localProjects = [{ ...WIDGETS, cli: '/bot/gh-widgets', bot: 'widgets-bot[bot]' },
    { ...OTHER, cli: '/bot/gh-other', bot: 'other-bot[bot]' }]
  at({ page: 'newRequirement' })
  await mount()
  // The New requirement page head names the current project's bot beside its repositories.
  expect(text()).toContain(zh['discuss.projectBotAccount'].replace('{account}', 'widgets-bot[bot]'))
  expect(text()).not.toContain('other-bot[bot]')
  const strip = document.querySelector<HTMLElement>('.dt-project-strip')!
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, get: () => 640 })
  Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => 320 })
  try {
    await click(tab('Other'))
    // Switching the project switches the head's bot account; every menu row carries its own.
    expect(text()).toContain(zh['discuss.projectBotAccount'].replace('{account}', 'other-bot[bot]'))
    expect(text()).not.toContain('widgets-bot[bot]')
    await click(document.querySelector<HTMLElement>('.dt-project-more')!)
    const items = all('[role="menuitemradio"]')
    expect(items.map(item => item.textContent)).toEqual([
      `Widgets${'acme/intake → acme/widgets'}机器人 @widgets-bot[bot]`,
      `Other${'acme/intake → acme/other'}机器人 @other-bot[bot]`,
    ])
    // The edit form pre-fills the bot CLI of the project being edited, not the Source default.
    await click(document.querySelector<HTMLElement>('.dt-project-more')!)
    await click(editButton())
    expect(values()).toEqual(['Other', 'acme/intake', 'acme/other', '', '', '', '/bot/gh-other'])
  } finally {
    Reflect.deleteProperty(strip, 'scrollWidth')
    Reflect.deleteProperty(strip, 'clientWidth')
  }
})

it('keeps the edit page and typed values when the host refuses an unusable bot CLI', async () => {
  server.localProjects = [{ ...WIDGETS, cli: '/bot/gh-widgets', bot: 'widgets-bot[bot]' }, OTHER]
  server.refuseProjectCli = { cli: '/bad/gh', code: 'agentCliMissing',
    values: { chain: 'p-widgets', cli: '/bad/gh', output: '/bad/gh is not an executable file' }, detail: 'The bot CLI was not found.' }
  at({ page: 'newRequirement' })
  await mount()
  await click(editButton())
  await type(field(zh['discuss.projectBot']), '/bad/gh')
  await click(zh['discuss.saveProject'])
  // The refusal reaches the page in the panel's language, with the host's own line after it.
  const reason = zh['setup.agentCliMissing'].replace('{chain}', 'p-widgets').replace('{cli}', '/bad/gh')
  expect(document.querySelector('.dt-toast')?.textContent).toBe(`${reason}\n/bad/gh is not an executable file`)
  // The page and every typed value stay, so one field can be corrected instead of starting over.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe(zh['discuss.editProject'])
  expect(values()).toEqual(['Widgets', 'acme/intake', 'acme/widgets', '/srv/worktrees', '', '', '/bad/gh'])
  expect(putRequests().at(-1)).toMatchObject({ path: 'local/projects/p-widgets', body: { cli: '/bad/gh' } })
  expect(server.localProjects.find(item => item.id === 'p-widgets')?.cli).toBe('/bot/gh-widgets')
})

it('marks a project whose GitHub chain is missing and leaves a consistent project unmarked', async () => {
  server.localProjects = [{ ...WIDGETS, missingChain: 'p-widgets' }, OTHER]
  at({ page: 'requirements' })
  await mount()
  // The current project's page head says which chain is missing and where to add it back.
  expect(document.querySelector('.dt-page-head .dt-project-missing-chain')?.textContent)
    .toBe(zh['discuss.projectChainMissing'].replace('{chain}', 'p-widgets'))
  // The chip carries the same hint as its tooltip, and the strip keeps showing only the project name.
  expect(all('.dt-project-strip [role="tab"]').map(item => item.textContent)).toEqual(['Widgets', 'Other'])
  expect(tab('Widgets').getAttribute('title')).toBe(zh['discuss.projectChainMissing'].replace('{chain}', 'p-widgets'))
  // A project whose chain the Source still holds shows no hint at all.
  await click(tab('Other'))
  expect(document.querySelector('.dt-project-missing-chain')).toBeNull()
  expect(tab('Other').getAttribute('title')).toBeNull()
  expect(text()).not.toContain(zh['discuss.projectChainMissingShort'].replace('{chain}', 'p-widgets'))
})

it('names a missing chain in the More menu row', async () => {
  server.localProjects = [{ ...WIDGETS, missingChain: 'p-widgets' }, OTHER]
  at({ page: 'requirements' })
  await mount()
  const strip = document.querySelector<HTMLElement>('.dt-project-strip')!
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, get: () => 640 })
  Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => 320 })
  try {
    await click(tab('Other'))
    await click(document.querySelector<HTMLElement>('.dt-project-more')!)
    const rows = all('[role="menuitemradio"]')
    expect(rows.find(row => row.textContent?.startsWith('Widgets'))?.textContent)
      .toContain(zh['discuss.projectChainMissingShort'].replace('{chain}', 'p-widgets'))
    expect(rows.find(row => row.textContent?.startsWith('Other'))?.textContent)
      .not.toContain(zh['discuss.projectChainMissingShort'].replace('{chain}', 'p-widgets'))
  } finally {
    Reflect.deleteProperty(strip, 'scrollWidth')
    Reflect.deleteProperty(strip, 'clientWidth')
  }
})
