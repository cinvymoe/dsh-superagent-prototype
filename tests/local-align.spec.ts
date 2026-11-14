/** Local Discuss paths: a requirement accepted for alignment, dispatched slices, and the project worktree root its tickets execute under. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feishu, startRuntime, type Host } from './fixtures/host.ts'
import { KV } from '../src/kv.ts'
import { EXECUTION_STRATEGY_REVISION, type ExecutionMode, type Ticket } from '../src/core/index.ts'
import { requirementExecutionMode, type LocalAlignment, type LocalIssue } from '../src/sources/local-format.ts'
import { REQUIREMENT_BODY_BYTES } from '../src/limits.ts'

/** The id of the first human message on a local issue's thread. */
const firstTrigger = (h: Host, issueId: string) => h.runtime.store.read.threadTriggers(`local:${issueId}`, 1)[0]!.id
/** A 1x1 transparent PNG and a 1x1 GIF, byte for byte the images the upload tests send. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/** Real roots a test configured as a project worktree root or executor directory, removed after it. */
const roots: string[] = []
const root = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-worktree-root-'))
  roots.push(directory)
  return directory
}

let h: Host
let project: { id: string }
beforeEach(async () => { h = await startRuntime(); project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' }) })
afterEach(async () => { await h.stop(); for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }) })

const slices = [
  { id: 'C1', title: 'Read the module', outcome: 'The module reads the requirement', acceptance: ['typecheck passes'], depends_on: [], lane: 'light' },
  { id: 'C2', title: 'Write the module', outcome: 'The module implements it', acceptance: ['tests pass'], depends_on: ['C1'], lane: 'full' },
]

it('accepts a local requirement for alignment and gives its worker the align tool instead of execution', async () => {
  const issue = h.runtime.local.create({ title: 'Add a local board', body: 'Requirements arrive in the panel.', project: project.id })
  await h.runtime.idle()
  const result = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title: 'Align the local board',
    worktree_name: 'align-local-board', acknowledgement: '收到，先做需求对齐。' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  const ticket = h.runtime.store.tickets.get(result.ticket.ticket_id)!
  expect(ticket.mode).toBe('align')
  const sessionId = `worker-${ticket.id}`
  const tools = h.tools.get(sessionId)!
  expect(tools.has('orchestrator_align')).toBe(true)
  // The proposal is attached to the issue the ticket came from, and starts no work.
  const proposal = await h.runTool(sessionId, 'orchestrator_align', { summary: 'Two slices.', slices, acceptance: ['both slices merge'] })
  expect(proposal).toEqual({ issue_id: issue.id, status: 'proposed', slices: 2 })
  expect(h.runtime.store.tickets.list().filter(item => item.plan)).toEqual([])
})

it('dispatches the confirmed slices as tickets, one per slice, and only after the person confirms', async () => {
  const issue = h.runtime.local.create({ title: 'Add a local board', project: project.id })
  await h.runtime.idle()
  const accepted = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title: 'Align the local board',
    worktree_name: 'align-local-board', acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  const sessionId = `worker-${accepted.ticket.ticket_id}`
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'Two slices.', slices, acceptance: [] })
  const pending = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'reject', reason: 'Narrower' })
  expect(pending.status).toBe(200)
  expect(h.runtime.store.tickets.list().filter(ticket => ticket.plan)).toEqual([])
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'Two slices, narrowed.', slices, acceptance: [] })
  const confirmed = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })
  expect(confirmed.body).toEqual(expect.objectContaining({ tickets: expect.any(Array) }))
  expect(confirmed.status).toBe(200)
  const tickets = h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === issue.id)
  expect(tickets.map(ticket => ticket.plan!.sliceId).sort()).toEqual(['C1', 'C2'])
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.plan!.acceptance).toEqual(['typecheck passes'])
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.execution?.assignment).toContain('Acceptance criteria:\n- typecheck passes')
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.execution?.repository).toBe('deepseek-ai/dsh-superagent-prototype')
  const environment = Object.fromEntries(h.runtime.ticketEnvironment(tickets[0]!).map(variable => [variable.key, variable.value]))
  expect(environment.DSH_SUPERAGENT_GITHUB_REPOSITORY).toBe('deepseek-ai/dsh-superagent-prototype')
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C2')!.dependsOn)
    .toEqual([tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.id])
  // The dependent slice waits for its dependency to end before its worker launches.
  await h.runtime.idle()
  const first = tickets.find(ticket => ticket.plan!.sliceId === 'C1')!, second = tickets.find(ticket => ticket.plan!.sliceId === 'C2')!
  expect(h.runtime.store.tickets.get(second.id)!.assignments[0]!.state).toBe('pending')
  expect(h.runtime.store.tickets.get(first.id)!.assignments[0]!.state).toBe('running')
  // Confirming twice dispatches nothing new.
  const again = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })
  expect(again.status).toBe(200)
  expect(h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === issue.id)).toHaveLength(2)
})

/** Accept a requirement for alignment and return its Aligner Ticket and worker Session id. */
async function acceptForAlignment(issueId: string) {
  await h.runtime.idle()
  const accepted = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issueId), title: 'Align the local board',
    worktree_name: 'align-local-board', acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  return { ticket: accepted.ticket, sessionId: `worker-${accepted.ticket.ticket_id}` }
}

it('delivers a rejection to the Aligner Session and accepts a new round', async () => {
  const issue = h.runtime.local.create({ title: 'Align again', project: project.id })
  const { sessionId } = await acceptForAlignment(issue.id)
  expect(await h.runTool(sessionId, 'orchestrator_align', { summary: 'First round.', slices, acceptance: [] }))
    .toEqual({ issue_id: issue.id, status: 'proposed', slices: 2 })
  const rejected = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'reject', reason: '缩小范围' })
  expect(rejected.status).toBe(200)
  await h.runtime.idle()
  // The rejection lands on the requirement Thread as a human message, so the Aligner's Session receives its reason.
  expect(h.relays(sessionId).some(item => JSON.stringify(item).includes('缩小范围'))).toBe(true)
  const narrowed = [{ id: 'C1', title: 'Read the narrowed module', outcome: 'The narrowed module is read', acceptance: ['typecheck passes'],
    depends_on: [], lane: 'light' }]
  expect(await h.runTool(sessionId, 'orchestrator_align', { summary: 'Second round.', slices: narrowed, acceptance: [] }))
    .toEqual({ issue_id: issue.id, status: 'proposed', slices: 1 })
  const rounds = h.runtime.local.get(issue.id)!.alignments!
  expect(rounds.map(round => `${round.roundId}:${round.status}`)).toEqual(['al-1:rejected', 'al-2:proposed'])
  expect(rounds[0]!.reason).toBe('缩小范围')
})

it('dispatches only the slices of the current round', async () => {
  const issue = h.runtime.local.create({ title: 'Latest round only', project: project.id })
  const { sessionId } = await acceptForAlignment(issue.id)
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'First round.', slices, acceptance: [] })
  const latest = [{ id: 'D1', title: 'Only the latest', outcome: 'The latest round dispatches', acceptance: ['typecheck'],
    depends_on: [], lane: 'light' }]
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'Second round.', slices: latest, acceptance: [] })
  const confirmed = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })
  expect(confirmed.status).toBe(200)
  await h.runtime.idle()
  const tickets = h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === issue.id)
  expect(tickets.map(ticket => ticket.plan!.sliceId)).toEqual(['D1'])
  expect(h.runtime.local.get(issue.id)!.alignments!.map(round => round.status)).toEqual(['superseded', 'confirmed'])
})

it('refuses a decision that names an older round and dispatches nothing', async () => {
  const issue = h.runtime.local.create({ title: 'Stale decision', project: project.id })
  const { sessionId } = await acceptForAlignment(issue.id)
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'First round.', slices, acceptance: [] })
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'Second round.', slices, acceptance: [] })
  const firstRound = h.runtime.local.get(issue.id)!.alignments![0]!.roundId
  const stale = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm', roundId: firstRound })
  expect(stale.status).toBe(400)
  expect(stale.body).toMatchObject({ code: 'alignmentRoundStale', values: { round: firstRound } })
  // The refusal happens before the record is written and before any slice dispatches.
  expect(h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === issue.id)).toEqual([])
  expect(h.runtime.local.get(issue.id)!.alignments!.map(round => round.status)).toEqual(['superseded', 'proposed'])
})

