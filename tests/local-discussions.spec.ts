/** Local discussions: records and Threads of their own, kept apart from requirement records. */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { discussionWorkspace } from '../src/app/answerer.ts'
import { Discussions } from '../src/app/discussions.ts'
import { LocalIssues } from '../src/app/local.ts'
import { Store } from '../src/app/store.ts'
import type { Trigger } from '../src/core/index.ts'
import { KV } from '../src/kv.ts'
import type { LocalDiscussion } from '../src/sources/local-format.ts'
import { startRuntime, type Host } from './fixtures/host.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64')
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
const image = (name: string, mediaType: string, bytes: Buffer) => ({ name, mediaType, data: bytes.toString('base64') })

describe('the discussion records', () => {
  const setup = () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-discussions-'))
    directories.push(directory)
    const store = new Store(join(directory, 'orchestrator.sqlite'))
    const triggers: Trigger[] = []
    const archived: string[] = []
    const answered: { text: string; triggerId: string; images?: { id: string; name: string }[] }[] = []
    // The real host stores each Trigger and indexes its Thread; the port test keeps that index without an Engine.
    const receive = (trigger: Trigger) => { triggers.push(trigger); store.triggers.save(trigger); return { kind: 'stored' } as never }
    let tick = 0
    const discussions = new Discussions({ store, stateDir: directory, receive,
      answer: (_discussion, text, triggerId, images) => { answered.push({ text, triggerId, ...(images?.length ? { images } : {}) }) },
      archive: sessionId => { archived.push(sessionId) },
      // Each create moves the clock a second so the newest-first list order is unambiguous.
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() })
    const local = new LocalIssues({ store, stateDir: directory, discussions, receive })
    const project = local.createProject({ name: 'Demo', repository: 'acme/widgets' })
    return { discussions, local, triggers, archived, answered, project, store, directory }
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

  it('stores opening and follow-up images under the discussion directory and names their paths in the Thread', () => {
    const { discussions, triggers, answered, project, directory } = setup()
    const discussion = discussions.create({ body: 'Screenshot talk', project: project.id,
      images: [image('one.png', 'image/png', PNG)] })
    expect(discussion.images).toMatchObject([{ name: 'one.png', mediaType: 'image/png', bytes: PNG.length }])
    const opening = join(directory, 'local-images', 'discussions', discussion.id, `${discussion.images![0]!.id}.png`)
    expect(existsSync(opening)).toBe(true)
    // The opening message's Thread text carries the image's absolute path and its Images block.
    expect(triggers[0]!.text).toContain('Screenshot talk')
    expect(triggers[0]!.text).toContain('Images:')
    expect(triggers[0]!.text).toContain(opening)
    // The opening images stay on the discussion record, not on the answer the port receives.
    expect(answered[0]).toMatchObject({ text: 'Screenshot talk' })

    discussions.comment(discussion.id, 'Look here', [image('two.jpg', 'image/jpeg', JPEG)])
    const attached = answered[1]!.images![0]!
    const followUp = join(directory, 'local-images', 'discussions', discussion.id, `${attached.id}.jpg`)
    expect(attached).toMatchObject({ name: 'two.jpg' })
    expect(existsSync(followUp)).toBe(true)
    expect(triggers[1]!.text).toContain('Look here')
    expect(triggers[1]!.text).toContain('Images:')
    expect(triggers[1]!.text).toContain(followUp)
    // The opening image answers its bytes, while a follow-up image is only reachable once its answer is recorded.
    expect(discussions.image(discussion.id, discussion.images![0]!.id)?.bytes.equals(PNG)).toBe(true)
  })

  it('accepts an image-only opening message and an image-only follow-up', () => {
    const { discussions, triggers, answered, project } = setup()
    const discussion = discussions.create({ body: '  ', project: project.id,
      images: [image('pasted.png', 'image/png', PNG)] })
    expect(discussion.title).toBe('pasted.png')
    expect(discussion.body).toBe('')
    expect(discussion.images).toHaveLength(1)
    expect(triggers[0]!.text.startsWith('Images:\n')).toBe(true)

    discussions.comment(discussion.id, '   ', [image('later.png', 'image/png', PNG)])
    expect(answered[1]).toMatchObject({ text: '' })
    expect(answered[1]!.images).toMatchObject([{ name: 'later.png' }])
    expect(triggers[1]!.text.startsWith('Images:\n')).toBe(true)
  })

  it('refuses an image that breaks a rule without writing a record, a trigger or any bytes', () => {
    const { discussions, triggers, project, directory } = setup()
    const code = (images: { name: string; mediaType: string; data: string }[]): unknown => {
      try { discussions.create({ body: 'Bad', project: project.id, images }) } catch (error) { return (error as { code?: unknown }).code }
      return undefined
    }
    expect(code([image('1.png', 'image/png', PNG), image('2.png', 'image/png', PNG), image('3.png', 'image/png', PNG),
      image('4.png', 'image/png', PNG), image('5.png', 'image/png', PNG)])).toBe('issueImageCount')
    expect(code([image('big.png', 'image/png', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))])).toBe('issueImageSize')
    expect(code([image('mismatch.png', 'image/png', JPEG)])).toBe('issueImageType')
    expect(code([{ name: 'x.png', mediaType: 'image/png', data: 'not base64!!' }])).toBe('issueImageData')
    expect(discussions.list()).toEqual([])
    expect(triggers).toEqual([])
    expect(existsSync(join(directory, 'local-images'))).toBe(false)

    // A refused follow-up leaves the discussion and the images it already stored untouched.
    const kept = discussions.create({ body: 'Kept', project: project.id, images: [image('kept.png', 'image/png', PNG)] })
    expect(() => discussions.comment(kept.id, 'Bad', [image('bad.png', 'image/png', JPEG)])).toThrow('must be a PNG, JPEG, WebP or GIF')
    expect(discussions.get(kept.id)).toEqual(kept)
    expect(triggers).toHaveLength(1)
    expect(existsSync(join(directory, 'local-images', 'discussions', kept.id, `${kept.images![0]!.id}.png`))).toBe(true)
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

  it('deletes a discussion with its Thread, its Triggers, its images, its Answerer Session and its workspace', async () => {
    const { discussions, triggers, archived, project, store, directory } = setup()
    const discussion = discussions.create({ body: 'Delete this', project: project.id,
      images: [image('gone.png', 'image/png', PNG)] })
    discussions.comment(discussion.id, 'And this message', [image('also-gone.png', 'image/png', PNG)])
    const workspace = join(directory, 'discussions', discussion.id)
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(workspace, 'note.txt'), 'kept')
    const images = join(directory, 'local-images', 'discussions', discussion.id)
    expect(existsSync(images)).toBe(true)
    expect(store.read.threadTriggers(`local:${discussion.id}`, 10)).toHaveLength(2)

    await expect(discussions.delete(discussion.id)).resolves.toMatchObject({ id: discussion.id, title: 'Delete this' })

    expect(discussions.list()).toEqual([])
    expect(discussions.get(discussion.id)).toBeUndefined()
    expect(store.read.threadTriggers(`local:${discussion.id}`, 10)).toEqual([])
    expect(triggers.map(trigger => store.triggers.get(trigger.id))).toEqual([undefined, undefined])
    expect(archived).toEqual([`answerer-${discussion.id}`])
    expect(existsSync(workspace)).toBe(false)
    // Every message's images live under the discussion's directory, so deleting it removes all of them.
    expect(existsSync(images)).toBe(false)
    expect(await discussions.delete(discussion.id)).toBeUndefined()
  })

  it('refuses to delete a discussion that created a requirement and keeps its record and Thread', async () => {
    const { discussions, local, triggers, project, store } = setup()
    const discussion = discussions.create({ body: 'Linked discussion', project: project.id })
    const issue = local.create({ body: 'Its requirement', project: project.id, discussion: discussion.id })
    const stored = discussions.get(discussion.id)
    const thread = store.threads.get(`local:${discussion.id}`)
    const messages = store.read.threadTriggers(`local:${discussion.id}`, 10)

    await expect(discussions.delete(discussion.id)).rejects.toThrow('keep it or remove that requirement first')

    expect(discussions.get(discussion.id)).toEqual(stored)
    expect(discussions.get(discussion.id)?.issueId).toBe(issue.id)
    expect(store.threads.get(`local:${discussion.id}`)).toEqual(thread)
    expect(store.read.threadTriggers(`local:${discussion.id}`, 10)).toEqual(messages)
    expect(triggers).toHaveLength(2)
  })
})

