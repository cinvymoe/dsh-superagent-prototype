/** Local discussions: records and Threads of their own, kept apart from requirement records. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Discussions } from '../src/app/discussions.ts'
import { LocalIssues } from '../src/app/local.ts'
import { Store } from '../src/app/store.ts'
import type { Trigger } from '../src/core/index.ts'
import type { LocalDiscussion } from '../src/sources/local-format.ts'
import { startRuntime, type Host } from './fixtures/host.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('the discussion records', () => {
  const setup = () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-discussions-'))
    directories.push(directory)
    const store = new Store(join(directory, 'orchestrator.sqlite'))
    const triggers: Trigger[] = []
    const receive = (trigger: Trigger) => { triggers.push(trigger); return { kind: 'stored' } as never }
    let tick = 0
    const discussions = new Discussions({ store, receive,
      // Each create moves the clock a second so the newest-first list order is unambiguous.
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() })
    const local = new LocalIssues({ store, stateDir: directory, discussions, receive })
    const project = local.createProject({ name: 'Demo', repository: 'acme/widgets' })
    return { discussions, local, triggers, project, store }
  }

  it('creates a discussion on its own thread and lists it by project, newest first', () => {
    const { discussions, triggers, project } = setup()
    const first = discussions.create({ body: 'First discussion\n\nWith detail', project: project.id })
    const second = discussions.create({ body: 'Second discussion', project: project.id })
    expect(first.id).toMatch(/^d-[0-9a-f]{8}$/)
    expect(first).toMatchObject({ title: 'First discussion', body: 'First discussion\n\nWith detail', author: 'local',
      project: project.id, state: 'open' })
    expect(discussions.list(project.id).map(entry => entry.id)).toEqual([second.id, first.id])
    expect(discussions.list('p-other')).toEqual([])
    expect(discussions.get(first.id)?.title).toBe('First discussion')
    // The discussion's own Thread carries the submitted text as its first human Trigger, with the discussion named in meta.
    expect(triggers).toHaveLength(2)
    expect(triggers[0]).toMatchObject({ source: 'local', human: true, text: 'First discussion\n\nWith detail',
      threads: [{ source: 'local', id: first.id }],
      channel: { source: 'local', thread: `local:${first.id}`, address: { discussion: first.id } },
      meta: { project: project.id, discussion: first.id } })
  })

  it('adds a comment as a human Trigger on the discussion thread and keeps the discussion text unchanged', () => {
    const { discussions, triggers, project } = setup()
    const discussion = discussions.create({ body: 'A discussion', project: project.id })
    const commented = discussions.comment(discussion.id, ' One more thought ')
    expect(commented?.body).toBe('A discussion')
    expect(commented!.updatedAt > discussion.updatedAt).toBe(true)
    expect(triggers).toHaveLength(2)
    expect(triggers[1]).toMatchObject({ source: 'local', human: true, text: 'One more thought',
      threads: [{ source: 'local', id: discussion.id }], meta: { project: project.id, discussion: discussion.id } })
  })

  it('closes a discussion without touching any requirement record', () => {
    const { discussions, local, project } = setup()
    const discussion = discussions.create({ body: 'A discussion', project: project.id })
    expect(discussions.close(discussion.id)).toMatchObject({ state: 'closed' })
    expect(discussions.get(discussion.id)?.state).toBe('closed')
    expect(local.list()).toEqual([])
    expect(discussions.close('d-unknown')).toBeUndefined()
    expect(discussions.comment('d-unknown', 'text')).toBeUndefined()
  })

  it('refuses an empty body or an unknown project and leaves no record behind', () => {
    const { discussions, triggers, project } = setup()
    expect(() => discussions.create({ body: '   ', project: project.id })).toThrow('A discussion needs a description')
    expect(() => discussions.create({ body: 'A discussion', project: 'p-missing' })).toThrow('Unknown local project')
    expect(discussions.list()).toEqual([])
    expect(triggers).toEqual([])
  })

  it('creates a requirement from a discussion and links both records', () => {
    const { discussions, local, triggers, project } = setup()
    const discussion = discussions.create({ body: 'Discussion\n\nWith detail', project: project.id })
    const issue = local.create({ body: 'Refined requirement', project: project.id, discussion: discussion.id })
    expect(issue).toMatchObject({ body: 'Refined requirement', project: project.id, discussionId: discussion.id })
    // The discussion keeps its own text and state, and names the one requirement it created.
    expect(discussions.get(discussion.id)).toMatchObject({ body: 'Discussion\n\nWith detail', state: 'open', issueId: issue.id })
    // The requirement gets its own Thread and first Trigger, exactly as a requirement submitted directly does.
    expect(triggers).toHaveLength(2)
    expect(triggers[1]).toMatchObject({ source: 'local', human: true, text: 'Refined requirement',
      threads: [{ source: 'local', id: issue.id }], channel: { source: 'local', thread: `local:${issue.id}` },
      meta: { project: project.id } })
  })

  it('refuses a second requirement from the same discussion and leaves both records as they were', () => {
    const { discussions, local, triggers, project } = setup()
    const discussion = discussions.create({ body: 'One discussion', project: project.id })
    const issue = local.create({ title: 'The requirement', project: project.id, discussion: discussion.id })
    const storedIssue = local.get(issue.id)
    const storedDiscussion = discussions.get(discussion.id)
    expect(() => local.create({ title: 'Another requirement', project: project.id, discussion: discussion.id }))
      .toThrow('already created requirement')
    expect(local.list()).toHaveLength(1)
    expect(local.get(issue.id)).toEqual(storedIssue)
    expect(discussions.get(discussion.id)).toEqual(storedDiscussion)
    // A refused create delivers no Trigger either.
    expect(triggers).toHaveLength(2)
  })

  it('refuses an unknown discussion or one in another project without writing either record', () => {
    const { discussions, local, triggers, project } = setup()
    const other = local.createProject({ name: 'Other', repository: 'acme/other' })
    const discussion = discussions.create({ body: 'Another project', project: other.id })
    expect(() => local.create({ body: 'A requirement', project: project.id, discussion: 'd-unknown' })).toThrow('Unknown local discussion')
    expect(() => local.create({ body: 'A requirement', project: project.id, discussion: discussion.id })).toThrow("must stay in the discussion's project")
    expect(local.list()).toEqual([])
    expect(discussions.get(discussion.id)?.issueId).toBeUndefined()
    expect(triggers).toHaveLength(1)
  })

  it('creates a requirement without a discussion exactly as before, with no source link', () => {
    const { discussions, local, project } = setup()
    const issue = local.create({ body: 'A plain requirement', project: project.id })
    expect(issue).not.toHaveProperty('discussionId')
    expect(discussions.list()).toEqual([])
  })

  it('reads back a discussion by id with its own thread, project and replies', () => {
    const { discussions, project } = setup()
    const discussion = discussions.create({ body: 'Readable discussion', project: project.id })
    expect(discussions.get(discussion.id)).toEqual(discussion)
    expect(discussions.thread(discussion.id)).toBe(`local:${discussion.id}`)
  })
})

describe('the discussion answers', () => {
  let h: Host
  let project: { id: string }
  beforeEach(async () => {
    h = await startRuntime()
    project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
  })
  afterEach(async () => { await h.stop() })

  /** Let the discussion's Answerer say `answer`, as its model would, and end its turn. */
  const settle = async (discussionId: string, answer = 'The answer') => {
    const sessionId = `answerer-${discussionId}`
    await vi.waitFor(() => expect(h.agents.get(sessionId)?.status).toBe('running'))
    const agent = h.agents.get(sessionId)!
    const list = h.events.get(sessionId)!
    list.push({ type: 'assistant/message', seq: (list.at(-1)?.seq ?? -1) + 1,
      data: { message: { content: [{ type: 'text', text: answer }] } } } as never)
    agent.status = 'idle'
    h.ctx.emit('agent/status', { agent, status: 'idle' } as never)
    await h.runtime.answers.idle()
  }

  it('answers a discussion message in its own read-only Session, with no Ticket, Eval or Decision', async () => {
    const discussion = h.runtime.discussions.create({ body: 'How should discussion and issue creation split?', project: project.id })
    await settle(discussion.id, 'Split the records; the Threads already differ.')
    // The message is an ordinary human Trigger on the discussion's own Thread.
    expect(h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 1)).toHaveLength(1)
    // Nothing of the Engine follows it: no Eval waits on the Thread and no Ticket exists.
    expect(h.runtime.store.threads.get(`local:${discussion.id}`)?.pending).toEqual([])
    expect(h.runtime.store.threads.get(`local:${discussion.id}`)?.evaluating).toBeUndefined()
    expect(h.runtime.store.tickets.list()).toEqual([])
    // The answer sits on the discussion record, produced by its own Session.
    expect(h.runtime.discussions.get(discussion.id)!.answers).toMatchObject([{ discussionId: discussion.id, state: 'answered',
      text: 'How should discussion and issue creation split?', answer: 'Split the records; the Threads already differ.',
      sessionId: `answerer-${discussion.id}` }])
    // That Session is read-only and cannot publish an alignment.
    expect(h.restrictions.get(`answerer-${discussion.id}`)!.at(-1)).toEqual(['read', 'read_image', 'glob', 'grep'])
    expect(h.tools.get(`answerer-${discussion.id}`)!.has('orchestrator_align')).toBe(false)
  })

  it('answers every later message in the same Session, still without a Ticket', async () => {
    const discussion = h.runtime.discussions.create({ body: 'First thought', project: project.id })
    await settle(discussion.id, 'First answer')
    h.runtime.discussions.comment(discussion.id, ' One more thought ')
    await settle(discussion.id, 'Second answer')
    expect(h.runtime.discussions.get(discussion.id)!.answers!.map(answer => [answer.text, answer.answer]))
      .toEqual([['First thought', 'First answer'], ['One more thought', 'Second answer']])
    expect(h.runtime.store.tickets.list()).toEqual([])
  })

  it('records a failed answer a person may retry without leaving the Thread evaluated', async () => {
    const discussion = h.runtime.discussions.create({ body: 'Answer this', project: project.id })
    // The turn ends with no assistant text, which is a failure the panel offers to retry.
    await settle(discussion.id, '')
    const failed = h.runtime.discussions.get(discussion.id)!.answers![0]!
    expect(failed.state).toBe('failed')
    expect(failed.failure?.reason).toBe('empty-answer')
    h.runtime.answers.retry(discussion.id, failed.id)
    await settle(discussion.id, 'Retried answer')
    expect(h.runtime.discussions.get(discussion.id)!.answers![0]).toMatchObject({ state: 'answered', answer: 'Retried answer' })
    expect(h.runtime.store.tickets.list()).toEqual([])
  })
})

