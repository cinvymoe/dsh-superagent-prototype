// @vitest-environment jsdom
// The Discussions tab: the current project's discussions, starting one from a dialog on the list, and reading one in
// two columns before sending its result to a requirement. A requirement made from a discussion links back to it.
import { expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { usePanel, mount, all, click, type, text, at, tab } from './fixtures/panel.tsx'
import { localDiscussion, localDiscussionAnswer, localDiscussionComment, localIssue, server } from './fixtures/panel-server.ts'

usePanel()

const PROJECT = { id: 'p-fixture', name: 'Widgets', chain: 'p-fixture', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets',
  createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z' }
const OTHER = { ...PROJECT, id: 'p-other', name: 'Other', intakeRepository: 'acme/intake', codeRepository: 'acme/other' }
/** The description box of the discussion and requirement dialogs. Dialogs render in a portal outside the page. */
const area = (label: string): HTMLTextAreaElement => {
  const match = all('textarea').find(element => element.getAttribute('placeholder') === label || element.getAttribute('aria-label') === label)
  if (!match) throw new Error(`No textarea ${label}`)
  return match as HTMLTextAreaElement
}
const button = (label: string): HTMLButtonElement => {
  const match = all('button').find(element => element.textContent?.trim() === label)
  if (!match) throw new Error(`No button ${label}`)
  return match as HTMLButtonElement
}
/** The rendered markdown messages of a discussion detail, in the order they appear. */
const messages = (): (string | null)[] => all('.dt-timeline .dt-md').map(node => node.textContent)
/** Whether `first` renders before `second` in the document. */
const precedes = (first: Element, second: Element) => !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

it('puts Discussions between Overview and Requirements and lists only the current project newest first', async () => {
  server.localProjects = [PROJECT, OTHER]
  server.localDiscussions = [
    { ...localDiscussion('Newer talk', 'Newer body', PROJECT.id, 'd-newer'), createdAt: '2026-09-24T00:00:00Z', issueId: 'q-1' },
    { ...localDiscussion('Older talk', 'Older body', PROJECT.id, 'd-older'), createdAt: '2026-09-20T00:00:00Z', state: 'closed' },
    localDiscussion('Other talk', 'Other body', OTHER.id, 'd-other'),
  ]
  at({ page: 'discussions' })
  await mount()
  expect(all('.dt-tabs [role="tab"]').map(item => item.textContent)).toEqual(['概览', '讨论', '需求列表', '来源', '触发', '评估',
    '执行', '设置'])
  expect(tab(zh['tab.discussions']).getAttribute('aria-selected')).toBe('true')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(text()).toContain(zh['discussion.listSubtitle'])
  expect(text()).toContain('acme/intake → acme/widgets')
  // The list is scoped to the current project and keeps the host's newest-first order.
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Newer talk', 'Older talk'])
  expect(text()).not.toContain('Other talk')
  const metas = all('.dt-cards .dt-row-meta').map(meta => meta.textContent ?? '')
  expect(metas[0]).toContain(zh['discussion.open'])
  expect(metas[0]).toContain(zh['discussion.linked'])
  expect(metas[0]).toContain('9月24日')
  expect(metas[1]).toContain(zh['discussion.closed'])
  expect(metas[1]).toContain(zh['discussion.unlinked'])
  // The list starts a discussion from a dialog, not from a box embedded in the page.
  expect(all('.dt-modal')).toHaveLength(0)
  expect(all('textarea')).toHaveLength(0)
  expect(server.requests.some(request => request.path === 'local/discussions?project=p-fixture')).toBe(true)
})

it('starts a discussion from a dialog on the list and opens it', async () => {
  server.localProjects = [PROJECT]
  at({ page: 'discussions' })
  await mount()
  expect(text()).toContain(zh['discussion.empty'])
  await click(button(zh['discussion.new']))
  expect(document.querySelector('.dt-modal h2')?.textContent).toBe(zh['discussion.new'])
  expect(button(zh['discussion.create']).disabled).toBe(true)
  await type(area(zh['discussion.newPlaceholder']), 'Try a different layout\n\nWith a second paragraph')
  await click(button(zh['discussion.create']))
  const posted = server.requests.find(request => request.path === 'local/discussions' && request.method === 'POST')!
  expect(posted.body).toEqual({ body: 'Try a different layout\n\nWith a second paragraph', project: 'p-fixture' })
  // The dialog closes as the new discussion opens on its own page, with the body once.
  expect(all('.dt-modal')).toHaveLength(0)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Try a different layout')
  expect(text()).toContain('With a second paragraph')
  expect((JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown }).route)
    .toEqual({ page: 'discussions', id: 'd-fixture-1' })
})

it('reads one discussion with its messages newest first, the follow-up box above them, and posts a comment', async () => {
  server.localProjects = [PROJECT]
  const base = localDiscussion('Layout talk', 'The body of the talk', PROJECT.id, 'd-talk')
  // The fake clock posts new comments on 2026-09-24, so the seeded messages are older and stay in a stable order.
  server.localDiscussions = [{ ...base, answers: [
    localDiscussionAnswer(base, 'First remark', '2026-09-20T00:00:01Z'),
    localDiscussionAnswer(base, 'Second remark', '2026-09-21T00:00:02Z')] }]
  at({ page: 'discussions', id: 'd-talk' })
  await mount()
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Layout talk')
  expect(text()).toContain('The body of the talk')
  expect(text()).toContain(zh['discussion.detail'])
  // Each message carries the Answerer's reply under it, newest exchange first.
  expect(messages()).toEqual(['Second remark', 'Answer to Second remark', 'First remark', 'Answer to First remark'])
  // The follow-up box sits above the list, so a submitted comment lands first, directly under it.
  expect(precedes(area(zh['discussion.commentPlaceholder']), all('.dt-timeline')[0]!)).toBe(true)
  await type(area(zh['discussion.commentPlaceholder']), 'A third remark')
  await click(button(zh['discussion.comment']))
  const posted = server.requests.find(request => request.path === 'local/discussions/d-talk/comments' && request.method === 'POST')!
  expect(posted.body).toEqual({ text: 'A third remark' })
  expect(messages()[0]).toBe('A third remark')
  expect((area(zh['discussion.commentPlaceholder']) as HTMLTextAreaElement).value).toBe('')
})

it('closes the discussion from its result panel and hides the action afterwards', async () => {
  server.localProjects = [PROJECT]
  server.localDiscussions = [localDiscussion('Close me', 'Body', PROJECT.id, 'd-close')]
  at({ page: 'discussions', id: 'd-close' })
  await mount()
  await click(button(zh['discussion.close']))
  expect(server.requests.some(request => request.path === 'local/discussions/d-close/close' && request.method === 'POST')).toBe(true)
  expect(text()).toContain(zh['discussion.closed'])
  expect(all('button').some(item => item.textContent?.trim() === zh['discussion.close'])).toBe(false)
})

it('hands a requirement\'s discussion conclusion to the Aligner from its result panel, once', async () => {
  server.localProjects = [PROJECT]
  const talk = localDiscussion('Design the layout', 'Design the layout\n\nDetails', PROJECT.id, 'd-handoff')
  server.localDiscussions = [{ ...talk, issueId: 'q-created', updatedAt: '2026-09-24T00:00:00Z',
    answers: [localDiscussionAnswer(talk, 'Design the layout', '2026-09-24T00:00:00Z')] }]
  server.localIssues = [{ ...localIssue('Design the layout', 'Design the layout\n\nDetails'), id: 'q-created', discussionId: 'd-handoff' }]
  at({ page: 'discussions', id: 'd-handoff' })
  await mount()
  await click(button(zh['discussion.handoff']))
  const posted = server.requests.find(request => request.path === 'local/discussions/d-handoff/handoff')
  expect(posted?.method).toBe('POST')
  // The panel shows the alignment ticket it started and never offers a second hand-off.
  expect(text()).toContain(zh['discussion.handoffTo'].replace('{ticket}', 't-align-d-handoff'))
  expect(all('button').some(item => item.textContent?.trim() === zh['discussion.handoff'])).toBe(false)
  expect(all('button').some(item => item.textContent?.trim() === zh['discussion.handedOff'])).toBe(true)
})

it('sends a discussion result to a requirement dialog and creates it, linked back to the discussion', async () => {
  server.localProjects = [PROJECT]
  server.localDiscussions = [{ ...localDiscussion('Design the layout', 'Design the layout\n\nDetails from the discussion', PROJECT.id,
    'd-design'), issueId: 'q-created' }]
  server.localIssues = [{ ...localIssue('Design the layout', 'Design the layout\n\nDetails from the discussion'), id: 'q-created',
    discussionId: 'd-design' }]
  at({ page: 'discussions', id: 'd-design' })
  await mount()
  // The result panel offers the requirement it already made, never a second send.
  expect(all('button').some(item => item.textContent?.trim() === zh['discussion.sendIssue'])).toBe(false)
  await click(button(zh['discussion.openIssue']))
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Design the layout')
  expect((JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown }).route)
    .toEqual({ page: 'requirements', id: 'q-created' })

  // A discussion that has no requirement yet sends its result into the requirement dialog.
  server.localDiscussions = [localDiscussion('Prefill talk', 'Prefill body\n\nMore text', PROJECT.id, 'd-prefill')]
  at({ page: 'discussions', id: 'd-prefill' })
  await mount()
  await click(button(zh['discussion.sendIssue']))
  expect(document.querySelector('.dt-modal h2')?.textContent).toBe(zh['discuss.new'])
  expect(text()).toContain(zh['discussion.prefill'].replace('{title}', 'Prefill talk'))
  expect(area(zh['discuss.descriptionPlaceholder']).value).toBe('Prefill body\n\nMore text')
  await click(button(zh['discuss.submit']))
  const posted = server.requests.find(request => request.path === 'local/issues' && request.method === 'POST')!
  expect(posted.body).toMatchObject({ body: 'Prefill body\n\nMore text', project: 'p-fixture', discussion: 'd-prefill' })
  // Submitting closes the dialog and lands on the requirement detail, which names the source discussion.
  expect(all('.dt-modal')).toHaveLength(0)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Prefill body')
  const back = all('button').find(item => item.textContent?.trim() === zh['discussion.source'].replace('{title}', 'Prefill talk'))
  expect(back).toBeDefined()
  await click(back!)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Prefill talk')
  expect((JSON.parse(sessionStorage.getItem('dsh-superagent/route') ?? '{}') as { route?: unknown }).route)
    .toEqual({ page: 'discussions', id: 'd-prefill' })
})

