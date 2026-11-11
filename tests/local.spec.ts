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
    return { issues, triggers }
  }

  it('creates an issue and submits its text as a human Trigger on a local Thread', () => {
    const { issues, triggers } = setup()
    const issue = issues.create({ title: 'Local requirement', body: 'The body' })
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
    const { issues, triggers } = setup()
    const issue = issues.create({ title: 'Local requirement' })
    issues.comment(issue.id, 'One more detail')
    expect(triggers).toHaveLength(2)
    expect(triggers[1]).toMatchObject({ source: 'local', human: true, text: 'One more detail' })
    expect(issues.get(issue.id)?.title).toBe('Local requirement')
  })

  it('records a proposal and the person\'s review, and refuses a review without one', () => {
    const { issues } = setup()
    const issue = issues.create({ title: 'Local requirement' })
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

  it('closes an issue without deleting its record', () => {
    const { issues } = setup()
    const issue = issues.create({ title: 'Local requirement' })
    expect(issues.close(issue.id)?.state).toBe('closed')
    expect(issues.get(issue.id)?.state).toBe('closed')
  })
})