it('refuses a new alignment proposal once the latest round is confirmed', async () => {
  const issue = h.runtime.local.create({ title: 'Confirmed alignment', project: project.id })
  const { sessionId } = await acceptForAlignment(issue.id)
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'Only round.', slices, acceptance: [] })
  expect((await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })).status).toBe(200)
  const rounds = h.runtime.local.get(issue.id)!.alignments!
  await expect(h.runTool(sessionId, 'orchestrator_align', { summary: 'Too late.', slices, acceptance: [] }))
    .rejects.toThrow(/already confirmed/)
  expect(h.runtime.local.get(issue.id)!.alignments).toHaveLength(rounds.length)
})

it('records a requirement\'s execution mode, defaults to native and refuses changes after dispatch', async () => {
  const created = await h.api('POST', 'local/issues', { title: 'Choose the execution mode', project: project.id })
  expect(created.status).toBe(200)
  const issue = created.body.issue as { id: string; execution?: ExecutionMode }
  // A requirement that names no mode is native and keeps no field, so records written before the field stay valid.
  expect(issue.execution).toBeUndefined()
  expect(requirementExecutionMode(issue)).toBe('native')
  const chosen = await h.api('POST', `local/issues/${issue.id}/execution`, { mode: 'feature-exec' })
  expect(chosen.status).toBe(200)
  expect((chosen.body.issue as { execution?: ExecutionMode }).execution).toBe('feature-exec')
  // Reading the requirement back returns the stored mode.
  expect((((await h.api('GET', `local/issues/${issue.id}`)).body.issue) as { execution?: ExecutionMode }).execution).toBe('feature-exec')
  // An unknown mode is a structured refusal that explains the rule, and the stored mode does not change.
  const invalid = await h.api('POST', `local/issues/${issue.id}/execution`, { mode: 'sometimes' })
  expect(invalid.status).toBe(400)
  expect(invalid.body).toMatchObject({ code: 'executionMode' })
  expect((((await h.api('GET', `local/issues/${issue.id}`)).body.issue) as { execution?: ExecutionMode }).execution).toBe('feature-exec')
  expect((await h.api('POST', 'local/issues/q-unknown/execution', { mode: 'native' })).status).toBe(404)
  // Confirming the alignment pins the chosen mode on every dispatched ticket; from then on the requirement is read-only.
  const oneSlice = [{ id: 'C1', title: 'Only slice', outcome: 'The mode is pinned', acceptance: ['typecheck'], dependsOn: [], lane: 'light' }]
  expect((await h.api('POST', `local/issues/${issue.id}/alignment`, { summary: 'One slice', slices: oneSlice })).status).toBe(200)
  const confirmed = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })
  expect(confirmed.status).toBe(200)
  const tickets = h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === issue.id)
  expect(tickets).toHaveLength(1)
  expect(tickets[0]!.plan!.execution).toEqual({ mode: 'feature-exec', version: EXECUTION_STRATEGY_REVISION })
  const locked = await h.api('POST', `local/issues/${issue.id}/execution`, { mode: 'native' })
  expect(locked.status).toBe(400)
  expect(locked.body).toMatchObject({ code: 'executionLocked' })
  expect((((await h.api('GET', `local/issues/${issue.id}`)).body.issue) as { execution?: ExecutionMode }).execution).toBe('feature-exec')
  await h.runtime.idle()
})

it('dispatches a requirement without an execution field as native', async () => {
  const created = await h.api('POST', 'local/issues', { title: 'Legacy native', project: project.id })
  expect(created.status).toBe(200)
  const id = (created.body.issue as { id: string }).id
  const oneSlice = [{ id: 'C1', title: 'Only slice', outcome: 'Native dispatch', acceptance: [], dependsOn: [], lane: 'light' }]
  expect((await h.api('POST', `local/issues/${id}/alignment`, { summary: 'One slice', slices: oneSlice })).status).toBe(200)
  const confirmed = await h.api('POST', `local/issues/${id}/alignment/decision`, { decision: 'confirm' })
  expect(confirmed.status).toBe(200)
  const tickets = h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === id)
  expect(tickets).toHaveLength(1)
  expect(tickets[0]!.plan!.execution).toEqual({ mode: 'native', version: EXECUTION_STRATEGY_REVISION })
  await h.runtime.idle()
})

it('creates projects over HTTP and keeps requirements scoped to them', async () => {
  const created = await h.api('POST', 'local/projects', { name: 'Other', intakeRepository: 'acme/intake', codeRepository: 'acme/other' })
  expect(created.status).toBe(200)
  const project = created.body.project as { id: string; intakeRepository: string; codeRepository: string }
  expect(project).toMatchObject({ intakeRepository: 'acme/intake', codeRepository: 'acme/other' })
  const submitted = await h.api('POST', 'local/issues', { title: 'Project requirement', project: project.id })
  expect(submitted.status).toBe(200)
  const issue = submitted.body.issue as { id: string; project: string }
  expect(issue.project).toBe(project.id)
  const detail = await h.api('GET', `local/issues/${issue.id}`)
  expect(detail.body.project).toMatchObject({ id: project.id, intakeRepository: 'acme/intake', codeRepository: 'acme/other' })
  const missing = await h.api('POST', 'local/issues', { title: 'No project' })
  expect(missing.status).toBe(400)
})

it('accepts an optional absolute worktree root over HTTP and refuses a relative one', async () => {
  const created = await h.api('POST', 'local/projects', { name: 'Rooted', intakeRepository: 'acme/rooted-issues', codeRepository: 'acme/rooted',
    worktreeRoot: '/srv/worktrees' })
  expect(created.status).toBe(200)
  const project = created.body.project as { id: string; worktreeRoot?: string }
  expect(project.worktreeRoot).toBe('/srv/worktrees')
  const listed = await h.api('GET', 'local/projects')
  expect((listed.body.projects as { id: string; worktreeRoot?: string }[]).find(entry => entry.id === project.id)?.worktreeRoot).toBe('/srv/worktrees')
  // The requirement detail names its project, so the field is visible where a requirement is discussed.
  const submitted = await h.api('POST', 'local/issues', { title: 'Rooted requirement', project: project.id })
  const detail = await h.api('GET', `local/issues/${(submitted.body.issue as { id: string }).id}`)
  expect(detail.body.project).toMatchObject({ id: project.id, worktreeRoot: '/srv/worktrees' })
  // A relative root is a structured refusal that explains the rule, and nothing is stored.
  const relative = await h.api('POST', 'local/projects', { name: 'Relative', intakeRepository: 'acme/relative-issues', codeRepository: 'acme/relative',
    worktreeRoot: 'relative/root' })
  expect(relative.status).toBe(400)
  expect(relative.body).toMatchObject({ code: 'projectWorktreeRoot', error: expect.stringContaining('absolute path') })
  expect((await h.api('GET', 'local/projects')).body.projects).not.toContainEqual(expect.objectContaining({ name: 'Relative' }))
  // An empty string means unconfigured; a legacy record without the field still answers.
  const plain = await h.api('POST', 'local/projects', { name: 'Plain', intakeRepository: 'acme/plain-issues', codeRepository: 'acme/plain',
    worktreeRoot: '' })
  expect(plain.status).toBe(200)
  expect(plain.body.project).not.toHaveProperty('worktreeRoot')
  // Omitted and whitespace-only mean unconfigured too: the route trims, and the retry alignment froze blank = no root.
  const omitted = await h.api('POST', 'local/projects', { name: 'Omitted', intakeRepository: 'acme/omitted-issues', codeRepository: 'acme/omitted' })
  expect(omitted.status).toBe(200)
  expect(omitted.body.project).not.toHaveProperty('worktreeRoot')
  const blank = await h.api('POST', 'local/projects', { name: 'Blank', intakeRepository: 'acme/blank-issues', codeRepository: 'acme/blank',
    worktreeRoot: '   ' })
  expect(blank.status).toBe(200)
  expect(blank.body.project).not.toHaveProperty('worktreeRoot')
  const legacy = h.runtime.local.createProject({ name: 'Legacy', repository: 'acme/legacy' })
  const oldIssue = h.runtime.local.create({ title: 'Legacy requirement', project: legacy.id })
  const old = await h.api('GET', `local/issues/${oldIssue.id}`)
  expect(old.status).toBe(200)
  expect(old.body.project).toMatchObject({ id: legacy.id })
  expect(old.body.project).not.toHaveProperty('worktreeRoot')
  // The list returns a record without the field as-is, so old projects stay readable.
  const legacyListed = await h.api('GET', 'local/projects')
  expect(legacyListed.status).toBe(200)
  expect((legacyListed.body.projects as { id: string; worktreeRoot?: string }[]).find(entry => entry.id === legacy.id))
    .toMatchObject({ id: legacy.id })
  expect((legacyListed.body.projects as { id: string }[]).find(entry => entry.id === legacy.id)).not.toHaveProperty('worktreeRoot')
})