describe('the discussion HTTP API', () => {
  let h: Host
  let project: { id: string }
  beforeEach(async () => {
    h = await startRuntime()
    project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
  })
  afterEach(async () => { await h.stop() })

  it('creates, lists, reads, comments and closes a discussion over HTTP', async () => {
    const created = await h.api('POST', 'local/discussions', { body: 'HTTP discussion\n\nDetails', project: project.id })
    expect(created.status).toBe(200)
    const discussion = created.body.discussion as LocalDiscussion
    expect(discussion).toMatchObject({ title: 'HTTP discussion', body: 'HTTP discussion\n\nDetails', project: project.id, state: 'open' })

    const listed = await h.api('GET', `local/discussions?project=${project.id}`)
    expect(listed.status).toBe(200)
    expect((listed.body.discussions as LocalDiscussion[]).map(entry => entry.id)).toContain(discussion.id)
    expect((await h.api('GET', `local/discussions?project=p-other`)).body.discussions).toEqual([])

    const read = await h.api('GET', `local/discussions/${discussion.id}`)
    expect(read.status).toBe(200)
    expect(read.body).toMatchObject({ discussion: { id: discussion.id }, project: { id: project.id },
      thread: { key: `local:${discussion.id}` } })

    const commented = await h.api('POST', `local/discussions/${discussion.id}/comments`, { text: 'More context' })
    expect(commented.status).toBe(200)
    const triggers = h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10)
    expect(triggers.map(trigger => trigger.text)).toEqual(['HTTP discussion\n\nDetails', 'More context'])
    expect(triggers[1]).toMatchObject({ human: true, meta: { project: project.id, discussion: discussion.id } })

    const closed = await h.api('POST', `local/discussions/${discussion.id}/close`)
    expect(closed.status).toBe(200)
    expect(closed.body).toMatchObject({ discussion: { state: 'closed' } })
  })

  it('creates a requirement from a discussion over HTTP, enters the existing Eval, and refuses a second create', async () => {
    const created = await h.api('POST', 'local/discussions', { body: 'A discussion to turn into work\n\nDetails', project: project.id })
    const discussion = created.body.discussion as LocalDiscussion
    const made = await h.api('POST', 'local/issues', { body: 'The requirement', project: project.id, discussion: discussion.id })
    expect(made.status).toBe(200)
    const issue = made.body.issue as { id: string; discussionId?: string }
    expect(issue).toMatchObject({ body: 'The requirement', project: project.id, discussionId: discussion.id })
    // Both records read back linked, through their own routes.
    expect((await h.api('GET', `local/discussions/${discussion.id}`)).body).toMatchObject({ discussion: { issueId: issue.id } })
    expect((await h.api('GET', `local/issues/${issue.id}`)).body).toMatchObject({ issue: { discussionId: discussion.id } })
    // The requirement's own Thread carries its first human Trigger, which enters the existing Eval.
    const triggers = h.runtime.store.read.threadTriggers(`local:${issue.id}`, 10)
    expect(triggers.map(trigger => trigger.text)).toEqual(['The requirement'])
    await h.runtime.idle()
    expect(h.runtime.store.threads.get(`local:${issue.id}`)?.evaluating?.triggerIds).toContain(triggers[0]!.id)
    // A second requirement from the same discussion is refused and both records stay as they were.
    const again = await h.api('POST', 'local/issues', { body: 'Another requirement', project: project.id, discussion: discussion.id })
    expect(again.status).toBe(400)
    expect(again.body).toMatchObject({ code: 'discussionLinked' })
    expect((await h.api('GET', `local/discussions/${discussion.id}`)).body).toMatchObject({ discussion: { issueId: issue.id } })
    expect((await h.api('GET', `local/issues?project=${project.id}`)).body.issues).toHaveLength(1)
  })

  it('answers an unknown discussion with 404 and refuses empty text or an unknown project without a record', async () => {
    expect((await h.api('GET', 'local/discussions/d-00000000')).status).toBe(404)
    expect((await h.api('POST', 'local/discussions/d-00000000/comments', { text: 'text' })).status).toBe(404)
    expect((await h.api('POST', 'local/discussions/d-00000000/close')).status).toBe(404)
    const empty = await h.api('POST', 'local/discussions', { body: '   ', project: project.id })
    expect(empty.status).toBe(400)
    expect(empty.body.code).toBe('discussionEmpty')
    const unknownProject = await h.api('POST', 'local/discussions', { body: 'A discussion', project: 'p-missing' })
    expect(unknownProject.status).toBe(404)
    expect((await h.api('GET', `local/discussions?project=${project.id}`)).body.discussions).toEqual([])
  })
})
