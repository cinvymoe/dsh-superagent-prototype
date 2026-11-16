// @vitest-environment jsdom
// The Discussions tab: the current project's discussions, starting one from a dialog on the list, and reading one in
// two columns before sending its result to a requirement. A requirement made from a discussion links back to it.
import { act } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { usePanel, mount, all, click, type, text, at, tab, settle } from './fixtures/panel.tsx'
import { localAsk, localDiscussion, localDiscussionAnswer, localDiscussionComment, localIssue, server } from './fixtures/panel-server.ts'

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
const messages = (): (string | null)[] => all('.dt-chat .dt-md').map(node => node.textContent)
/** The conclusion cards of the right column, in the order they render (newest first). */
const conclusionTitles = (): (string | null)[] => all('.dt-result-panel .dt-disclosure-title').map(node => node.textContent)
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

it('folds a long message until a person asks for the rest', async () => {
  server.localProjects = [PROJECT]
  const base = localDiscussion('Long talk', 'A short body', PROJECT.id, 'd-long')
  const long = 'A long answer about the layout, the copy and the order of the page. '.repeat(20)
  server.localDiscussions = [{ ...base, answers: [
    localDiscussionAnswer(base, 'Short remark', '2026-09-20T00:00:01Z', { answer: long })] }]
  at({ page: 'discussions', id: 'd-long' })
  await mount()
  // The long answer folds; the short message next to it keeps its height.
  expect(all('.dt-chat-body').filter(body => body.hasAttribute('data-folded'))).toHaveLength(1)
  const more = all('.dt-chat-more')
  expect(more).toHaveLength(1)
  expect(more[0]!.textContent).toBe(zh['discussion.unfold'])
  expect(more[0]!.getAttribute('aria-expanded')).toBe('false')
  await click(more[0]!)
  expect(all('.dt-chat-body').filter(body => body.hasAttribute('data-folded'))).toHaveLength(0)
  expect(all('.dt-chat-more')[0]!.textContent).toBe(zh['discussion.fold'])
  expect(all('.dt-chat-more')[0]!.getAttribute('aria-expanded')).toBe('true')
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
  // Chat reads oldest first, each message carrying the Answerer's reply under it.
  expect(messages()).toEqual(['First remark', 'Answer to First remark', 'Second remark', 'Answer to Second remark'])
  expect(all('.dt-chat-message').map(item => item.getAttribute('data-side'))).toEqual(['mine', 'other', 'mine', 'other'])
  // The conclusions stay folded in the right column, newest first.
  expect(conclusionTitles()).toEqual([zh['discussion.roundTitle'].replace('{round}', '2'),
    zh['discussion.roundTitle'].replace('{round}', '1')])
  expect(all('.dt-result-panel .dt-disclosure[data-open]')).toHaveLength(0)
  // The follow-up box sits above the chat, so a submitted comment lands at its end, directly under it.
  expect(precedes(area(zh['discussion.commentPlaceholder']), all('.dt-chat')[0]!)).toBe(true)
  await type(area(zh['discussion.commentPlaceholder']), 'A third remark')
  await click(button(zh['discussion.comment']))
  const posted = server.requests.find(request => request.path === 'local/discussions/d-talk/comments' && request.method === 'POST')!
  expect(posted.body).toEqual({ text: 'A third remark' })
  expect(messages()).toContain('A third remark')
  expect(all('.dt-chat-message[data-side="mine"] .dt-md').at(-1)?.textContent).toBe('A third remark')
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
  // The hand-off opens its own tab on the round it started, with the alignment ticket behind it.
  const tabs = all('.dt-subtab')
  expect(tabs.map(item => item.textContent)).toEqual([zh['discussion.tabDiscussion'],
    zh['discussion.tabAlignment'].replace('{round}', '1')])
  expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
  expect(document.querySelector('[data-alignment="al-1"]')?.textContent).toContain('t-align-d-handoff')
  // Back on the discussion, the conclusion is handed over and no button offers a second hand-off.
  await click(all('.dt-subtab')[0]!)
  expect(button(zh['discussion.handoff']).disabled).toBe(true)
  expect(text()).toContain(zh['discussion.handedOff'])
})