/** A local project's worktree root replaces the Execution root for new tickets, and is validated before any worker Session starts. */
describe('project worktree roots', () => {
  /** Every prepare command (`sh -c`) the executor spawned, in order. */
  const prepareRuns = () => h.subprocess.spawn.mock.calls.map(([spec]) => spec as { argv: string[]; cwd: string; env?: Record<string, string> })
    .filter(spec => spec.argv[0] === 'sh')
  /** Sets the executor's prepare command, which the harness runs in the selected root. */
  const prepareCommand = (command: string): void => {
    const settings = h.runtime.store.settings()
    h.runtime.store.saveSettings({ ...settings, executor: { ...settings.executor, prepare: command } })
  }
  /** Sets the executor's ticket directory root. */
  const executorRoot = (directory: string): void => {
    const settings = h.runtime.store.settings()
    h.runtime.store.saveSettings({ ...settings, executor: { ...settings.executor, directory } })
  }
  /** Accepts a local issue's first message as an execution ticket and waits for its launch. */
  const accept = async (issueId: string): Promise<Ticket> => {
    const result = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issueId), title: 'Execute the requirement',
      worktree_name: 'fix-local', acknowledgement: '收到。' }) as { ticket: { ticket_id: string } }
    await h.runtime.idle()
    return h.runtime.store.tickets.get(result.ticket.ticket_id)!
  }

  it('prepares a local ticket under its project worktree root, with the ticket directory and project repository', async () => {
    const directory = root()
    prepareCommand('true')
    const rooted = h.runtime.local.createProject({ name: 'Rooted', repository: 'acme/project-widgets', worktreeRoot: directory })
    const issue = h.runtime.local.create({ title: 'Rooted requirement', project: rooted.id })
    const ticket = await accept(issue.id)
    expect(ticket.execution?.directory).toBe(join(directory, ticket.execution!.name))
    expect(ticket.execution?.worktreeRoot).toBe(directory)
    expect(ticket.execution?.repository).toBe('acme/project-widgets')
    expect(prepareRuns()).toEqual([expect.objectContaining({ argv: ['sh', '-c', 'true'], cwd: directory,
      env: expect.objectContaining({ DSH_SUPERAGENT_DIR: ticket.execution!.directory, DSH_SUPERAGENT_GITHUB_REPOSITORY: 'acme/project-widgets' }) })])
    expect(h.agents.has(`worker-${ticket.id}`)).toBe(true)
  })

  it('keeps the executor directory or the default work root when a project sets no worktree root', async () => {
    prepareCommand('true')
    const executor = root()
    executorRoot(executor)
    const plain = h.runtime.local.createProject({ name: 'Plain', repository: 'acme/widgets' })
    const issue = h.runtime.local.create({ title: 'Plain requirement', project: plain.id })
    const ticket = await accept(issue.id)
    expect(ticket.execution?.directory).toBe(join(executor, ticket.execution!.name))
    // A non-empty executor directory is an explicit root too, so the launch validates it rather than creating it on demand.
    expect(ticket.execution?.worktreeRoot).toBe(executor)
    expect(prepareRuns()[0]).toEqual(expect.objectContaining({ cwd: executor }))
    // Without a configured root, the default <stateDir>/work is still created and the ticket prepared in it.
    executorRoot('')
    const second = h.runtime.local.create({ title: 'Default requirement', project: plain.id })
    const defaulted = await accept(second.id)
    expect(defaulted.execution?.directory).toBe(join(h.directory, 'work', defaulted.execution!.name))
    expect(defaulted.execution).not.toHaveProperty('worktreeRoot')
    expect(prepareRuns().at(-1)).toEqual(expect.objectContaining({ cwd: join(h.directory, 'work') }))
    expect(existsSync(join(h.directory, 'work', defaulted.execution!.name))).toBe(true)
  })

  it('keeps a Feishu ticket on the default root when a project configures a worktree root', async () => {
    prepareCommand('true')
    h.runtime.local.createProject({ name: 'Rooted', repository: 'acme/widgets', worktreeRoot: root() })
    const { ticket } = await h.acceptedTicket(feishu('7', '@bot 修 feishu'))
    expect(ticket.execution?.directory).toBe(join(h.directory, 'work', ticket.execution!.name))
    expect(ticket.execution).not.toHaveProperty('worktreeRoot')
    expect(prepareRuns()[0]).toEqual(expect.objectContaining({ cwd: join(h.directory, 'work') }))
  })

  it('fails a launch whose explicit worktree root is missing, without creating it or falling back', async () => {
    prepareCommand('true')
    const missing = join(root(), 'worktrees')
    const project = h.runtime.local.createProject({ name: 'Missing', repository: 'acme/widgets', worktreeRoot: missing })
    const issue = h.runtime.local.create({ title: 'Missing root', project: project.id })
    const ticket = await accept(issue.id)
    expect(h.agents.has(`worker-${ticket.id}`)).toBe(false)
    expect(ticket.assignments.at(-1)!.report).toMatchObject({ state: 'failed' })
    const summary = ticket.assignments.at(-1)!.report!.summary
    expect(summary).toContain(missing)
    expect(summary).toContain('does not exist')
    expect(existsSync(missing)).toBe(false)
    expect(existsSync(join(h.directory, 'work', ticket.execution!.name))).toBe(false)
    expect(prepareRuns()).toEqual([])
  })

  it('fails a launch whose explicit worktree root is a regular file, and prepares nothing', async () => {
    prepareCommand('true')
    const file = join(root(), 'not-a-directory')
    writeFileSync(file, '')
    const project = h.runtime.local.createProject({ name: 'File', repository: 'acme/widgets', worktreeRoot: file })
    const issue = h.runtime.local.create({ title: 'File root', project: project.id })
    const ticket = await accept(issue.id)
    expect(h.agents.has(`worker-${ticket.id}`)).toBe(false)
    expect(ticket.assignments.at(-1)!.report).toMatchObject({ state: 'failed' })
    expect(ticket.assignments.at(-1)!.report!.summary).toContain(file)
    expect(ticket.assignments.at(-1)!.report!.summary).toContain('is not a directory')
    expect(existsSync(join(h.directory, 'work', ticket.execution!.name))).toBe(false)
    expect(prepareRuns()).toEqual([])
  })

  it('fails a launch whose explicit worktree root cannot take a write, as a read-only mount does', async () => {
    // Root bypasses permission bits, so prove that the write probe itself cannot create a directory there.
    expect(statSync('/proc/sys').isDirectory()).toBe(true)
    let creatable = true
    try { rmSync(mkdtempSync('/proc/sys/.dsh-superagent-write-check-'), { recursive: true, force: true }) } catch { creatable = false }
    expect(creatable).toBe(false)
    prepareCommand('true')
    const project = h.runtime.local.createProject({ name: 'Read only', repository: 'acme/widgets', worktreeRoot: '/proc/sys' })
    const issue = h.runtime.local.create({ title: 'Read-only root', project: project.id })
    const ticket = await accept(issue.id)
    expect(h.agents.has(`worker-${ticket.id}`)).toBe(false)
    expect(ticket.assignments.at(-1)!.report).toMatchObject({ state: 'failed' })
    expect(ticket.assignments.at(-1)!.report!.summary).toContain('/proc/sys')
    expect(ticket.assignments.at(-1)!.report!.summary).toContain('not writable')
    expect(existsSync(join(h.directory, 'work', ticket.execution!.name))).toBe(false)
    expect(prepareRuns()).toEqual([])
  })

  it('fails a launch whose non-empty executor directory is missing, without creating it', async () => {
    prepareCommand('true')
    const missing = join(root(), 'executor-root')
    executorRoot(missing)
    const project = h.runtime.local.createProject({ name: 'Executor', repository: 'acme/widgets' })
    const issue = h.runtime.local.create({ title: 'Missing executor root', project: project.id })
    const ticket = await accept(issue.id)
    expect(h.agents.has(`worker-${ticket.id}`)).toBe(false)
    expect(ticket.assignments.at(-1)!.report).toMatchObject({ state: 'failed' })
    expect(ticket.assignments.at(-1)!.report!.summary).toContain(missing)
    expect(ticket.assignments.at(-1)!.report!.summary).toContain('does not exist')
    expect(existsSync(missing)).toBe(false)
    expect(existsSync(join(h.directory, 'work', ticket.execution!.name))).toBe(false)
  })

  it('retries a failed explicit-root launch once the root exists and prepares there', async () => {
    prepareCommand('true')
    const missing = join(root(), 'worktrees')
    const project = h.runtime.local.createProject({ name: 'Retried', repository: 'acme/widgets', worktreeRoot: missing })
    const issue = h.runtime.local.create({ title: 'Retry the root', project: project.id })
    const ticket = await accept(issue.id)
    expect(ticket.assignments.at(-1)!.report).toMatchObject({ state: 'failed' })
    mkdirSync(missing)
    h.runtime.engine.retryTicket(ticket.id)
    await h.runtime.idle()
    const current = h.runtime.store.tickets.get(ticket.id)!
    expect(current.assignments.at(-1)).toMatchObject({ state: 'running' })
    expect(h.agents.has(`worker-${ticket.id}`)).toBe(true)
    expect(existsSync(join(missing, current.execution!.name))).toBe(true)
    expect(prepareRuns().at(-1)).toEqual(expect.objectContaining({ cwd: missing }))
  })

  it('relaunches a failed explicit-root launch from a human message on the ticket thread', async () => {
    prepareCommand('true')
    const missing = join(root(), 'worktrees')
    const project = h.runtime.local.createProject({ name: 'Commented', repository: 'acme/widgets', worktreeRoot: missing })
    const issue = h.runtime.local.create({ title: 'Comment on the root', project: project.id })
    const ticket = await accept(issue.id)
    expect(ticket.assignments.at(-1)!.report).toMatchObject({ state: 'failed' })
    mkdirSync(missing)
    h.runtime.local.comment(issue.id, 'The worktree root exists now; continue.')
    await h.runtime.idle()
    const current = h.runtime.store.tickets.get(ticket.id)!
    expect(current.assignments.at(-1)).toMatchObject({ state: 'running' })
    expect(h.agents.has(`worker-${ticket.id}`)).toBe(true)
    expect(existsSync(join(missing, current.execution!.name))).toBe(true)
  })

  it('keeps an accepted ticket\'s directory when the project root or executor directory changes; a new ticket uses the new root', async () => {
    prepareCommand('true')
    const first = root(), second = root(), executor = root()
    const project = h.runtime.local.createProject({ name: 'Stable', repository: 'acme/widgets', worktreeRoot: first })
    const issue = h.runtime.local.create({ title: 'Stable directory', project: project.id })
    const accepted = await accept(issue.id)
    const execution = { ...accepted.execution! }
    // The panel has no project editing yet, so update the stored record directly, as a later slice will.
    h.runtime.store.set(KV.local.project(project.id), { ...h.runtime.local.project(project.id)!, worktreeRoot: second })
    executorRoot(executor)
    expect(h.runtime.store.tickets.get(accepted.id)!.execution).toEqual(execution)
    const next = await accept(h.runtime.local.create({ title: 'New root', project: project.id }).id)
    expect(next.execution?.directory).toBe(join(second, next.execution!.name))
    expect(next.execution?.worktreeRoot).toBe(second)
    expect(h.runtime.store.tickets.get(accepted.id)!.execution).toEqual(execution)
  })
})

