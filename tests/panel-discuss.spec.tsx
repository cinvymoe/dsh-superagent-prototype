// @vitest-environment jsdom
// The New requirement and Requirements pages scoped to the current local project, and the standalone project creation page.
import { act } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { usePanel, mount, remount, all, click, settle, type, text, at, tab } from './fixtures/panel.tsx'
import { localComment, localIssue, localReply, server, threadSummary, ticketSummary } from './fixtures/panel-server.ts'

usePanel()

// jsdom implements neither object-URL call; the detail gallery creates one blob URL per image and revokes it on unmount.
const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:requirement-image')
const revokeObjectURL = vi.fn((_url: string) => {})
beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
})

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
const PROJECT = { id: 'p-fixture', name: 'Widgets', chain: 'p-fixture', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets',
  createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z' }
/** The message timeline section of a requirement detail. */
const timelineSection = (): HTMLElement => {
  const match = all('.dt-section').find(section => section.querySelector('.dt-section-name')?.textContent === zh['discuss.timeline'])
  if (!match) throw new Error('No message timeline section')
  return match
}
/** The follow-up submit button inside the message timeline box. */
const commentButton = (): HTMLButtonElement => {
  const match = all('.dt-timeline-form button').find(button => button.textContent?.trim() === zh['discuss.comment'])
  if (!match) throw new Error('No comment button')
  return match as HTMLButtonElement
}
/** The rendered messages of the message timeline, in the order they appear. */
const messages = (): (string | null)[] => all('.dt-timeline .dt-md').map(node => node.textContent)
/** Whether `first` renders before `second` in the document. */
const precedes = (first: Element, second: Element) => !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

it('creates a project on its own page with an optional absolute worktree root and makes it current', async () => {
  at({ page: 'requirements' })
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
  // The new project is the current tab and its requirement list opens.
  expect(document.querySelector('.dt-project-tab[aria-selected="true"]')?.textContent).toBe('Rooted')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Rooted')
  expect(text()).toContain('acme/intake → acme/rooted')
  expect(text()).toContain('/srv/worktrees')
  expect(tab(zh['tab.requirements']).getAttribute('aria-selected')).toBe('true')
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture')).toBe(true)
})

it('omits the worktree root from the payload when the field is left empty', async () => {
  at({ page: 'requirements' })
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

it('shows only the current project and one description field on New requirement', async () => {
  server.localProjects = [PROJECT, { ...PROJECT, id: 'p-other', name: 'Other', repository: 'acme/other' }]
  server.localIssues = [localIssue('Existing requirement')]
  at({ page: 'newRequirement' })
  await mount()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(text()).toContain(zh['discuss.newSubtitle'])
  expect(text()).toContain('acme/widgets')
  // The page has no title text input (only the hidden image file picker), no requirement list and no back button, in
  // particular none labelled Overview; its head carries only the entry that opens the current project's edit form.
  expect(all('#dt-page input').filter(element => (element as HTMLInputElement).type !== 'file')).toHaveLength(0)
  expect(all('.dt-cards')).toHaveLength(0)
  expect(all('.dt-page-head button').map(button => button.textContent?.trim())).toEqual([zh['discuss.editProject']])
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
  // The filter row is in a fixed order and defaults to 待处理.
  expect(all('.dt-filters .dt-pill').map(pill => pill.textContent)).toEqual([zh['requirementFilter.pending'],
    zh['requirementFilter.confirmed'], zh['requirementFilter.closed'], zh['requirementFilter.all']])
  expect(all('.dt-filters .dt-pill').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
  // The default bucket hides the closed requirement, and the section counts only the displayed rows.
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Newer requirement'])
  expect(document.querySelector('.dt-section .dt-count')?.textContent).toBe('1')
  expect(text()).not.toContain('Other requirement')
  const metas = all('.dt-cards .dt-row-meta').map(meta => meta.textContent ?? '')
  expect(metas[0]).toContain(zh['discuss.open'])
  expect(metas[0]).toContain(zh['discuss.proposed'])
  expect(metas[0]).toContain('2 个切片')
  expect(server.requests.some(request => request.path === 'local/issues?project=p-fixture')).toBe(true)
  // 全部 shows every requirement in the host's newest-first order, and the click replaces the current entry.
  await click(zh['requirementFilter.all'])
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Newer requirement', 'Older requirement'])
  expect(document.querySelector('.dt-section .dt-count')?.textContent).toBe('2')
  const allState = JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown; stack?: unknown[] }
  expect(allState.route).toEqual({ page: 'requirements', query: { filter: 'all' } })
  expect(allState.stack).toEqual([])
  // 已关闭 shows only the closed one, still in newest-first order.
  await click(zh['requirementFilter.closed'])
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Older requirement'])
  expect(all('.dt-filters .dt-pill').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])
  const closedMetas = all('.dt-cards .dt-row-meta').map(meta => meta.textContent ?? '')
  expect(closedMetas[0]).toContain(zh['discuss.closed'])
  expect(closedMetas[0]).toContain(zh['discuss.pending'])
  expect(closedMetas[0]).toContain('0 个切片')
  const closedState = JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown; stack?: unknown[] }
  expect(closedState.route).toEqual({ page: 'requirements', query: { filter: 'closed' } })
  expect(closedState.stack).toEqual([])
  // 待处理 is canonical: its click writes no filter query and still replaces the current entry.
  await click(zh['requirementFilter.pending'])
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Newer requirement'])
  const pendingState = JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown; stack?: unknown[] }
  expect(pendingState.route).toEqual({ page: 'requirements' })
  expect(pendingState.stack).toEqual([])
  // A row opens its requirement detail, which carries no filter query under the default bucket either.
  await click(all('.dt-cards .dt-row-title button')[0]!)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Newer requirement')
  expect(server.requests.some(request => request.path === 'local/issues/q-newer')).toBe(true)
  expect((JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown }).route)
    .toEqual({ page: 'requirements', id: 'q-newer' })
})

