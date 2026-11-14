/** Local discussions: records and Threads of their own, kept apart from requirement records. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    const local = new LocalIssues({ store, stateDir: directory, receive: trigger => { triggers.push(trigger); return { kind: 'stored' } as never } })
    const receive = (trigger: Trigger) => { triggers.push(trigger); return { kind: 'stored' } as never }
    let tick = 0
    const discussions = new Discussions({ store, receive,
      // Each create moves the clock a second so the newest-first list order is unambiguous.
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() })
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

  it('reads back a discussion by id with its own thread, project and replies', () => {
    const { discussions, project } = setup()
    const discussion = discussions.create({ body: 'Readable discussion', project: project.id })
    expect(discussions.get(discussion.id)).toEqual(discussion)
    expect(discussions.thread(discussion.id)).toBe(`local:${discussion.id}`)
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