describe('the discussion answer workspace', () => {
  const stateDirectory = () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-discussion-workspace-'))
    directories.push(directory)
    return directory
  }

  it('creates the state-directory fallback before the Session opens', () => {
    const stateDir = stateDirectory()
    const directory = discussionWorkspace(stateDir, undefined, 'd-12345678')
    expect(directory).toBe(join(stateDir, 'discussions', 'd-12345678'))
    expect(statSync(directory).isDirectory()).toBe(true)
  })

  it('keeps an existing configured worktree root, without creating the fallback', () => {
    const stateDir = stateDirectory()
    const root = join(stateDir, 'checkout')
    mkdirSync(root)
    expect(discussionWorkspace(stateDir, { worktreeRoot: root }, 'd-12345678')).toBe(root)
    expect(existsSync(join(stateDir, 'discussions', 'd-12345678'))).toBe(false)
  })

  it('falls back when the configured worktree root is missing', () => {
    const stateDir = stateDirectory()
    const directory = discussionWorkspace(stateDir, { worktreeRoot: join(stateDir, 'missing') }, 'd-12345678')
    expect(directory).toBe(join(stateDir, 'discussions', 'd-12345678'))
    expect(statSync(directory).isDirectory()).toBe(true)
  })

  it('falls back when the configured worktree root is not a directory', () => {
    const stateDir = stateDirectory()
    const file = join(stateDir, 'checkout.txt')
    writeFileSync(file, 'not a checkout')
    const directory = discussionWorkspace(stateDir, { worktreeRoot: file }, 'd-12345678')
    expect(directory).toBe(join(stateDir, 'discussions', 'd-12345678'))
    expect(statSync(directory).isDirectory()).toBe(true)
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

  it('creates the Answerer workspace under the state directory when the project configures no worktree root', async () => {
    const discussion = h.runtime.discussions.create({ body: 'Where does the Answerer run?', project: project.id })
    const workspace = join(h.directory, 'discussions', discussion.id)
    expect(existsSync(workspace)).toBe(false)
    await settle(discussion.id, 'In the state directory.')
    expect(existsSync(workspace)).toBe(true)
    expect(h.runtime.discussions.get(discussion.id)!.answers![0]).toMatchObject({ state: 'answered', answer: 'In the state directory.' })
    expect(h.headers.get(`answerer-${discussion.id}`)?.cwd).toBe(realpathSync(workspace))
  })

  it('keeps an existing project worktree root as the Answerer workspace', async () => {
    const root = join(h.directory, 'project-checkout')
    mkdirSync(root)
    const rooted = h.runtime.local.createProject({ name: 'Rooted', repository: 'deepseek-ai/dsh-superagent-prototype', worktreeRoot: root })
    const discussion = h.runtime.discussions.create({ body: 'Where does this one run?', project: rooted.id })
    await settle(discussion.id, 'In the project checkout.')
    expect(h.runtime.discussions.get(discussion.id)!.answers![0]).toMatchObject({ state: 'answered', answer: 'In the project checkout.' })
    expect(h.headers.get(`answerer-${discussion.id}`)?.cwd).toBe(realpathSync(root))
    expect(existsSync(join(h.directory, 'discussions', discussion.id))).toBe(false)
  })

  it('falls back to the state directory when the project worktree root is missing or not a directory', async () => {
    const missing = join(h.directory, 'missing-checkout')
    const file = join(h.directory, 'checkout.txt')
    writeFileSync(file, 'not a checkout')
    for (const worktreeRoot of [missing, file]) {
      const rooted = h.runtime.local.createProject({ name: `Rooted ${worktreeRoot === file}`, repository: 'deepseek-ai/dsh-superagent-prototype', worktreeRoot })
      const discussion = h.runtime.discussions.create({ body: 'Answer despite the root', project: rooted.id })
      await settle(discussion.id, 'Answered through the fallback.')
      expect(h.runtime.discussions.get(discussion.id)!.answers![0]).toMatchObject({ state: 'answered', answer: 'Answered through the fallback.' })
      expect(h.headers.get(`answerer-${discussion.id}`)?.cwd).toBe(realpathSync(join(h.directory, 'discussions', discussion.id)))
      expect(existsSync(join(h.directory, 'discussions', discussion.id))).toBe(true)
    }
    expect(existsSync(missing)).toBe(false)
  })

  it('answers a discussion written before answers were recorded once answers resume', async () => {
    const id = 'd-legacy'
    const at = '2026-11-14T00:00:00.000Z'
    h.runtime.store.set(KV.local.discussion(id), {
      id, title: 'Legacy question', body: 'Legacy question', author: 'local', project: project.id,
      createdAt: at, updatedAt: at, state: 'open',
    })
    h.runtime.answers.resume()
    await settle(id, 'Answered after the upgrade')
    expect(h.runtime.discussions.get(id)!.answers).toMatchObject([{ state: 'answered', answer: 'Answered after the upgrade' }])
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

  it('answers a failed ENOENT answer once the panel retries it', async () => {
    const id = 'd-enoent-retry'
    const at = '2026-11-14T00:00:00.000Z'
    const workspace = join(h.directory, 'discussions', id)
    h.runtime.store.set(KV.local.discussion(id), {
      id, title: 'A question that failed', body: 'A question that failed', author: 'local', project: project.id,
      createdAt: at, updatedAt: at, state: 'open',
      answers: [{ id: 'an-enoent', discussionId: id, triggerId: 'trigger-enoent', text: 'A question that failed', at, state: 'failed',
        failure: { reason: 'no-session', message: `ENOENT: no such file or directory, realpath '${workspace}'` } }],
    })
    // The panel's Retry route queues the same answer again.
    expect((await h.api('POST', `local/discussions/${id}/answers/an-enoent/retry`)).status).toBe(200)
    await settle(id, 'Answered after the retry')
    expect(h.runtime.discussions.get(id)!.answers![0]).toMatchObject({ state: 'answered', answer: 'Answered after the retry' })
    expect(existsSync(workspace)).toBe(true)
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
    expect((await h.api('DELETE', 'local/discussions/d-00000000')).status).toBe(404)
    const empty = await h.api('POST', 'local/discussions', { body: '   ', project: project.id })
    expect(empty.status).toBe(400)
    expect(empty.body.code).toBe('discussionEmpty')
    const unknownProject = await h.api('POST', 'local/discussions', { body: 'A discussion', project: 'p-missing' })
    expect(unknownProject.status).toBe(404)
    expect((await h.api('GET', `local/discussions?project=${project.id}`)).body.discussions).toEqual([])
  })

  it('deletes an unlinked discussion over HTTP and takes its Thread, Triggers, Answerer Session and workspace with it', async () => {
    const created = await h.api('POST', 'local/discussions', { body: 'Delete over HTTP\n\nWith detail', project: project.id })
    const discussion = created.body.discussion as LocalDiscussion
    const threadKeyValue = `local:${discussion.id}`
    const triggerIds = h.runtime.store.read.threadTriggers(threadKeyValue, 10).map(trigger => trigger.id)
    expect(triggerIds).toHaveLength(1)
    const workspace = join(h.directory, 'discussions', discussion.id)
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(workspace, 'note.txt'), 'kept')

    const deleted = await h.api('DELETE', `local/discussions/${discussion.id}`)
    expect(deleted.status).toBe(200)
    expect(deleted.body).toEqual({ deleted: true })

    expect((await h.api('GET', `local/discussions?project=${project.id}`)).body.discussions).toEqual([])
    expect((await h.api('GET', `local/discussions/${discussion.id}`)).status).toBe(404)
    expect(h.runtime.discussions.get(discussion.id)).toBeUndefined()
    expect(h.runtime.store.threads.get(threadKeyValue)).toBeUndefined()
    expect(h.runtime.store.read.threadTriggers(threadKeyValue, 10)).toEqual([])
    triggerIds.forEach(id => expect(h.runtime.store.triggers.get(id)).toBeUndefined())
    expect(h.archiveSession).toHaveBeenCalledWith(`answerer-${discussion.id}`, { stopActivity: true })
    expect(existsSync(workspace)).toBe(false)
  })

  it('refuses to delete a discussion that created a requirement over HTTP and changes nothing', async () => {
    const created = await h.api('POST', 'local/discussions', { body: 'A linked discussion\n\nDetails', project: project.id })
    const discussion = created.body.discussion as LocalDiscussion
    const made = await h.api('POST', 'local/issues', { body: 'The requirement', project: project.id, discussion: discussion.id })
    const issue = made.body.issue as { id: string }
    await h.api('POST', `local/discussions/${discussion.id}/comments`, { text: 'A message that stays' })
    const stored = h.runtime.discussions.get(discussion.id)!
    const thread = h.runtime.store.threads.get(`local:${discussion.id}`)!
    const messages = h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10)

    const refused = await h.api('DELETE', `local/discussions/${discussion.id}`)
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ code: 'discussionRequirement' })

    expect(h.runtime.discussions.get(discussion.id)).toEqual(stored)
    expect(h.runtime.discussions.get(discussion.id)?.issueId).toBe(issue.id)
    expect(h.runtime.store.threads.get(`local:${discussion.id}`)).toEqual(thread)
    expect(h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10)).toEqual(messages)
    expect(h.archiveSession).not.toHaveBeenCalled()
    expect((await h.api('GET', `local/discussions/${discussion.id}`)).status).toBe(200)
  })
})