it('stores requirement images, returns their metadata and serves the bytes back with no caching', async () => {
  const submitted = await h.api('POST', 'local/issues', { title: 'With a screenshot', project: project.id,
    images: [{ name: 'shot.png', mediaType: 'image/png', data: PNG.toString('base64') }] })
  expect(submitted.status).toBe(200)
  const issue = submitted.body.issue as { id: string; images?: { id: string; name: string; mediaType: string; bytes: number }[] }
  expect(issue.images).toMatchObject([{ name: 'shot.png', mediaType: 'image/png', bytes: PNG.length }])
  const imageId = issue.images![0]!.id
  expect(imageId).toMatch(/^img-[0-9a-f]{8}$/)
  // The requirement detail carries the same metadata the record stores.
  const detail = await h.api('GET', `local/issues/${issue.id}`)
  expect((detail.body.issue as { images?: unknown }).images).toEqual(issue.images)
  // The image answers its own bytes, its stored media type and no caching.
  const served = await h.raw('GET', `local/issues/${issue.id}/images/${imageId}`)
  expect(served.status).toBe(200)
  expect(served.headers['content-type']).toBe('image/png')
  expect(served.headers['cache-control']).toBe('no-store')
  expect(served.body.equals(PNG)).toBe(true)
  // The Trigger carries every image's absolute path, and the file there is the submitted image.
  const text = h.runtime.store.read.threadTriggers(`local:${issue.id}`, 1)[0]!.text
  const path = join(h.directory, 'local-images', issue.id, `${imageId}.png`)
  expect(text).toContain(path)
  expect(existsSync(path)).toBe(true)
  expect(readFileSync(path).equals(PNG)).toBe(true)
  // Unknown image or issue ids are missing records; a request without the same-origin header is refused.
  expect((await h.api('GET', `local/issues/${issue.id}/images/img-unknown`)).status).toBe(404)
  expect((await h.api('GET', `local/issues/q-unknown/images/${imageId}`)).status).toBe(404)
  expect((await h.raw('GET', `local/issues/${issue.id}/images/${imageId}`, undefined, { 'x-orchestrator-request': undefined })).status)
    .toBe(403)
})

it('refuses an invalid image upload without creating the requirement or writing files', async () => {
  const before = h.runtime.local.list().length
  // A declared type that the bytes do not match is refused whole.
  const mismatched = await h.api('POST', 'local/issues', { title: 'Bad type', project: project.id,
    images: [{ name: 'x.png', mediaType: 'image/png', data: GIF.toString('base64') }] })
  expect(mismatched.status).toBe(400)
  expect(mismatched.body).toMatchObject({ code: 'issueImageType', values: { name: 'x.png' } })
  expect(h.runtime.local.list()).toHaveLength(before)
  expect(existsSync(join(h.directory, 'local-images'))).toBe(false)
  const tooMany = await h.api('POST', 'local/issues', { title: 'Too many', project: project.id,
    images: Array.from({ length: 5 }, (_value, index) => ({ name: `${index}.png`, mediaType: 'image/png', data: PNG.toString('base64') })) })
  expect(tooMany.status).toBe(400)
  expect(tooMany.body).toMatchObject({ code: 'issueImageCount', values: { max: '4' } })
  const oversized = await h.api('POST', 'local/issues', { title: 'Too large', project: project.id,
    images: [{ name: 'big.png', mediaType: 'image/png', data: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]).toString('base64') }] })
  expect(oversized.status).toBe(400)
  expect(oversized.body).toMatchObject({ code: 'issueImageSize', values: { name: 'big.png' } })
  expect(h.runtime.local.list()).toHaveLength(before)
  expect(existsSync(join(h.directory, 'local-images'))).toBe(false)
})

it('lets only the create-requirement route carry a body above the management limit', async () => {
  const large = Buffer.concat([PNG, Buffer.alloc(200 * 1024)])
  const accepted = await h.api('POST', 'local/issues', ({ title: 'A large image', project: project.id,
    images: [{ name: 'large.png', mediaType: 'image/png', data: large.toString('base64') }] }))
  expect(accepted.status).toBe(200)
  expect((accepted.body.issue as { images?: { bytes: number }[] }).images![0]!.bytes).toBe(large.length)
  // Another management route keeps the 128 KiB limit.
  const comment = await h.api('POST', `local/issues/${(accepted.body.issue as { id: string }).id}/comments`, { text: 'x'.repeat(200 * 1024) })
  expect(comment.status).toBe(400)
  expect(comment.body).toMatchObject({ error: `Request exceeds ${128 * 1024} bytes` })
  // The create route itself refuses a body above the limit that holds four full-size images.
  const huge = await h.api('POST', 'local/issues', { title: 'Too much', project: project.id,
    images: [{ name: 'huge.png', mediaType: 'image/png', data: 'A'.repeat(REQUIREMENT_BODY_BYTES) }] })
  expect(huge.status).toBe(400)
  expect(huge.body).toMatchObject({ error: `Request exceeds ${REQUIREMENT_BODY_BYTES} bytes` })
})