it('keeps a non-default filter when a requirement detail returns to the list', async () => {
  server.localProjects = [PROJECT]
  const confirmed = { ...localIssue('Confirmed requirement'), id: 'q-confirmed', alignment: { status: 'confirmed' as const, summary: '',
    slices: [], acceptance: [], proposedAt: '2026-09-23T00:00:00Z' } }
  server.localIssues = [confirmed, { ...localIssue('Pending requirement'), id: 'q-pending' }]
  at({ page: 'requirements', query: { filter: 'confirmed' } })
  await mount()
  expect(all('.dt-filters .dt-pill').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Confirmed requirement'])
  await click(all('.dt-cards .dt-row-title button')[0]!)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Confirmed requirement')
  expect((JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown }).route)
    .toEqual({ page: 'requirements', id: 'q-confirmed', query: { filter: 'confirmed' } })
  // Back returns to the same filtered list instead of dropping the filter.
  await click(document.querySelector<HTMLElement>('.dt-page-head button')!)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(all('.dt-filters .dt-pill').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Confirmed requirement'])
  expect((JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown }).route)
    .toEqual({ page: 'requirements', query: { filter: 'confirmed' } })
})

it('shows the filtered empty copy for an empty bucket and the original copy for a project without requirements', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [{ ...localIssue('Closed only'), state: 'closed' as const }]
  at({ page: 'requirements' })
  await mount()
  // The project has requirements, so the default empty bucket names the filter instead of the project being empty.
  expect(text()).toContain(zh['discuss.emptyFilter'])
  expect(text()).not.toContain(zh['discuss.empty'])
  expect(all('.dt-cards .dt-row')).toHaveLength(0)
  expect(document.querySelector('.dt-section .dt-count')?.textContent).toBe('0')
  // A project with no requirements at all keeps the original empty copy.
  server.localIssues = []
  at({ page: 'requirements' })
  await remount()
  expect(text()).toContain(zh['discuss.empty'])
  expect(text()).not.toContain(zh['discuss.emptyFilter'])
})