it("puts the Answerer's questions on one card and sends the person's answers back as one message", async () => {
  const talk = localDiscussion('Design the layout', 'Design the layout\n\nDetails', PROJECT.id, 'd-ask')
  server.localProjects = [PROJECT]
  server.localDiscussions = [{ ...talk, updatedAt: '2026-09-24T00:00:00Z', asks: [localAsk('ask-1')] }]
  at({ page: 'discussions', id: 'd-ask' })
  await mount()
  // One card holds every question the Answerer put, with its proposed answers as buttons and a field for another one.
  const card = document.querySelector('.dt-ask-card')!
  expect(card.textContent).toContain(zh['discussion.ask'])
  expect(card.textContent).toContain(zh['discussion.askOpen'])
  expect(card.textContent).toContain('Which layout should the panel keep?')
  expect(card.textContent).toContain('May the delete button stay?')
  const send = button(zh['discussion.askSend'])
  expect(send.disabled).toBe(true)
  await click(button('Two columns'))
  await type(all('.dt-ask-item input')[1] as HTMLInputElement, 'Only while it is about no requirement')
  expect(button(zh['discussion.askSend']).disabled).toBe(false)
  await click(button(zh['discussion.askSend']))
  // Both answers travel back as one discussion message, so the Answerer answers once.
  const posted = server.requests.find(request => request.path === 'local/discussions/d-ask/asks/ask-1/reply')
  expect(posted?.method).toBe('POST')
  expect(posted?.body).toMatchObject({ answers: [
    { questionId: 'q1', text: 'Two columns' },
    { questionId: 'q2', text: 'Only while it is about no requirement' }] })
  // An answered card leaves the page.
  expect(document.querySelector('.dt-ask-card')).toBeNull()
})

it('deletes an unlinked discussion after a confirmation that carries its title and returns to the list', async () => {
  server.localProjects = [PROJECT]
  server.localDiscussions = [localDiscussion('Delete me', 'Body', PROJECT.id, 'd-delete'),
    localDiscussion('Keep me', 'Body', PROJECT.id, 'd-keep')]
  at({ page: 'discussions', id: 'd-delete' })
  await mount()
  // A dialogue carrying the title asks first; cancelling sends nothing.
  await click(button(zh['discussion.delete']))
  const dialog = document.querySelector('.dt-modal')!
  expect(dialog.textContent).toContain('Delete me')
  const cancel = [...dialog.querySelectorAll('button')].find(item => item.textContent?.trim() === zh['cancel'])!
  await click(cancel)
  expect(server.requests.some(request => request.method === 'DELETE')).toBe(false)
  // Confirming sends the delete and lands on the list, where the deleted row is gone.
  await click(button(zh['discussion.delete']))
  const confirm = [...document.querySelector('.dt-modal')!.querySelectorAll('button')]
    .find(item => item.textContent?.trim() === zh['confirm'])!
  await click(confirm)
  expect(server.requests.some(request => request.path === 'local/discussions/d-delete' && request.method === 'DELETE')).toBe(true)
  expect(document.querySelector('.dt-page-title h2')?.textContent).toBe('Widgets')
  expect(all('.dt-cards .dt-row-title').map(title => title.textContent)).toEqual(['Keep me'])
})

it('does not offer Delete on a discussion that created a requirement', async () => {
  server.localProjects = [PROJECT]
  server.localDiscussions = [{ ...localDiscussion('Linked talk', 'Body', PROJECT.id, 'd-linked'), issueId: 'q-1' }]
  at({ page: 'discussions', id: 'd-linked' })
  await mount()
  expect(all('#dt-page button').some(item => item.textContent?.trim() === zh['discussion.delete'])).toBe(false)
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
  expect(text()).toContain(en['discussion.chat'])
  expect(text()).toContain(en['discussion.conclusions'])
  expect(all('#dt-page button').some(item => item.textContent?.trim() === en['discussion.sendIssue'])).toBe(true)
  expect(all('#dt-page button').some(item => item.textContent?.trim() === en['discussion.delete'])).toBe(true)
})

it('still shows a message written before answers were recorded', async () => {
  server.localProjects = [PROJECT]
  const base = localDiscussion('Old talk', 'Old body', PROJECT.id, 'd-old')
  server.localDiscussions = [base]
  server.localDiscussionComments = { 'd-old': [localDiscussionComment(base, 'An older remark', '2026-09-19T00:00:00Z')] }
  at({ page: 'discussions', id: 'd-old' })
  await mount()
  // The body is shown once above the chat; the message recorded before answers existed still shows there.
  expect(messages()).toEqual(['An older remark'])
  expect(all('.dt-chat-message[data-side="mine"]')).toHaveLength(1)
})