/** A local project owns one GitHub chain: creating or editing it touches only that chain, and its tickets execute through it. */
describe('project repository chains', () => {
  type Chain = { id: string; intakeRepository: string; codeRepository: string; cli?: string }
  /** The GitHub Source chains as stored, in order. */
  const chains = (): Chain[] => h.runtime.store.settings().sources.github!.config.chains as Chain[]
  /** The project rows the panel's `GET local/projects` answers with, including the derived bot CLI and account. */
  const projects = async () => (await h.api('GET', 'local/projects')).body.projects as { id: string; name: string; chain?: string
    intakeRepository?: string; codeRepository?: string; repository?: string; cli?: string; bot?: string }[]
  const create = async (name: string, intakeRepository: string, codeRepository: string, cli?: string) => {
    const answer = await h.api('POST', 'local/projects', { name, intakeRepository, codeRepository, ...(cli ? { cli } : {}) })
    expect(answer.status).toBe(200)
    return answer.body.project as { id: string; name: string; chain: string; intakeRepository: string; codeRepository: string; cli?: string }
  }
  /** The first message on a local issue's thread, which an accept routes into a ticket. */
  const accept = async (issueId: string) => {
    const result = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issueId), title: 'Execute the chain',
      worktree_name: 'fix-chain', acknowledgement: '收到。' }) as { ticket: { ticket_id: string } }
    await h.runtime.idle()
    return h.runtime.store.tickets.get(result.ticket.ticket_id)!
  }

  it('adds only the new project\'s chain and returns both repositories', async () => {
    const before = chains().map(chain => ({ ...chain }))
    const project = await create('Chained', 'acme/intake', 'acme/project')
    expect(project).toMatchObject({ intakeRepository: 'acme/intake', codeRepository: 'acme/project' })
    expect(project.chain).toBe(project.id)
    const after = chains()
    expect(after).toHaveLength(before.length + 1)
    // Every chain that existed before is untouched, field by field.
    for (const chain of before) expect(after.find(row => row.id === chain.id)).toEqual({ ...chain, cli: chain.cli ?? '' })
    expect(after.find(row => row.id === project.id)).toEqual({ id: project.id, intakeRepository: 'acme/intake', codeRepository: 'acme/project', cli: '' })
    expect((await projects()).find(row => row.id === project.id))
      .toMatchObject({ id: project.id, intakeRepository: 'acme/intake', codeRepository: 'acme/project' })
  })

  it('refuses bad, duplicate, unreadable and unpushable repositories without leaving a project or a chain', async () => {
    const before = chains().map(chain => ({ ...chain }))
    const namesBefore = (await projects()).map(row => row.name)
    const cases: { body: Record<string, unknown>; status: number; code?: string; setup?: string }[] = [
      { body: { name: 'Bad format', intakeRepository: 'acme/intake', codeRepository: 'not-a-repository' }, status: 400, code: 'projectRepository' },
      { body: { name: 'Demo', intakeRepository: 'acme/intake', codeRepository: 'acme/project' }, status: 400, code: 'projectTaken' },
      // No probe answer means the CLI reports nothing for the repository, which is the unreadable path.
      { body: { name: 'Missing', intakeRepository: 'acme/intake', codeRepository: 'acme/missing' }, status: 400, setup: 'github' },
      { body: { name: 'Readonly', intakeRepository: 'acme/intake', codeRepository: 'acme/readonly' }, status: 400, setup: 'github' },
    ]
    for (const item of cases) {
      const answer = await h.api('POST', 'local/projects', item.body)
      expect(answer.status).toBe(item.status)
      if (item.code) expect(answer.body).toMatchObject({ code: item.code })
      if (item.setup) expect(answer.body).toMatchObject({ setup: { place: item.setup } })
    }
    // No failed creation left a project record or changed the stored chains.
    expect((await projects()).map(row => row.name)).toEqual(namesBefore)
    expect(chains()).toEqual(before)
  })

  it('updates only the edited project\'s chain and leaves every other project\'s chain equal', async () => {
    const a = await create('Alpha', 'acme/alpha-issues', 'acme/rooted')
    const b = await create('Beta', 'acme/beta-issues', 'acme/other')
    const rowOfB = { ...chains().find(row => row.id === b.id)! }
    const updated = await h.api('PUT', `local/projects/${a.id}`, { name: 'Alpha renamed', codeRepository: 'acme/project' })
    expect(updated.status).toBe(200)
    expect(updated.body.project).toMatchObject({ id: a.id, name: 'Alpha renamed', intakeRepository: 'acme/alpha-issues', codeRepository: 'acme/project' })
    expect(chains().find(row => row.id === a.id)).toEqual({ id: a.id, intakeRepository: 'acme/alpha-issues', codeRepository: 'acme/project', cli: '' })
    // The other project's row is deeply equal to its snapshot, with no new row appended.
    expect(chains().find(row => row.id === b.id)).toEqual(rowOfB)
    expect(chains().filter(row => row.id === b.id)).toHaveLength(1)
    expect(chains().filter(row => row.id === a.id)).toHaveLength(1)
    expect(chains()).toHaveLength(3)
    expect((await projects()).find(row => row.id === a.id))
      .toMatchObject({ name: 'Alpha renamed', intakeRepository: 'acme/alpha-issues', codeRepository: 'acme/project' })
    // A bad root on update is refused before either record changes.
    const refused = await h.api('PUT', `local/projects/${a.id}`, { worktreeRoot: 'relative/root' })
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ code: 'projectWorktreeRoot' })
    expect(chains().find(row => row.id === a.id)).toEqual({ id: a.id, intakeRepository: 'acme/alpha-issues', codeRepository: 'acme/project', cli: '' })
  })

  it('refuses an intake repository another project or chain already receives from, without writing either', async () => {
    const demo = await create('Demo chain', 'acme/demo-issues', 'acme/demo')
    const other = await create('Other chain', 'acme/other-issues', 'acme/other')
    const chainSnapshot = chains().map(chain => ({ ...chain }))
    const projectSnapshot = (await projects()).map(row => ({ ...row }))
    const attempts = [
      { name: 'Duplicate project', intakeRepository: 'acme/demo-issues', codeRepository: 'acme/plain', code: 'projectIntakeTaken',
        values: { repository: 'acme/demo-issues', project: 'Demo chain' } },
      // GitHub repository names are case-insensitive, so a different spelling is occupied too.
      { name: 'Duplicate case', intakeRepository: 'ACME/DEMO-ISSUES', codeRepository: 'acme/plain', code: 'projectIntakeTaken',
        values: { repository: 'ACME/DEMO-ISSUES', project: 'Demo chain' } },
      // The default chain has no project, so its refusal names the chain instead.
      { name: 'Ownerless chain', intakeRepository: 'acme/widgets', codeRepository: 'acme/plain', code: 'chainIntakeTaken',
        values: { repository: 'acme/widgets', chain: 'default' } },
    ]
    for (const { code, values, ...body } of attempts) {
      const answer = await h.api('POST', 'local/projects', body)
      expect(answer.status).toBe(400)
      expect(answer.body).toMatchObject({ code, values })
    }
    // Moving another project's intake repository onto Demo's is refused too.
    const moved = await h.api('PUT', `local/projects/${other.id}`, { intakeRepository: 'acme/demo-issues' })
    expect(moved.status).toBe(400)
    expect(moved.body).toMatchObject({ code: 'projectIntakeTaken', values: { repository: 'acme/demo-issues', project: 'Demo chain' } })
    // Every refusal left both projects and the chain list exactly as they were.
    expect((await projects()).map(row => ({ ...row }))).toEqual(projectSnapshot)
    expect(chains()).toEqual(chainSnapshot)
    // The owning project can still edit itself while keeping its own intake repository.
    const kept = await h.api('PUT', `local/projects/${demo.id}`, { name: 'Demo renamed', intakeRepository: 'acme/demo-issues', codeRepository: 'acme/demo' })
    expect(kept.status).toBe(200)
    expect(chains().filter(row => row.intakeRepository === 'acme/demo-issues')).toHaveLength(1)
  })

  it('refuses deleting or renaming a chain a project uses, and the project keeps executing through it', async () => {
    const protectedProject = await create('Protected chain', 'acme/protected-issues', 'acme/protected')
    const block = h.runtime.settings.block('source:github') as { revision: number
      value: { enabled: boolean; config: { chains: Chain[] } } }
    const stored = structuredClone(block.value.config)
    const save = (chains: Chain[]) => h.api('PUT', 'settings/source:github',
      { value: { enabled: block.value.enabled, config: { ...block.value.config, chains } }, revision: block.revision })
    // Deleting the row drops the chain id the project names.
    const deleted = await save(block.value.config.chains.filter(chain => chain.id !== protectedProject.id))
    expect(deleted.status).toBe(400)
    expect(deleted.body).toMatchObject({ code: 'projectChainInUse', values: { chain: protectedProject.id, project: 'Protected chain' } })
    // Renaming it changes the same id, which cuts the project off just as well.
    const renamed = await save(block.value.config.chains.map(chain => chain.id === protectedProject.id ? { ...chain, id: 'renamed' } : chain))
    expect(renamed.status).toBe(400)
    expect(renamed.body).toMatchObject({ code: 'projectChainInUse', values: { chain: protectedProject.id, project: 'Protected chain' } })
    // Neither refusal changed what is stored.
    expect(h.runtime.store.settings().sources.github!.config).toEqual(stored)
    // The project still executes through the chain it kept.
    const issue = h.runtime.local.create({ title: 'Still chained', project: protectedProject.id })
    const ticket = await accept(issue.id)
    expect(ticket.execution).toMatchObject({ chain: protectedProject.id, repository: 'acme/protected', intakeRepository: 'acme/protected-issues' })
  })

  it('still edits chains no project uses, and refuses two chains receiving the same intake repository', async () => {
    const block = h.runtime.settings.block('source:github') as { revision: number
      value: { enabled: boolean; config: { chains: Chain[] } } }
    // A chain no project owns stays editable from the Source card.
    const edited = block.value.config.chains.map(chain => chain.id === 'default' ? { ...chain, intakeRepository: 'acme/other' } : chain)
    const allowed = await h.api('PUT', 'settings/source:github',
      { value: { enabled: block.value.enabled, config: { ...block.value.config, chains: edited } }, revision: block.revision })
    expect(allowed.status).toBe(200)
    const next = h.runtime.settings.block('source:github') as { revision: number
      value: { enabled: boolean; config: { chains: Chain[] } } }
    const duplicated = [...next.value.config.chains, { id: 'copy', intakeRepository: 'acme/other', codeRepository: 'acme/plain', cli: '' }]
    const refused = await h.api('PUT', 'settings/source:github',
      { value: { enabled: next.value.enabled, config: { ...next.value.config, chains: duplicated } }, revision: next.revision })
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ code: 'chainIntakeTaken', values: { chain: 'default', repository: 'acme/other' } })
    // The refused save stored nothing.
    expect(h.runtime.store.settings().sources.github!.config).toEqual(next.value.config)
  })

  it('executes a project ticket through the project\'s own chain', async () => {
    const project = await create('Chained ticket', 'acme/intake', 'acme/widgets')
    const issue = h.runtime.local.create({ title: 'Chain requirement', project: project.id })
    const ticket = await accept(issue.id)
    expect(ticket.execution?.chain).toBe(project.id)
    expect(ticket.execution?.repository).toBe('acme/widgets')
    expect(ticket.execution?.intakeRepository).toBe('acme/intake')
    const environment = Object.fromEntries(h.runtime.ticketEnvironment(ticket).map(variable => [variable.key, variable.value]))
    expect(environment.DSH_SUPERAGENT_GITHUB_REPOSITORY).toBe('acme/widgets')
    expect(environment.DSH_SUPERAGENT_GITHUB_INTAKE_REPOSITORY).toBe('acme/intake')
  })

  it('writes an entered bot only to its own chain and keeps a blank one on the Source-level CLI', async () => {
    // Rows stored before chains carried a CLI read with the schema's blank default, so normalize the snapshot.
    const before = chains().map(row => ({ ...row, cli: row.cli ?? '' }))
    const withBot = await create('Bot project', 'acme/intake', 'acme/widgets', h.projectBotCli)
    const withDefault = await create('Default bot', 'acme/rooted', 'acme/other')
    // The entered CLI lands on exactly that project's chain row; the other project's row is unchanged field by field.
    expect(chains().find(row => row.id === withBot.id)).toEqual({ id: withBot.id, intakeRepository: 'acme/intake',
      codeRepository: 'acme/widgets', cli: h.projectBotCli })
    expect(chains().find(row => row.id === withDefault.id)).toEqual({ id: withDefault.id, intakeRepository: 'acme/rooted',
      codeRepository: 'acme/other', cli: '' })
    for (const row of before) expect(chains().find(item => item.id === row.id)).toEqual(row)
    // Reading the project back reports its chain's CLI; the account appears once setup resolves the chain.
    expect((await projects()).find(row => row.id === withBot.id)).toMatchObject({ cli: h.projectBotCli })
    expect((await projects()).find(row => row.id === withBot.id)).not.toHaveProperty('bot')
  })

  it('shows each project\'s own bot account once setup resolved its chain', async () => {
    const at = '2026-09-01T00:00:00.000Z'
    const settings = h.runtime.store.settings()
    h.runtime.store.saveSettings({ ...settings, sources: { ...settings.sources, github: { enabled: true,
      config: { cli: h.agentCli, chains: [
        { id: 'alpha', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets', cli: '' },
        { id: 'beta', intakeRepository: 'acme/intake', codeRepository: 'acme/other', cli: h.projectBotCli },
      ] } } } })
    // Resolve the configured chains as a restart's setup run does, so both accounts are known.
    expect(await h.runtime.setup.run(h.runtime.store.settings())).toBe(true)
    h.runtime.local.putProject({ id: 'p-alpha', name: 'Alpha project', chain: 'alpha',
      intakeRepository: 'acme/intake', codeRepository: 'acme/widgets', createdAt: at, updatedAt: at })
    h.runtime.local.putProject({ id: 'p-beta', name: 'Beta project', chain: 'beta',
      intakeRepository: 'acme/intake', codeRepository: 'acme/other', createdAt: at, updatedAt: at })
    const listed = await projects()
    expect(listed.find(row => row.id === 'p-alpha')).toMatchObject({ bot: 'agent-bot', cli: '' })
    expect(listed.find(row => row.id === 'p-beta')).toMatchObject({ bot: 'project-bot', cli: h.projectBotCli })
  })

  it('refuses an unusable bot CLI with a 400 and leaves every project and chain unchanged', async () => {
    const before = chains().map(row => ({ ...row }))
    const namesBefore = (await projects()).map(row => row.name)
    const missing = await h.api('POST', 'local/projects', { name: 'Bad bot', intakeRepository: 'acme/intake', codeRepository: 'acme/other',
      cli: join(h.directory, 'missing-gh') })
    expect(missing.status).toBe(400)
    expect(missing.body).toMatchObject({ setup: { place: 'github', code: 'agentCliMissing' } })
    expect((await projects()).map(row => row.name)).toEqual(namesBefore)
    expect(chains()).toEqual(before)
    // An edit is refused the same way, before the stored row or record changes.
    const steady = await create('Steady', 'acme/intake', 'acme/other')
    const refused = await h.api('PUT', `local/projects/${steady.id}`, { cli: join(h.directory, 'missing-gh') })
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ setup: { place: 'github', code: 'agentCliMissing' } })
    expect(chains().find(row => row.id === steady.id)?.cli).toBe('')
  })

  it('sets, keeps and clears one project\'s bot without touching the other project\'s chain', async () => {
    const a = await create('Alpha bot', 'acme/intake', 'acme/widgets')
    const b = await create('Beta bot', 'acme/rooted', 'acme/other')
    const rowOfB = { ...chains().find(row => row.id === b.id)! }
    const set = await h.api('PUT', `local/projects/${a.id}`, { cli: h.projectBotCli })
    expect(set.status).toBe(200)
    expect(chains().find(row => row.id === a.id)).toEqual({ id: a.id, intakeRepository: 'acme/intake', codeRepository: 'acme/widgets',
      cli: h.projectBotCli })
    expect(chains().find(row => row.id === b.id)).toEqual(rowOfB)
    // An update that names no bot keeps the stored one, so editing a name never resets the project's bot.
    expect((await h.api('PUT', `local/projects/${a.id}`, { name: 'Alpha renamed' })).status).toBe(200)
    expect(chains().find(row => row.id === a.id)?.cli).toBe(h.projectBotCli)
    // An emptied field writes the blank row again, so the chain falls back to the Source default CLI.
    expect((await h.api('PUT', `local/projects/${a.id}`, { cli: '' })).status).toBe(200)
    expect(chains().find(row => row.id === a.id)).toEqual({ id: a.id, intakeRepository: 'acme/intake', codeRepository: 'acme/widgets', cli: '' })
    expect(chains().find(row => row.id === b.id)).toEqual(rowOfB)
  })

  it('binds a legacy project to the chain its code repository names at startup, idempotently and without a chain for unmatched ones', async () => {
    await h.stop()
    const at = '2026-09-01T00:00:00.000Z'
    h = await startRuntime(seeded => {
      seeded.set(KV.local.project('p-match'), { id: 'p-match', name: 'Matched', repository: 'acme/widgets', createdAt: at, updatedAt: at })
      seeded.set(KV.local.project('p-unmatched'), { id: 'p-unmatched', name: 'Unmatched', repository: 'acme/legacy', createdAt: at, updatedAt: at })
      // A second chain whose code repository the unmatched project does not name, so binding must match by value.
      const settings = seeded.settings()
      const github = settings.sources.github!.config as { chains: Chain[] }
      seeded.saveSettings({ ...settings, sources: { ...settings.sources, github: { enabled: true,
        config: { ...settings.sources.github!.config, chains: [...github.chains, { id: 'other', intakeRepository: 'acme/intake', codeRepository: 'acme/other' }] } } } })
    })
    const matched = h.runtime.local.project('p-match')
    expect(matched).toMatchObject({ chain: 'default', intakeRepository: 'acme/widgets', codeRepository: 'acme/widgets', repository: 'acme/widgets' })
    const unmatched = h.runtime.local.project('p-unmatched')
    expect(unmatched).toMatchObject({ repository: 'acme/legacy' })
    expect(unmatched?.chain).toBeUndefined()
    expect(unmatched?.codeRepository).toBeUndefined()
    // A second binding pass sees the matched project already bound and writes nothing.
    h.runtime.projects.bindLegacy()
    expect(h.runtime.local.project('p-match')).toEqual(matched)
    expect(h.runtime.local.project('p-unmatched')).toEqual(unmatched)
    const chainsAfterBinding = { ...h.runtime.store.settings().sources.github!.config }
    const issue = h.runtime.local.create({ title: 'Legacy execution', project: 'p-unmatched' })
    const ticket = await accept(issue.id)
    expect(ticket.execution?.repository).toBe('acme/legacy')
    expect(ticket.execution?.intakeRepository).toBe('acme/legacy')
    // A legacy record keeps the deployment chain it started from and only overrides the repositories.
    expect(ticket.execution?.chain).toBe('default')
    // Binding only writes project records: the stored chain configuration is unchanged.
    expect(h.runtime.store.settings().sources.github!.config).toEqual(chainsAfterBinding)
    // Editing a legacy default-bound project updates that one default row; it never adds a second chain under the project id.
    const rowsBeforeEdit = chains().map(row => ({ ...row }))
    const edited = await h.api('PUT', 'local/projects/p-match', { codeRepository: 'acme/project' })
    expect(edited.status).toBe(200)
    expect((edited.body.project as { chain?: string }).chain).toBe('default')
    expect(chains()).toHaveLength(rowsBeforeEdit.length)
    expect(chains().find(row => row.id === 'default')).toEqual({ id: 'default', intakeRepository: 'acme/widgets', codeRepository: 'acme/project', cli: '' })
    expect(chains().some(row => row.id === 'p-match')).toBe(false)
    expect(h.runtime.local.project('p-match')).toMatchObject({ chain: 'default', repository: 'acme/widgets',
      intakeRepository: 'acme/widgets', codeRepository: 'acme/project' })
  })
})