it('names the requirement filters and the filtered empty copy in English as well', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [{ ...localIssue('Closed only'), state: 'closed' as const }]
  at({ page: 'requirements' })
  await mount()
  await remount(en)
  expect(all('.dt-filters .dt-pill').map(pill => pill.textContent)).toEqual([en['requirementFilter.pending'],
    en['requirementFilter.confirmed'], en['requirementFilter.closed'], en['requirementFilter.all']])
  expect(all('.dt-filters .dt-pill').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
  // The default bucket is empty here, so the English filtered copy names the filter rather than an empty project.
  expect(text()).toContain(en['discuss.emptyFilter'])
  expect(text()).not.toContain(en['discuss.empty'])
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

it('opens each linked Ticket\'s started Executor Session from the requirement detail', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Linked requirement')]
  server.threadPages = () => ({ ...threadSummary(), correlated: [], decisions: [], earlier: null, context: [], timeline: [],
    tickets: [ticketSummary(), ticketSummary({ id: 't2', title: '尚未启动', sessionId: '' }),
      ticketSummary({ id: 't3', title: '另一个工单', sessionId: 'worker-t3' })] })
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  // The page has several sections with rows, so the linked-Tickets one is found by its heading.
  const linked = (dictionary: Record<string, string>) => {
    const section = all('.dt-section').find(item => item.querySelector('.dt-section-name')?.textContent === dictionary['discuss.tickets'])
    if (!section) throw new Error('No linked Tickets section')
    return section
  }
  const rows = [...linked(zh).querySelectorAll<HTMLElement>('.dt-row')]
  expect(rows.map(row => row.querySelector('.dt-row-title')?.textContent)).toEqual(['修复回归', '尚未启动', '另一个工单'])
  const sessionButtons = (label: string) => rows.map(row => [...row.querySelectorAll('button')]
    .filter(button => button.textContent?.trim() === label))
  // Only the Tickets that started an Executor Session carry the localized Session button.
  expect(sessionButtons(zh['openSession']).map(buttons => buttons.length)).toEqual([1, 0, 1])
  expect(server.opened).toEqual([])
  await click(sessionButtons(zh['openSession'])[2]![0]!)
  expect(server.opened).toEqual(['worker-t3'])
  // The title link still enters that Ticket's Execution detail instead of opening its Session.
  await click(rows[0]!.querySelector<HTMLElement>('.dt-row-title .dt-textlink')!)
  expect(server.requests.some(request => request.method === 'GET' && request.path === 'tickets/t1')).toBe(true)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('修复回归')
  expect(server.opened).toEqual(['worker-t3'])
  // English keeps the existing label and the same conditional rendering.
  at({ page: 'requirements', id: 'q-fixture' })
  await remount(en)
  const englishRows = [...linked(en).querySelectorAll<HTMLElement>('.dt-row')]
  expect(englishRows.map(row => [...row.querySelectorAll('button')].filter(button => button.textContent?.trim() === en['openSession'])
    .length)).toEqual([1, 0, 1])
})

it('lists the message timeline newest first and keeps the follow-up box above the list', async () => {
  server.localProjects = [PROJECT]
  const issue = localIssue('Talked through requirement', 'The original description')
  server.localIssues = [issue]
  // Preset conversation: two human follow-ups around one agent reply, all later than the requirement itself.
  server.localComments = { 'q-fixture': [localComment(issue, 'First follow-up', '2026-09-23T01:00:00Z'),
    localComment(issue, 'Second follow-up', '2026-09-23T03:00:00Z')] }
  server.localReplies = { 'q-fixture': [localReply(issue, 'The agent answered', '2026-09-23T02:00:00Z')] }
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  // Newest first, whichever side sent the message: the earliest one falls to the bottom of the list.
  expect(messages()).toEqual(['Second follow-up', 'The agent answered', 'First follow-up'])
  expect(all('.dt-timeline .dt-event')).toHaveLength(3)
  expect(timelineSection().querySelector('.dt-count')?.textContent).toBe('3')
  // The requirement text still renders once, outside the timeline.
  expect(text().split('The original description').length - 1).toBe(1)
  expect(timelineSection().textContent).not.toContain('The original description')
  // An agent reply keeps its own label.
  expect(all('.dt-timeline .dt-event')[1]!.textContent).toContain(zh['discuss.agent'])
  expect(text()).not.toContain('discuss.')
  // The box sits above the list, so the newest message renders directly under it.
  const form = timelineSection().querySelector('.dt-timeline-form')!
  expect(precedes(form, timelineSection().querySelector('ul.dt-timeline')!)).toBe(true)
})

it('posts a follow-up from the box above the list and shows it first with the count grown and the box cleared', async () => {
  server.localProjects = [PROJECT]
  const issue = localIssue('Live requirement', 'The live description')
  server.localIssues = [issue]
  server.localComments = { 'q-fixture': [localComment(issue, 'Earlier follow-up', '2026-09-23T01:00:00Z')] }
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(commentButton().disabled).toBe(true)
  await type(area(zh['discuss.commentPlaceholder']), '   ')
  expect(commentButton().disabled).toBe(true)
  await type(area(zh['discuss.commentPlaceholder']), 'Newest follow-up')
  expect(commentButton().disabled).toBe(false)
  await click(commentButton())
  const posted = server.requests.find(request => request.path === 'local/issues/q-fixture/comments')!
  expect(posted).toMatchObject({ method: 'POST', body: { text: 'Newest follow-up' } })
  // The submitted message is the first row under the box, the count grew and the box is ready for the next one.
  expect(messages()).toEqual(['Newest follow-up', 'Earlier follow-up'])
  expect(timelineSection().querySelector('.dt-count')?.textContent).toBe('2')
  expect(area(zh['discuss.commentPlaceholder']).value).toBe('')
  expect(precedes(timelineSection().querySelector('.dt-timeline-form')!, timelineSection().querySelector('ul.dt-timeline')!)).toBe(true)
})

it('renders the newest-first message timeline and its top follow-up box in English', async () => {
  server.localProjects = [PROJECT]
  const issue = localIssue('English requirement', 'The English description')
  server.localIssues = [issue]
  server.localComments = { 'q-fixture': [localComment(issue, 'English follow-up', '2026-09-23T01:00:00Z')] }
  server.localReplies = { 'q-fixture': [localReply(issue, 'The English answer', '2026-09-23T02:00:00Z')] }
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  await remount(en)
  expect(text()).toContain(en['discuss.timeline'])
  expect(area(en['discuss.commentPlaceholder']).getAttribute('aria-label')).toBe(en['discuss.commentPlaceholder'])
  expect(all('.dt-timeline-form button').map(button => button.textContent?.trim())).toContain(en['discuss.comment'])
  expect(messages()).toEqual(['The English answer', 'English follow-up'])
  expect(all('.dt-timeline .dt-event')[0]!.textContent).toContain(en['discuss.agent'])
  // A missing locale key would render as its own key, so none may survive.
  expect(text()).not.toContain('discuss.')
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
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(text()).toContain('项目：Widgets · acme/intake → acme/widgets · /srv/worktrees')
})

it('renders a legacy requirement whose project has no worktree root', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [localIssue('Legacy requirement')]
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(text()).toContain('项目：Widgets · acme/intake → acme/widgets')
  expect(text()).not.toContain('/srv/worktrees')
})