// jsdom implements neither object-URL call; a discussion gallery creates one blob URL per image and revokes it on unmount.
const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:discussion-image')
const revokeObjectURL = vi.fn((_url: string) => {})
beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
})

/** Build an image file of the given name and content; the client trusts the declared type. */
const imageFile = (name: string, content = 'x', type = 'image/png') => new File([content], name, { type })
/** A paste event carrying `files` on the clipboard, the way a screenshot arrives instead of text. */
function pasteEvent(files: File[]): Event {
  const items = files.map(file => ({ kind: 'file', type: file.type, getAsFile: () => file }))
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { items, files, types: ['Files'] } })
  return event
}
/** Dispatch a paste at the box and wait long enough for the FileReader results to render. */
async function dispatchFiles(box: HTMLElement, event: Event) {
  await act(async () => {
    box.dispatchEvent(event)
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  await settle()
}

it('pastes an image into the new-discussion dialog and shows its thumbnail and name in the detail', async () => {
  server.localProjects = [PROJECT]
  at({ page: 'discussions' })
  await mount()
  await click(button(zh['discussion.new']))
  const box = area(zh['discussion.newPlaceholder'])
  await dispatchFiles(box, pasteEvent([imageFile('pasted.png')]))
  expect(all('.dt-image-thumb').map(image => image.getAttribute('alt'))).toEqual(['pasted.png'])
  expect(all('.dt-image-name').map(name => name.textContent)).toEqual(['pasted.png'])
  // An image alone enables the create button and posts without any text.
  expect(button(zh['discussion.create']).disabled).toBe(false)
  await click(button(zh['discussion.create']))
  const posted = server.requests.find(request => request.path === 'local/discussions' && request.method === 'POST')!
  expect(posted.body).toMatchObject({ body: '', project: 'p-fixture',
    images: [{ name: 'pasted.png', mediaType: 'image/png' }] })
  // The detail reads the stored image through the authenticated route and shows it from an object URL.
  expect(createObjectURL).toHaveBeenCalled()
  expect(all('.dt-image-gallery img').map(image => image.getAttribute('src'))).toEqual(['blob:discussion-image'])
  expect(all('.dt-image-caption').map(caption => caption.textContent)).toEqual(['pasted.png'])
})

it('pastes an image-only follow-up and shows it only on that message\'s timeline row', async () => {
  server.localProjects = [PROJECT]
  const base = localDiscussion('Layout talk', 'The body of the talk', PROJECT.id, 'd-talk')
  server.localDiscussions = [{ ...base, answers: [localDiscussionAnswer(base, 'First remark', '2026-09-20T00:00:01Z')] }]
  at({ page: 'discussions', id: 'd-talk' })
  await mount()
  const box = area(zh['discussion.commentPlaceholder'])
  await dispatchFiles(box, pasteEvent([imageFile('later.png')]))
  expect(button(zh['discussion.comment']).disabled).toBe(false)
  await click(button(zh['discussion.comment']))
  const posted = server.requests.find(request => request.path === 'local/discussions/d-talk/comments' && request.method === 'POST')!
  expect(posted.body).toMatchObject({ text: '', images: [{ name: 'later.png', mediaType: 'image/png' }] })
  // Only the newest message carries the image; the older remark and the body stay without one.
  const rows = all('.dt-chat-message')
  expect(rows).toHaveLength(4)
  // The image sits on the person's own message, not on either Answerer reply.
  expect(rows[2]!.querySelectorAll('.dt-image-caption')).toHaveLength(1)
  expect(rows[2]!.querySelector('.dt-image-caption')?.textContent).toBe('later.png')
  expect(rows[0]!.querySelectorAll('.dt-image-caption')).toHaveLength(0)
  expect(rows[3]!.querySelectorAll('.dt-image-caption')).toHaveLength(0)
  // The submitted box clears its text and its image selection.
  expect((area(zh['discussion.commentPlaceholder']) as HTMLTextAreaElement).value).toBe('')
  expect(all('.dt-image-choice')).toHaveLength(0)
})