import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalIssues, requirementTitle } from '../src/app/local.ts'
import { Discussions } from '../src/app/discussions.ts'
import { LocalQuestions, QUESTION_LIMIT, type TicketAnswers } from '../src/app/local-questions.ts'
import { Store } from '../src/app/store.ts'
import { KV } from '../src/kv.ts'
import type { Ticket, Trigger } from '../src/core/index.ts'
import { alignmentRounds, currentAlignment, requirementExecutionMode, type LocalImageInput } from '../src/sources/local-format.ts'


/** A 1x1 transparent PNG, a 1x1 GIF, a WebP signature and a minimal JPEG header; enough to prove each media type. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([12, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.from([4, 0, 0, 0]), Buffer.from('data')])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9])

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('the local issue board', () => {
  const setup = () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-local-'))
    directories.push(directory)
    const store = new Store(join(directory, 'orchestrator.sqlite'))
    const triggers: Trigger[] = []
    const receive = (trigger: Trigger) => { triggers.push(trigger); return { kind: 'stored' } as never }
    const discussions = new Discussions({ store, receive })
    const issues = new LocalIssues({ store, stateDir: directory, discussions, receive })
    const project = issues.createProject({ name: 'Demo', repository: 'acme/widgets' })
    return { issues, triggers, project, directory, store }
  }

  it('creates an issue and submits its text as a human Trigger on a local Thread', () => {
    const { issues, triggers, project } = setup()
    const issue = issues.create({ title: 'Local requirement', body: 'The body', project: project.id })
    expect(issues.list().map(entry => entry.id)).toEqual([issue.id])
    expect(issue.id).toMatch(/^q-[0-9a-f]{8}$/)
    expect(triggers).toHaveLength(1)
    expect(triggers[0]).toMatchObject({
      source: 'local', human: true, addressed: 'direct',
      threads: [{ source: 'local', id: issue.id }],
      channel: { source: 'local', thread: `local:${issue.id}`, address: { issue: issue.id } },
    })
    expect(triggers[0]!.text).toBe('Local requirement\n\nThe body')
  })

  it('derives a title from the first non-empty line of a description and stores the whole description', () => {
    expect(requirementTitle('\n\n  First   line  \nSecond line')).toBe('First line')
    expect(requirementTitle('   ')).toBe('')
    const long = Array.from({ length: 60 }, () => 'word').join('   ')
    expect(requirementTitle(long)).toHaveLength(200)
    expect(requirementTitle(long)).not.toContain('  ')
    const { issues, triggers, project } = setup()
    const description = '\n  Improve   the panel \n\nMore detail here'
    const issue = issues.create({ body: description, project: project.id })
    expect(issue.title).toBe('Improve the panel')
    expect(issue.body).toBe('Improve   the panel \n\nMore detail here')
    // A derived title is part of the description, so the Thread message is the description once, without a title prefix.
    expect(triggers[0]!.text).toBe('Improve   the panel \n\nMore detail here')
  })

  it('refuses a requirement with neither a title nor a description', () => {
    const { issues, project } = setup()
    expect(() => issues.create({ project: project.id })).toThrow('A requirement needs a description')
    expect(() => issues.create({ body: '   ', project: project.id })).toThrow('A requirement needs a description')
  })

  it('adds comments as further Triggers without changing the requirement', () => {
    const { issues, triggers, project } = setup()
    const issue = issues.create({ title: 'Local requirement', project: project.id })
    issues.comment(issue.id, 'One more detail')
    expect(triggers).toHaveLength(2)
    expect(triggers[1]).toMatchObject({ source: 'local', human: true, text: 'One more detail' })
    expect(issues.get(issue.id)?.title).toBe('Local requirement')
  })

  it('records a proposal and the person\'s review, and refuses a review without one', () => {
    const { issues, project } = setup()
    const issue = issues.create({ title: 'Local requirement', project: project.id })
    expect(issues.decide(issue.id, 'confirm')).toBeUndefined()
    const proposed = issues.propose(issue.id, { summary: 'Two slices', acceptance: ['typecheck'],
      slices: [{ id: 'C1', title: 'One', outcome: '', inScope: [], outOfScope: [], acceptance: [], dependsOn: [], lane: 'full' }] })
    expect(proposed?.alignment).toMatchObject({ roundId: 'al-1', status: 'proposed', summary: 'Two slices', acceptance: ['typecheck'] })
    const confirmed = issues.decide(issue.id, 'confirm')
    expect(confirmed?.alignment).toMatchObject({ status: 'confirmed' })
    expect(confirmed?.alignment?.decidedAt).toBeTruthy()
    const rejected = issues.decide(issue.id, 'reject', 'Needs a narrower scope')
    expect(rejected?.alignment).toMatchObject({ status: 'rejected', reason: 'Needs a narrower scope' })
  })

  it('keeps every alignment round, supersedes an undecided one, and posts a rejection back to the thread once', () => {
    const { issues, triggers, project, store } = setup()
    const issue = issues.create({ title: 'Rounds', project: project.id })
    const slice = { id: 'C1', title: 'One', outcome: '', inScope: [], outOfScope: [], acceptance: [], dependsOn: [], lane: 'full' as const }
    const first = issues.propose(issue.id, { summary: 'First', slices: [slice] })!
    expect(alignmentRounds(first).map(round => `${round.roundId}:${round.status}`)).toEqual(['al-1:proposed'])
    // A second proposal supersedes the undecided round and mirrors the newest one in `alignment`.
    const second = issues.propose(issue.id, { summary: 'Second', slices: [slice] })!
    expect(second.alignments?.map(round => round.status)).toEqual(['superseded', 'proposed'])
    expect(second.alignment).toEqual(second.alignments?.at(-1))
    expect(second.alignment).toMatchObject({ roundId: 'al-2', summary: 'Second' })
    expect(currentAlignment(second)).toBe(second.alignment)
    // Rejecting writes the reason and tells the requirement's Thread as a human local message...
    const rejected = issues.decide(issue.id, 'reject', '缩小范围')!
    expect(rejected.alignments?.map(round => round.status)).toEqual(['superseded', 'rejected'])
    expect(rejected.alignment).toMatchObject({ roundId: 'al-2', status: 'rejected', reason: '缩小范围' })
    expect(triggers.at(-1)).toMatchObject({ source: 'local', human: true })
    expect(triggers.at(-1)!.text).toContain('缩小范围')
    const told = triggers.length
    // ...once per round: a repeated rejection of the same round records the decision but posts no second message.
    issues.decide(issue.id, 'reject', '缩小范围')
    expect(triggers).toHaveLength(told)
    // A third proposal appends to the history instead of replacing it; the rejected round keeps its reason.
    const third = issues.propose(issue.id, { summary: 'Third', slices: [slice] })!
    expect(third.alignments?.map(round => `${round.roundId}:${round.status}`)).toEqual(['al-1:superseded', 'al-2:rejected', 'al-3:proposed'])
    expect(third.alignment).toEqual(third.alignments?.at(-1))
    // `alignment` is the mirror, never the source of truth: the stored record keeps the whole history in step.
    expect(store.get(KV.local.issue(issue.id))?.alignments).toHaveLength(3)
  })

  it('reads a record written before rounds existed as one round and proposes the second', () => {
    const { issues, store, project } = setup()
    const issue = issues.create({ title: 'Legacy alignment', project: project.id })
    // A record from before round ids existed holds only the single `alignment` slot.
    store.set(KV.local.issue(issue.id), { ...issue, alignment: { status: 'proposed', summary: 'Legacy', slices: [],
      acceptance: [], proposedAt: '2026-09-01T00:00:00Z' } as never })
    const read = issues.get(issue.id)!
    expect(alignmentRounds(read)).toHaveLength(1)
    expect(read.alignments).toHaveLength(1)
    expect(read.alignment).toMatchObject({ roundId: 'al-1', status: 'proposed' })
    const next = issues.propose(issue.id, { summary: 'Second', slices: [] })!
    expect(next.alignments?.map(round => `${round.roundId}:${round.status}`)).toEqual(['al-1:superseded', 'al-2:proposed'])
    expect(next.alignment).toEqual(next.alignments?.at(-1))
  })

  it('refuses a proposal once the current round is confirmed and leaves the history unchanged', () => {
    const { issues, project } = setup()
    const issue = issues.create({ title: 'Frozen alignment', project: project.id })
    const slice = { id: 'C1', title: 'One', outcome: '', inScope: [], outOfScope: [], acceptance: [], dependsOn: [], lane: 'full' as const }
    issues.propose(issue.id, { summary: 'Only', slices: [slice] })
    const confirmed = issues.decide(issue.id, 'confirm')!
    // Confirming again is idempotent: the recorded decision time stays.
    expect(issues.decide(issue.id, 'confirm')?.alignment?.decidedAt).toBe(confirmed.alignment?.decidedAt)
    let code: unknown
    try { issues.propose(issue.id, { summary: 'Again', slices: [slice] }) } catch (error) { code = (error as { code?: unknown }).code }
    expect(code).toBe('alignmentConfirmed')
    expect(issues.get(issue.id)?.alignments).toHaveLength(1)
  })

  it('binds requirements to projects and rejects unknown or malformed projects', () => {
    const { issues, project } = setup()
    expect(issues.projects().map(entry => entry.id)).toEqual([project.id])
    expect(issues.list(project.id)).toHaveLength(0)
    const issue = issues.create({ title: 'Project scoped', project: project.id })
    expect(issues.list(project.id).map(entry => entry.id)).toEqual([issue.id])
    expect(issues.list('p-other')).toEqual([])
    expect(() => issues.create({ title: 'Unknown', project: 'p-other' })).toThrow('Unknown local project')
    expect(() => issues.createProject({ name: 'Bad', repository: 'not-a-repository' })).toThrow('owner/name')
    expect(() => issues.createProject({ name: 'Demo', repository: 'acme/other' })).toThrow('already exists')
  })

  it('stores an optional absolute worktree root, treats blank values as unconfigured, and refuses relative ones', () => {
    const { issues } = setup()
    const rooted = issues.createProject({ name: 'Rooted', repository: 'acme/widgets', worktreeRoot: '/tmp/worktrees' })
    expect(rooted.worktreeRoot).toBe('/tmp/worktrees')
    expect(issues.project(rooted.id)?.worktreeRoot).toBe('/tmp/worktrees')
    expect(issues.createProject({ name: 'Trimmed', repository: 'acme/widgets', worktreeRoot: '  /tmp/spaced  ' }).worktreeRoot).toBe('/tmp/spaced')
    // Omitted, exactly empty and whitespace-only all mean unconfigured, and the record carries no field for any of them.
    expect(issues.createProject({ name: 'Omitted', repository: 'acme/widgets' })).not.toHaveProperty('worktreeRoot')
    expect(issues.createProject({ name: 'Empty', repository: 'acme/widgets', worktreeRoot: '' })).not.toHaveProperty('worktreeRoot')
    const blank = issues.createProject({ name: 'Blank', repository: 'acme/widgets', worktreeRoot: '   ' })
    expect(blank).not.toHaveProperty('worktreeRoot')
    expect(issues.project(blank.id)).not.toHaveProperty('worktreeRoot')
    const code = (worktreeRoot: string): unknown => {
      try { issues.createProject({ name: `Bad ${worktreeRoot}`, repository: 'acme/widgets', worktreeRoot }) } catch (error) { return (error as { code?: unknown }).code }
      return undefined
    }
    expect(code('relative/root')).toBe('projectWorktreeRoot')
    expect(code('  relative/root  ')).toBe('projectWorktreeRoot')
  })

  it('stores an optional prepare command and extra blocked commands, treating blank values as unconfigured', () => {
    const { issues } = setup()
    const configured = issues.createProject({ name: 'Configured', repository: 'acme/widgets', prepare: '  npm ci  ',
      blockedCommands: ['rm', ' curl ', 'rm'] })
    expect(configured.prepare).toBe('npm ci')
    expect(configured.blockedCommands).toEqual(['rm', 'curl'])
    expect(issues.project(configured.id)).toMatchObject({ prepare: 'npm ci', blockedCommands: ['rm', 'curl'] })
    // Omitted, empty and whitespace-only all mean unconfigured, and an empty list adds no field.
    expect(issues.createProject({ name: 'Plain', repository: 'acme/widgets' })).not.toHaveProperty('prepare')
    expect(issues.createProject({ name: 'Blank prepare', repository: 'acme/widgets', prepare: '   ', blockedCommands: [] }))
      .not.toHaveProperty('prepare')
    expect(issues.createProject({ name: 'Blank list', repository: 'acme/widgets', blockedCommands: [] })).not.toHaveProperty('blockedCommands')
    let attempts = 0
    const code = (fields: { prepare?: string; blockedCommands?: string[] }): unknown => {
      try { issues.createProject({ name: `Bad ${++attempts}`, repository: 'acme/widgets', ...fields }) } catch (error) { return (error as { code?: unknown }).code }
      return undefined
    }
    // The rule is the Executor's own: a path is not a command name, and the commands workers need cannot be blocked.
    expect(code({ blockedCommands: ['gh'] })).toBe('projectBlockedWorkerCommand')
    expect(code({ blockedCommands: ['git'] })).toBe('projectBlockedWorkerCommand')
    expect(code({ blockedCommands: ['lark-cli'] })).toBe('projectBlockedWorkerCommand')
    expect(code({ blockedCommands: ['rm/../x'] })).toBe('projectBlockedCommand')
    expect(code({ blockedCommands: ['bad name'] })).toBe('projectBlockedCommand')
    expect(code({ prepare: 'x'.repeat(4001) })).toBe('projectPrepare')
  })

  it('stores every type of attached image under the requirement directory and names their absolute paths in the trigger', () => {
    const { issues, triggers, project, directory } = setup()
    const issue = issues.create({ title: 'Screenshots', body: 'Four shots', project: project.id, images: [
      { name: 'one.png', mediaType: 'image/png', data: PNG.toString('base64') },
      { name: 'two.gif', mediaType: 'image/gif', data: `data:image/gif;base64,${GIF.toString('base64')}` },
      { name: 'three.webp', mediaType: 'image/webp', data: WEBP.toString('base64') },
      { name: 'four.jpg', mediaType: 'image/jpeg', data: JPEG.toString('base64') },
    ] })
    expect(issue.images).toHaveLength(4)
    expect(issue.images![0]).toMatchObject({ name: 'one.png', mediaType: 'image/png', bytes: PNG.length })
    expect(issue.images![0]!.id).toMatch(/^img-[0-9a-f]{8}$/)
    const files = [
      join(directory, 'local-images', issue.id, `${issue.images![0]!.id}.png`),
      join(directory, 'local-images', issue.id, `${issue.images![1]!.id}.gif`),
      join(directory, 'local-images', issue.id, `${issue.images![2]!.id}.webp`),
      join(directory, 'local-images', issue.id, `${issue.images![3]!.id}.jpg`),
    ]
    for (const [index, file] of files.entries()) {
      expect(existsSync(file)).toBe(true)
      const sent = [PNG, GIF, WEBP, JPEG][index]!
      expect(readFileSync(file).equals(sent)).toBe(true)
      expect(triggers[0]!.text).toContain(file)
    }
    expect(triggers[0]!.text).toContain('Images:')
    const stored = issues.image(issue.id, issue.images![2]!.id)!
    expect(stored.mediaType).toBe('image/webp')
    expect(stored.bytes.equals(WEBP)).toBe(true)
    expect(issues.image(issue.id, 'img-unknown')).toBeUndefined()
  })

  it('refuses a requirement whose images break a rule, creating no issue, no trigger and no files', () => {
    const { issues, triggers, project, directory } = setup()
    const image = (name: string, mediaType: string, bytes: Buffer): LocalImageInput => ({ name, mediaType, data: bytes.toString('base64') })
    const code = (images: LocalImageInput[]): unknown => {
      try { issues.create({ title: 'Bad', project: project.id, images }) } catch (error) { return (error as { code?: unknown }).code }
      return undefined
    }
    expect(code([image('1.png', 'image/png', PNG), image('2.png', 'image/png', PNG), image('3.png', 'image/png', PNG),
      image('4.png', 'image/png', PNG), image('5.png', 'image/png', PNG)])).toBe('issueImageCount')
    expect(code([image('big.png', 'image/png', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))])).toBe('issueImageSize')
    expect(code([{ name: 'x.png', mediaType: 'image/png', data: 'not base64!!' }])).toBe('issueImageData')
    expect(code([image('mismatch.png', 'image/png', GIF)])).toBe('issueImageType')
    expect(code([image('bad.bmp', 'image/bmp', Buffer.from('BM'))])).toBe('issueImageType')
    expect(code([{ name: '   ', mediaType: 'image/png', data: PNG.toString('base64') }])).toBe('issueImageName')
    // A valid first image cannot save an invalid second one: the whole request is refused before anything is stored.
    expect(code([image('ok.png', 'image/png', PNG), image('bad.png', 'image/png', Buffer.from('nope'))])).toBe('issueImageType')
    expect(issues.list()).toHaveLength(0)
    expect(triggers).toHaveLength(0)
    expect(existsSync(join(directory, 'local-images'))).toBe(false)
  })

  it('closes an issue without deleting its record', () => {
    const { issues, project } = setup()
    const issue = issues.create({ title: 'Local requirement', project: project.id })
    expect(issues.close(issue.id)?.state).toBe('closed')
    expect(issues.get(issue.id)?.state).toBe('closed')
  })

  it('defaults a requirement to native and stores an explicit execution mode before dispatch', () => {
    const { issues, project } = setup()
    const issue = issues.create({ title: 'Native by default', project: project.id })
    expect(issue.execution).toBeUndefined()
    expect(requirementExecutionMode(issue)).toBe('native')
    const chosen = issues.setExecution(issue.id, 'feature-exec')!
    expect(chosen.execution).toBe('feature-exec')
    expect(requirementExecutionMode(issues.get(issue.id)!)).toBe('feature-exec')
    expect(issues.setExecution(issue.id, 'native')!.execution).toBe('native')
    expect(issues.setExecution('q-unknown', 'native')).toBeUndefined()
  })

  it('refuses an unknown execution mode and leaves the requirement unchanged', () => {
    const { issues, project } = setup()
    const issue = issues.create({ title: 'Valid mode', project: project.id })
    expect(() => issues.setExecution(issue.id, 'sometimes')).toThrow('Execution mode must be native or feature-exec')
    expect(issues.get(issue.id)).toEqual(issue)
  })

  it('refuses to change the mode once the requirement dispatched slice tickets', () => {
    const { issues, store, project } = setup()
    const issue = issues.create({ title: 'Dispatched', project: project.id })
    issues.setExecution(issue.id, 'feature-exec')
    store.tickets.save({ id: 't-lock', plan: { issueId: issue.id, sliceId: 'C1' } } as unknown as Ticket)
    expect(() => issues.setExecution(issue.id, 'native')).toThrow('A requirement that has dispatched tickets keeps its execution mode')
    expect(issues.get(issue.id)?.execution).toBe('feature-exec')
  })
})

/** Questions about a requirement's dispatched Tickets: recorded on the requirement, answered through a port, retried. */
describe('requirement questions', () => {
  const at = '2026-09-01T00:00:00.000Z'
  const lifetime = new AbortController().signal
  const setup = (ask: TicketAnswers['ask']) => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-local-'))
    directories.push(directory)
    const store = new Store(join(directory, 'orchestrator.sqlite'))
    const receive = () => ({ kind: 'stored' }) as never
    const issues = new LocalIssues({ store, stateDir: directory, discussions: new Discussions({ store, receive }), receive })
    const project = issues.createProject({ name: 'Demo', repository: 'acme/widgets' })
    const issue = issues.create({ title: 'Ask about a dispatched ticket', project: project.id })
    const questions = new LocalQuestions({ store, local: issues, answers: { ask }, lifetime, now: () => at })
    return { issues, questions, store, issue }
  }
  /** A dispatched Ticket of `issueId`, whose worker Session started unless `started` is false. */
  const ticket = (issueId: string, started = true): Ticket => ({ id: 't-x', plan: { issueId },
    assignments: [{ id: 'a-1', state: 'running', createdAt: at, ...(started ? { startedAt: at } : {}) }] } as unknown as Ticket)

  it('records a question as asked at once and answers it on the requirement in the background', async () => {
    const ask = vi.fn(async () => ({ ok: true as const, answer: 'The worker retried a flaky check.' }))
    const { issues, questions, store, issue } = setup(ask)
    const dispatched = ticket(issue.id)
    store.tickets.save(dispatched)
    const asked = questions.ask(issue.id, dispatched.id, '  Why did this fail?  ')!
    expect(asked.question).toMatchObject({ ticket: dispatched.id, text: 'Why did this fail?', status: 'asked', askedAt: at })
    expect(asked.question.id).toMatch(/^qn-[0-9a-f]{8}$/)
    expect(issues.get(issue.id)!.questions).toEqual([asked.question])
    // The request path never reaches the port: recording `asked` returns first.
    expect(ask).not.toHaveBeenCalled()
    await questions.idle()
    expect(ask).toHaveBeenCalledWith(dispatched, 'Why did this fail?', { signal: lifetime })
    const stored = issues.get(issue.id)!.questions![0]!
    expect(stored).toMatchObject({ status: 'answered', answer: 'The worker retried a flaky check.', answeredAt: at })
    expect(stored.error).toBeUndefined()
  })

  it('refuses a question about a Ticket that this requirement did not dispatch', () => {
    const ask = vi.fn()
    const { issues, questions, store, issue } = setup(ask as unknown as TicketAnswers['ask'])
    store.tickets.save(ticket('q-other'))
    store.tickets.save({ id: 't-planless', plan: undefined, assignments: [{ id: 'a-1', state: 'running', createdAt: at, startedAt: at }] } as unknown as Ticket)
    expect(() => questions.ask(issue.id, 't-x', 'Why?')).toThrow('dispatched Tickets')
    expect(() => questions.ask(issue.id, 't-planless', 'Why?')).toThrow('dispatched Tickets')
    expect(ask).not.toHaveBeenCalled()
    expect(issues.get(issue.id)).toEqual(issue)
  })

  it('refuses a question about a Ticket whose worker Session never started', () => {
    const ask = vi.fn()
    const { issues, questions, store, issue } = setup(ask as unknown as TicketAnswers['ask'])
    store.tickets.save(ticket(issue.id, false))
    expect(() => questions.ask(issue.id, 't-x', 'Why?')).toThrow('has not started its worker Session')
    expect(ask).not.toHaveBeenCalled()
    expect(issues.get(issue.id)).toEqual(issue)
  })

  it('records a failed question with its reason, retries it under the same record and refuses retrying an answer', async () => {
    const ask = vi.fn<TicketAnswers['ask']>(async () => ({ ok: false, reason: 'timeout', message: 'The answer did not end within 120000ms' }))
    const { issues, questions, store, issue } = setup(ask)
    store.tickets.save(ticket(issue.id))
    const asked = questions.ask(issue.id, 't-x', 'Why did this fail?')!
    await questions.idle()
    const failed = issues.get(issue.id)!.questions![0]!
    expect(failed).toMatchObject({ id: asked.question.id, status: 'failed', answeredAt: at })
    expect(failed.error).toContain('did not end within 120000ms')
    // A retry re-queues the same record rather than appending a new one, and clears the previous failure.
    ask.mockResolvedValueOnce({ ok: true as const, answer: 'It was a flaky check.' })
    const retried = questions.retry(issue.id, asked.question.id)!
    expect(retried.question).toMatchObject({ id: asked.question.id, status: 'asked', askedAt: at })
    expect(retried.question.error).toBeUndefined()
    expect(retried.question.answer).toBeUndefined()
    expect(issues.get(issue.id)!.questions).toHaveLength(1)
    await questions.idle()
    expect(issues.get(issue.id)!.questions![0]).toMatchObject({ status: 'answered', answer: 'It was a flaky check.' })
    expect(() => questions.retry(issue.id, asked.question.id)).toThrow('Only a failed question can be retried')
    // Unknown requirements and questions read as absent rather than refused.
    expect(questions.retry('q-unknown', asked.question.id)).toBeUndefined()
    expect(questions.retry(issue.id, 'qn-unknown')).toBeUndefined()
  })

  it('records a port that throws as a failure instead of leaving the question waiting', async () => {
    const ask = vi.fn(async () => { throw new Error('the forked Session could not be reached') })
    const { issues, questions, store, issue } = setup(ask)
    store.tickets.save(ticket(issue.id))
    questions.ask(issue.id, 't-x', 'Why did this fail?')
    await questions.idle()
    expect(issues.get(issue.id)!.questions![0]).toMatchObject({ status: 'failed' })
    expect(issues.get(issue.id)!.questions![0]!.error).toContain('the forked Session could not be reached')
  })

  it('refuses a question once the requirement keeps the limit of them', () => {
    const ask = vi.fn()
    const { issues, questions, store, issue } = setup(ask as unknown as TicketAnswers['ask'])
    store.tickets.save(ticket(issue.id))
    const kept = Array.from({ length: QUESTION_LIMIT }, (_, index) => ({ id: `qn-${String(index).padStart(8, '0')}`, ticket: 't-x',
      text: `Question ${index}`, status: 'answered' as const, askedAt: at, answeredAt: at, answer: `Answer ${index}` }))
    issues.putIssue({ ...issue, questions: kept })
    expect(() => questions.ask(issue.id, 't-x', 'One too many')).toThrow(`at most ${QUESTION_LIMIT} questions`)
    expect(ask).not.toHaveBeenCalled()
    expect(issues.get(issue.id)!.questions).toHaveLength(QUESTION_LIMIT)
  })
})