/**
 * A requirement shows 待关闭 once every slice Ticket of its confirmed alignment ended. The value is derived when the HTTP
 * view is built: no LocalIssue record carries it, so no migration is needed and a resumed Ticket turns it back off.
 */
describe('requirement slice completion', () => {
  const at = '2026-09-01T00:00:00.000Z'
  const slice = (id: string) => ({ id, title: `Slice ${id}`, outcome: `Outcome ${id}`, inScope: [], outOfScope: [], acceptance: [],
    dependsOn: [], lane: 'light' as const })
  const alignment = (status: 'proposed' | 'confirmed' | 'rejected', slices = [slice('C1')]): LocalAlignment =>
    ({ roundId: 'al-1', status, summary: 'One slice', slices, acceptance: [], proposedAt: at })
  /** The fields every directly written requirement shares; `project` is only known once the fixture ran. */
  const fields = () => ({ author: 'local', project: project.id, createdAt: at, updatedAt: at, state: 'open' as const })
  const listView = async (): Promise<{ id: string; slicesFinished: boolean }[]> =>
    (await h.api('GET', `local/issues?project=${project.id}`)).body.issues as { id: string; slicesFinished: boolean }[]
  const detailView = async (id: string): Promise<{ id: string; slicesFinished: boolean }> =>
    (await h.api('GET', `local/issues/${id}`)).body.issue as { id: string; slicesFinished: boolean }

  it('derives the flag for both end kinds and keeps it out of every stored record', async () => {
    const created = await h.api('POST', 'local/issues', { title: 'Every slice ended', project: project.id })
    const id = (created.body.issue as { id: string }).id
    // Nothing dispatches before the person confirms the alignment.
    expect((await h.api('POST', `local/issues/${id}/alignment`, { summary: 'Two slices',
      slices: [slice('C1'), slice('C2')] })).status).toBe(200)
    const confirmed = await h.api('POST', `local/issues/${id}/alignment/decision`, { decision: 'confirm' })
    expect(confirmed.status).toBe(200)
    expect((confirmed.body.issue as { slicesFinished?: boolean }).slicesFinished).toBe(false)
    await h.runtime.idle()
    const tickets = h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === id)
    expect(tickets.map(ticket => ticket.plan!.sliceId).sort()).toEqual(['C1', 'C2'])
    // While either slice Ticket is live both views say the slices are unfinished.
    expect((await listView()).find(issue => issue.id === id)!.slicesFinished).toBe(false)
    expect((await detailView(id)).slicesFinished).toBe(false)
    // The stored records carry no derived field at all.
    expect(h.runtime.local.get(id)).not.toHaveProperty('slicesFinished')
    expect(h.runtime.local.list().some(issue => 'slicesFinished' in issue)).toBe(false)
    // Every local route that answers with a requirement returns the view, not only the two GETs.
    const commented = await h.api('POST', `local/issues/${id}/comments`, { text: 'Starting the first slice' })
    expect((commented.body.issue as { slicesFinished?: boolean }).slicesFinished).toBe(false)
    // An executor's ready report ends one slice; the requirement is still unfinished.
    const first = tickets.find(ticket => ticket.plan!.sliceId === 'C1')!
    const second = tickets.find(ticket => ticket.plan!.sliceId === 'C2')!
    h.runtime.engine.report(first.id, { state: 'ready', summary: 'done' })
    expect(h.runtime.store.tickets.get(first.id)!.ended).toMatchObject({ by: 'executor' })
    expect((await detailView(id)).slicesFinished).toBe(false)
    // A person stopping the other slice counts as its end too, so the requirement turns 待关闭.
    h.runtime.engine.stopTicket(second.id)
    expect(h.runtime.store.tickets.get(second.id)!.ended).toMatchObject({ by: 'human', outcome: 'stopped' })
    expect((await listView()).find(issue => issue.id === id)!.slicesFinished).toBe(true)
    expect((await detailView(id)).slicesFinished).toBe(true)
    // Closing never rewrites the derived value or the stored record; the panel picks 已关闭 over 待关闭.
    const closed = await h.api('POST', `local/issues/${id}/close`)
    expect(closed.body.issue).toMatchObject({ state: 'closed', slicesFinished: true })
    expect(h.runtime.local.get(id)).toMatchObject({ state: 'closed' })
    expect(h.runtime.local.get(id)).not.toHaveProperty('slicesFinished')
  })

  it('keeps the flag false for alignments that are not a finished confirmed plan', async () => {
    // These requirements have real threads, so the detail route answers; their alignments are the anomalies.
    const anomalous = async (title: string, record: (id: string) => LocalIssue): Promise<string> => {
      const response = await h.api('POST', 'local/issues', { title, project: project.id })
      const id = (response.body.issue as { id: string }).id
      h.runtime.store.set(KV.local.issue(id), record(id))
      return id
    }
    const zero = await anomalous('Zero slices', id => ({ ...fields(), id, title: 'Zero slices', body: '',
      alignment: alignment('confirmed', []) }))
    const missing = await anomalous('Missing ticket', id => ({ ...fields(), id, title: 'Missing ticket', body: '',
      alignment: alignment('confirmed') }))
    const proposed = await anomalous('Proposed alignment', id => ({ ...fields(), id, title: 'Proposed alignment', body: '',
      alignment: alignment('proposed') }))
    const rejected = await anomalous('Rejected alignment', id => ({ ...fields(), id, title: 'Rejected alignment', body: '',
      alignment: alignment('rejected') }))
    const unaligned = await anomalous('No alignment', id => ({ ...fields(), id, title: 'No alignment', body: '' }))
    // The execution-mode route answers through the view too, and an anomalous requirement stays unfinished.
    const executed = await h.api('POST', `local/issues/${zero}/execution`, { mode: 'feature-exec' })
    expect(executed.status).toBe(200)
    expect((executed.body.issue as { slicesFinished?: boolean }).slicesFinished).toBe(false)
    const issues = await listView()
    for (const id of [zero, missing, proposed, rejected, unaligned]) {
      expect(issues.find(issue => issue.id === id)!.slicesFinished).toBe(false)
      expect((await detailView(id)).slicesFinished).toBe(false)
    }
  })
})