/** A one-slice alignment proposal, enough for the requirement detail to offer its execution switch. */
const proposal = (status: 'proposed' | 'confirmed') => ({ status, summary: '', acceptance: [],
  slices: [{ id: 'C1', title: 'One', outcome: '', inScope: [], outOfScope: [], acceptance: [], dependsOn: [], lane: 'full' as const }],
  proposedAt: '2026-09-23T00:00:00Z', ...(status === 'confirmed' ? { decidedAt: '2026-09-23T00:00:00Z' } : {}) })

it('starts the execution switch off and saves feature-exec before the alignment is confirmed', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [{ ...localIssue('Switched requirement'), alignment: proposal('proposed') }]
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  const toggle = document.querySelector<HTMLElement>('[role="switch"]')!
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  expect(toggle.getAttribute('aria-label')).toBe(zh['discuss.executionSwitch'])
  expect(text()).toContain(zh['discuss.executionSwitch'])
  await click(toggle)
  const posted = server.requests.find(request => request.path === 'local/issues/q-fixture/execution')!
  expect(posted).toMatchObject({ method: 'POST', body: { mode: 'feature-exec' } })
  expect(server.localIssues[0]?.execution).toBe('feature-exec')
  expect(document.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
  // A refresh reads the stored mode back, so the switch stays on instead of falling back to native.
  await remount()
  expect(document.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
})

it('fixes the execution mode once the requirement dispatched tickets', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [{ ...localIssue('Dispatched requirement'), execution: 'feature-exec' as const,
    alignment: proposal('confirmed') }]
  server.dispatchedIssues.add('q-fixture')
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  expect(document.querySelector('[role="switch"]')).toBe(null)
  expect(all('.dt-tag').map(tag => tag.textContent)).toContain(zh['discuss.executionFeatureExec'])
  expect(text()).toContain(zh['discuss.executionLocked'])
  expect(text()).toContain('C1 · dispatched slice')
})