it('keeps the discussions list when the current project changes', async () => {
  server.localProjects = [PROJECT, OTHER]
  server.localDiscussions = [localDiscussion('Widgets talk', '', PROJECT.id, 'd-widgets'),
    localDiscussion('Other talk', '', OTHER.id, 'd-other')]
  at({ page: 'discussions' })
  await mount()
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Widgets talk'])
  await click(tab('Other'))
  expect(tab(zh['tab.discussions']).getAttribute('aria-selected')).toBe('true')
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Other')
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Other talk'])
  expect(server.requests.some(request => request.path === 'local/discussions?project=p-other')).toBe(true)
})

it('shows the discussion pages in English as well', async () => {
  server.localProjects = [PROJECT]
  server.localDiscussions = [localDiscussion('English talk', 'English body', PROJECT.id, 'd-english')]
  at({ page: 'discussions' })
  await mount(en)
  expect(all('.dt-tabs [role="tab"]').slice(0, 3).map(item => item.textContent)).toEqual(['Overview', 'Discussions', 'Requirements'])
  expect(tab(en['tab.discussions']).getAttribute('aria-selected')).toBe('true')
  expect(text()).toContain(en['discussion.listSubtitle'])
  expect(text()).toContain(en['discussion.new'])
  expect(text()).toContain(en['discussion.unlinked'])
  await click(all('.dt-cards .dt-row-title button')[0]!)
  expect(text()).toContain(en['discussion.detail'])
  expect(text()).toContain(en['discussion.messages'])
  expect(all('button').some(item => item.textContent?.trim() === en['discussion.sendIssue'])).toBe(true)
})

it('still shows a message written before answers were recorded', async () => {
  server.localProjects = [PROJECT]
  const base = localDiscussion('Old talk', 'Old body', PROJECT.id, 'd-old')
  server.localDiscussions = [base]
  server.localDiscussionComments = { 'd-old': [localDiscussionComment(base, 'An older remark', '2026-09-19T00:00:00Z')] }
  at({ page: 'discussions', id: 'd-old' })
  await mount()
  // The body is shown once above the timeline; the message recorded before answers existed still shows there.
  expect(messages()).toEqual(['An older remark'])
})