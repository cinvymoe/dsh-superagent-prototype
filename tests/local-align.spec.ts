/** Local Discuss paths: a requirement accepted for alignment, dispatched slices, and the project worktree root its tickets execute under. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { feishu, startRuntime, type Host } from './fixtures/host.ts'
import { KV } from '../src/kv.ts'
import type { Ticket } from '../src/core/index.ts'

/** The id of the first human message on a local issue's thread. */
const firstTrigger = (h: Host, issueId: string) => h.runtime.store.read.threadTriggers(`local:${issueId}`, 1)[0]!.id

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
  const created = await h.api('POST', 'local/projects', { name: 'Rooted', intakeRepository: 'acme/intake', codeRepository: 'acme/rooted',
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
  const relative = await h.api('POST', 'local/projects', { name: 'Relative', intakeRepository: 'acme/intake', codeRepository: 'acme/relative',
    worktreeRoot: 'relative/root' })
  expect(relative.status).toBe(400)
  expect(relative.body).toMatchObject({ code: 'projectWorktreeRoot', error: expect.stringContaining('absolute path') })
  expect((await h.api('GET', 'local/projects')).body.projects).not.toContainEqual(expect.objectContaining({ name: 'Relative' }))
  // An empty string means unconfigured; a legacy record without the field still answers.
  const plain = await h.api('POST', 'local/projects', { name: 'Plain', intakeRepository: 'acme/intake', codeRepository: 'acme/plain',
    worktreeRoot: '' })
  expect(plain.status).toBe(200)
  expect(plain.body.project).not.toHaveProperty('worktreeRoot')
  // Omitted and whitespace-only mean unconfigured too: the route trims, and the retry alignment froze blank = no root.
  const omitted = await h.api('POST', 'local/projects', { name: 'Omitted', intakeRepository: 'acme/intake', codeRepository: 'acme/omitted' })
  expect(omitted.status).toBe(200)
  expect(omitted.body.project).not.toHaveProperty('worktreeRoot')
  const blank = await h.api('POST', 'local/projects', { name: 'Blank', intakeRepository: 'acme/intake', codeRepository: 'acme/blank',
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

/** A local project owns one GitHub chain: creating or editing it touches only that chain, and its tickets execute through it. */
describe('project repository chains', () => {
  type Chain = { id: string; intakeRepository: string; codeRepository: string }
  /** The GitHub Source chains as stored, in order. */
  const chains = (): Chain[] => h.runtime.store.settings().sources.github!.config.chains as Chain[]
  /** The project rows the panel's `GET local/projects` answers with. */
  const projects = async () => (await h.api('GET', 'local/projects')).body.projects as { id: string; name: string; chain?: string
    intakeRepository?: string; codeRepository?: string; repository?: string }[]
  const create = async (name: string, intakeRepository: string, codeRepository: string) => {
    const answer = await h.api('POST', 'local/projects', { name, intakeRepository, codeRepository })
    expect(answer.status).toBe(200)
    return answer.body.project as { id: string; name: string; chain: string; intakeRepository: string; codeRepository: string }
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
    for (const chain of before) expect(after.find(row => row.id === chain.id)).toEqual(chain)
    expect(after.find(row => row.id === project.id)).toEqual({ id: project.id, intakeRepository: 'acme/intake', codeRepository: 'acme/project' })
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
    const a = await create('Alpha', 'acme/intake', 'acme/rooted')
    const b = await create('Beta', 'acme/intake', 'acme/other')
    const rowOfB = { ...chains().find(row => row.id === b.id)! }
    const updated = await h.api('PUT', `local/projects/${a.id}`, { name: 'Alpha renamed', codeRepository: 'acme/project' })
    expect(updated.status).toBe(200)
    expect(updated.body.project).toMatchObject({ id: a.id, name: 'Alpha renamed', intakeRepository: 'acme/intake', codeRepository: 'acme/project' })
    expect(chains().find(row => row.id === a.id)).toEqual({ id: a.id, intakeRepository: 'acme/intake', codeRepository: 'acme/project' })
    // The other project's row is deeply equal to its snapshot, with no new row appended.
    expect(chains().find(row => row.id === b.id)).toEqual(rowOfB)
    expect(chains().filter(row => row.id === b.id)).toHaveLength(1)
    expect((await projects()).find(row => row.id === a.id))
      .toMatchObject({ name: 'Alpha renamed', intakeRepository: 'acme/intake', codeRepository: 'acme/project' })
    // A bad root on update is refused before either record changes.
    const refused = await h.api('PUT', `local/projects/${a.id}`, { worktreeRoot: 'relative/root' })
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ code: 'projectWorktreeRoot' })
    expect(chains().find(row => row.id === a.id)).toEqual({ id: a.id, intakeRepository: 'acme/intake', codeRepository: 'acme/project' })
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
  })
})
