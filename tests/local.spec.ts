import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalIssues, requirementTitle } from '../src/app/local.ts'
import { Store } from '../src/app/store.ts'
import type { Ticket, Trigger } from '../src/core/index.ts'
import { requirementExecutionMode, type LocalImageInput } from '../src/sources/local-format.ts'


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
    const issues = new LocalIssues({ store, stateDir: directory, receive: trigger => { triggers.push(trigger); return { kind: 'stored' } as never } })
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
    expect(proposed?.alignment).toMatchObject({ status: 'proposed', summary: 'Two slices', acceptance: ['typecheck'] })
    const confirmed = issues.decide(issue.id, 'confirm')
    expect(confirmed?.alignment).toMatchObject({ status: 'confirmed' })
    expect(confirmed?.alignment?.decidedAt).toBeTruthy()
    const rejected = issues.decide(issue.id, 'reject', 'Needs a narrower scope')
    expect(rejected?.alignment).toMatchObject({ status: 'rejected', reason: 'Needs a narrower scope' })
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