/**
 * A requirement's questions about its dispatched Tickets are recorded on the requirement and answered through a Session
 * forked off the Ticket's worker: the Engine sees nothing of it, and a restart re-queues what was still `asked`.
 */
describe('requirement questions', () => {
  const at = '2026-09-01T00:00:00.000Z'
  const oneSlice = [{ id: 'C1', title: 'Only slice', outcome: 'The question is answered', acceptance: [], dependsOn: [], lane: 'light' }]
  /** Ask for one slice, confirm it, run the dispatch, and return the slice's Ticket. */
  const dispatched = async (): Promise<{ id: string; ticket: Ticket; thread: string }> => {
    const created = await h.api('POST', 'local/issues', { title: 'Ask about a dispatched ticket', project: project.id })
    const id = (created.body.issue as { id: string }).id
    expect((await h.api('POST', `local/issues/${id}/alignment`, { summary: 'One slice', slices: oneSlice })).status).toBe(200)
    expect((await h.api('POST', `local/issues/${id}/alignment/decision`, { decision: 'confirm' })).status).toBe(200)
    await h.runtime.idle()
    const ticket = h.runtime.store.tickets.list().find(entry => entry.plan?.issueId === id)!
    expect(ticket.assignments.some(assignment => assignment.startedAt !== undefined)).toBe(true)
    return { id, ticket, thread: h.runtime.local.thread(id) }
  }

  it('returns asked at once, answers in the background and never touches the Ticket or the Engine', async () => {
    const { id, ticket, thread } = await dispatched()
    const snapshot = structuredClone(ticket)
    const triggers = h.runtime.store.read.recentTriggers(0, 100).length
    const decisions = h.runtime.store.decisions.byThread(thread).length
    const response = await h.api('POST', `local/issues/${id}/questions`, { ticket: ticket.id, text: 'Why did this fail?' })
    expect(response.status).toBe(200)
    const question = response.body.question as { id: string; status: string; error?: string }
    expect(question).toMatchObject({ status: 'asked', ticket: ticket.id, text: 'Why did this fail?' })
    expect((response.body.issue as { questions: { id: string }[] }).questions).toContainEqual(question)
    // The request path writes only the requirement record: the Ticket keeps its inputs, assignments, end and timestamp.
    const unchanged = () => {
      const stored = h.runtime.store.tickets.get(ticket.id)!
      expect({ inputs: stored.inputs, assignments: stored.assignments, ended: stored.ended, updatedAt: stored.updatedAt })
        .toEqual({ inputs: snapshot.inputs, assignments: snapshot.assignments, ended: snapshot.ended, updatedAt: snapshot.updatedAt })
    }
    unchanged()
    // The fixture's worker Session has no completed turn, so the real port fails: the answer is recorded as a failure.
    await h.runtime.localQuestions.idle()
    expect(h.runtime.local.get(id)!.questions![0]).toMatchObject({ status: 'failed' })
    expect(h.runtime.local.get(id)!.questions![0]!.error).toBeTruthy()
    unchanged()
    expect(h.runtime.store.read.recentTriggers(0, 100)).toHaveLength(triggers)
    expect(h.runtime.store.decisions.byThread(thread)).toHaveLength(decisions)
  })

  /** Append one event to a Session's log at the next seq, as DSH's log holds it. */
  const append = (sessionId: string, value: Record<string, unknown>): void => {
    const events = h.events.get(sessionId)!
    events.push({ ...value, seq: events.length } as never)
  }

  it('answers from a Session forked off the worker and records the answer on the requirement', async () => {
    const { id, ticket } = await dispatched()
    const worker = `worker-${ticket.id}`
    // The worker ran one turn where the question forks from; the worker Session itself is not touched.
    append(worker, { type: 'turn/start', time: 1, data: { turn: 1 } })
    append(worker, { type: 'turn/end', time: 2, data: { turn: 1, reason: { kind: 'completed' } } })
    const asked = await h.api('POST', `local/issues/${id}/questions`, { ticket: ticket.id, text: 'Why did this fail?' })
    expect(asked.status).toBe(200)
    expect((asked.body.question as { status: string }).status).toBe('asked')
    // The background queue hands the question to the fork of the worker Session.
    await vi.waitFor(() => expect(h.deliveries)
      .toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-fork-1', mode: 'queue', text: 'Why did this fail?' })))
    // The fork's model answered after the inherited prefix, and its turn ended.
    append('session-fork-1', { type: 'assistant/message', time: 3, surfaceOp: 'append',
      data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'The margin reset in src/app/passes.ts.' }] }, stream: [] } })
    h.agents.get('session-fork-1')!.status = 'idle'
    await h.runtime.localQuestions.idle()
    expect(h.runtime.local.get(id)!.questions![0]).toMatchObject({ status: 'answered', answer: 'The margin reset in src/app/passes.ts.' })
    expect(h.runtime.local.get(id)!.questions![0]!.error).toBeUndefined()
    // The answer came from a fork of the Ticket's worker, which is archived once it answered.
    expect(h.controller.fork).toHaveBeenCalledWith({ sessionId: worker })
    expect(h.archiveSession).toHaveBeenCalledWith('session-fork-1', { stopActivity: true })
  })

  it('re-queues the questions a restart left asked', async () => {
    await h.stop()
    h = await startRuntime(seed => {
      seed.set(KV.local.issue('q-seeded'), { id: 'q-seeded', title: 'Seeded requirement', body: '', author: 'local', project: 'p-seeded',
        createdAt: at, updatedAt: at, state: 'open',
        questions: [{ id: 'qn-00000001', ticket: 't-seeded', text: 'Why did this fail?', status: 'asked', askedAt: at }] })
      seed.tickets.save({ id: 't-seeded', title: 'Seeded ticket', plan: { issueId: 'q-seeded' }, channels: [], inputs: [], undelivered: [],
        origin: { triggerId: 'none', triggerIds: [] }, createdAt: at, updatedAt: at,
        assignments: [{ id: 'a-1', state: 'running', createdAt: at, startedAt: at }] } as unknown as Ticket)
    })
    await h.runtime.localQuestions.idle()
    // The real port reports that the Ticket has no worker Session, so the record settles as a failure with its reason.
    const question = h.runtime.local.get('q-seeded')!.questions![0]!
    expect(question.status).not.toBe('asked')
    expect(question).toMatchObject({ status: 'failed' })
    expect(question.error).toBeTruthy()
  })

  it('refuses a Ticket that never started a session and one of another requirement', async () => {
    const created = await h.api('POST', 'local/issues', { title: 'Ask the right ticket', project: project.id })
    const id = (created.body.issue as { id: string }).id
    h.runtime.store.tickets.save({ id: 't-pending', plan: { issueId: id },
      assignments: [{ id: 'a-1', state: 'pending', createdAt: at }] } as unknown as Ticket)
    h.runtime.store.tickets.save({ id: 't-elsewhere', plan: { issueId: 'q-elsewhere' },
      assignments: [{ id: 'a-1', state: 'running', createdAt: at, startedAt: at }] } as unknown as Ticket)
    const pending = await h.api('POST', `local/issues/${id}/questions`, { ticket: 't-pending', text: 'Why?' })
    expect(pending.status).toBe(400)
    expect(pending.body).toMatchObject({ code: 'questionNoSession' })
    const elsewhere = await h.api('POST', `local/issues/${id}/questions`, { ticket: 't-elsewhere', text: 'Why?' })
    expect(elsewhere.status).toBe(400)
    expect(elsewhere.body).toMatchObject({ code: 'questionTicket' })
    // A Ticket that does not exist at all is a missing record, not a refusal.
    expect((await h.api('POST', `local/issues/${id}/questions`, { ticket: 't-missing', text: 'Why?' })).status).toBe(404)
    expect((await h.api('POST', 'local/issues/q-unknown/questions', { ticket: 't-pending', text: 'Why?' })).status).toBe(404)
    expect((await h.api('POST', `local/issues/${id}/questions`, { ticket: 't-pending', text: '   ' })).status).toBe(400)
    // Nothing was recorded by any refusal.
    expect(h.runtime.local.get(id)!.questions).toBeUndefined()
  })
})