it('shows the execution mode on every requirement list row, native when unchosen', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [{ ...localIssue('Feature requirement'), id: 'q-feature', execution: 'feature-exec' as const },
    { ...localIssue('Native requirement'), id: 'q-native' }]
  at({ page: 'requirements' })
  await mount()
  const metas = all('.dt-cards .dt-row-meta').map(meta => meta.textContent ?? '')
  expect(metas[0]).toContain(zh['discuss.executionFeatureExec'])
  expect(metas[1]).toContain(zh['discuss.executionNative'])
  expect(metas[1]).not.toContain(zh['discuss.executionFeatureExec'])
})

it('shows the localized refusal when the worktree root is relative and stays on the creation page', async () => {
  at({ page: 'requirements' })
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

/** Build an image file of the given name and content. The client trusts the declared type, so the bytes do not matter. */
const imageFile = (name: string, content = 'x', type = 'image/png') => new File([content], name, { type })
/** Choose files through the New requirement page's hidden picker, waiting until the FileReader results have rendered. */
async function selectImages(files: File[]) {
  const picker = input(zh['discuss.imagesChoose']) as HTMLInputElement
  Object.defineProperty(picker, 'files', { value: files, configurable: true })
  await act(async () => {
    picker.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  await settle()
}

it('selects several images with thumbnails and names, submits description and images together, and shows them in order', async () => {
  server.localProjects = [PROJECT]
  at({ page: 'newRequirement' })
  await mount()
  const description = 'Ship the widget\n\nwith screenshots'
  await type(area(zh['discuss.descriptionPlaceholder']), description)
  expect(text()).toContain(zh['discuss.imagesHint'])
  await selectImages([imageFile('one.png', 'a'), imageFile('two.png', 'bb')])
  expect(all('.dt-image-choice')).toHaveLength(2)
  expect(all('.dt-image-thumb').map(image => image.getAttribute('alt'))).toEqual(['one.png', 'two.png'])
  expect(all('.dt-image-name').map(name => name.textContent)).toEqual(['one.png', 'two.png'])
  await click(submitButton())
  const posted = server.requests.find(request => request.path === 'local/issues' && request.method === 'POST')!
  expect(posted).toMatchObject({ method: 'POST', body: { body: description, project: 'p-fixture' } })
  const images = (posted.body as { images: { name: string; mediaType: string; data: string }[] }).images
  expect(images.map(image => image.name)).toEqual(['one.png', 'two.png'])
  expect(images.every(image => image.mediaType === 'image/png' && image.data.startsWith('data:image/png;base64,'))).toBe(true)
  // The detail shows the images in the order they were chosen, each with its file name and byte size.
  await vi.waitFor(() => expect(all('.dt-image-card img')).toHaveLength(2))
  expect(all('.dt-image-caption').map(caption => caption.textContent)).toEqual(['one.png · 1 B', 'two.png · 2 B'])
  // The original Trigger carries the appended image paths, yet the description still reads once and stays out of the timeline.
  expect(text().split('with screenshots').length - 1).toBe(1)
  expect(document.querySelector('.dt-timeline')?.textContent).not.toContain('with screenshots')
})

it('removes a chosen image before submitting, posting and rendering only the remaining one', async () => {
  server.localProjects = [PROJECT]
  at({ page: 'newRequirement' })
  await mount()
  await type(area(zh['discuss.descriptionPlaceholder']), 'Only the second image')
  await selectImages([imageFile('one.png'), imageFile('two.png')])
  expect(all('.dt-image-choice')).toHaveLength(2)
  const remove = all('button').find(button => button.getAttribute('aria-label') === `${zh['discuss.imagesRemove']} one.png`)!
  await click(remove)
  expect(all('.dt-image-choice')).toHaveLength(1)
  expect(all('.dt-image-name').map(name => name.textContent)).toEqual(['two.png'])
  await click(submitButton())
  const posted = server.requests.find(request => request.path === 'local/issues' && request.method === 'POST')!
  expect((posted.body as { images: { name: string }[] }).images.map(image => image.name)).toEqual(['two.png'])
  await vi.waitFor(() => expect(all('.dt-image-card img')).toHaveLength(1))
  expect(all('.dt-image-caption').map(caption => caption.textContent)).toEqual(['two.png · 1 B'])
})

it('refuses an unsupported type and an oversized file locally without submitting or showing a thumbnail', async () => {
  server.localProjects = [PROJECT]
  at({ page: 'newRequirement' })
  await mount()
  await type(area(zh['discuss.descriptionPlaceholder']), 'Needs screenshots')
  await selectImages([new File(['x'], 'note.txt', { type: 'text/plain' })])
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['discuss.imagesRefuseType'].replace('{name}', 'note.txt'))
  expect(all('.dt-image-choice')).toHaveLength(0)
  const big = imageFile('big.png')
  Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 })
  await selectImages([big])
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['discuss.imagesRefuseSize'].replace('{name}', 'big.png'))
  expect(all('.dt-image-choice')).toHaveLength(0)
  expect(server.requests.some(request => request.path === 'local/issues' && request.method === 'POST')).toBe(false)
})

