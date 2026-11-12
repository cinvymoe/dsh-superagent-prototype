import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalIssues } from '../src/app/local.ts'
import { Store } from '../src/app/store.ts'
import type { Trigger } from '../src/core/index.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('the local issue board', () => {
  const setup = () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-local-'))
    directories.push(directory)
    const store = new Store(join(directory, 'orchestrator.sqlite'))
    const triggers: Trigger[] = []
    const issues = new LocalIssues({ store, receive: trigger => { triggers.push(trigger); return { kind: 'stored' } as never } })
    const project = issues.createProject({ name: 'Demo', repository: 'acme/widgets' })
    return { issues, triggers, project }
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

  it('closes an issue without deleting its record', () => {
    const { issues, project } = setup()
    const issue = issues.create({ title: 'Local requirement', project: project.id })
    expect(issues.close(issue.id)?.state).toBe('closed')
    expect(issues.get(issue.id)?.state).toBe('closed')
  })
})