it('keeps the description and chosen images and shows the localized error when the host refuses the create', async () => {
  server.localProjects = [PROJECT]
  server.refuseIssueCreate = { status: 400, error: 'refused', code: 'issueImageType', values: { name: 'bad.png' } }
  at({ page: 'newRequirement' })
  await mount()
  const description = 'Ship it with a bad image'
  await type(area(zh['discuss.descriptionPlaceholder']), description)
  await selectImages([imageFile('one.png'), imageFile('two.png')])
  await click(submitButton())
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['userError.issueImageType'].replace('{name}', 'bad.png'))
  expect(area(zh['discuss.descriptionPlaceholder']).value).toBe(description)
  expect(all('.dt-image-choice')).toHaveLength(2)
  // The refusal keeps the form on the New requirement page instead of opening a detail.
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
})

it('shows the image count on a requirement list row only when the issue has images', async () => {
  server.localProjects = [PROJECT]
  const withImages = { ...localIssue('With images'), images: [
    { id: 'img-1', name: 'a.png', mediaType: 'image/png', bytes: 10 },
    { id: 'img-2', name: 'b.png', mediaType: 'image/png', bytes: 20 }] }
  const withoutImages = { ...localIssue('Without images'), id: 'q-plain' }
  server.localIssues = [withImages, withoutImages]
  at({ page: 'requirements' })
  await mount()
  const metas = all('.dt-cards .dt-row-meta').map(meta => meta.textContent ?? '')
  expect(metas[0]).toContain(zh['discuss.imageCount'].replace('{count}', '2'))
  expect(metas[1]).not.toContain(zh['discuss.imageCount'].replace('{count}', '2'))
})

it('reads each requirement image through the management API with the same-origin header and renders a blob URL', async () => {
  server.localProjects = [PROJECT]
  server.localIssues = [{ ...localIssue('With one image'), images: [
    { id: 'img-1', name: 'a.png', mediaType: 'image/png', bytes: 10 }] }]
  at({ page: 'requirements', id: 'q-fixture' })
  await mount()
  await vi.waitFor(() => expect(all('.dt-image-card img')).toHaveLength(1))
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/images/img-1'))
  expect(calls).toHaveLength(1)
  expect(calls[0]![1]).toMatchObject({ headers: { 'x-orchestrator-request': '1' } })
  expect(createObjectURL).toHaveBeenCalled()
  expect(all('.dt-image-card img')[0]!.getAttribute('src')).toBe('blob:requirement-image')
})
