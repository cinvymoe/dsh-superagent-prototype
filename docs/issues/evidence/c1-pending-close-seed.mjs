/** Seed one C1 pending-close screenshot state database with identical demo data (no server running). */
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const path = process.argv[2]
if (!path) throw new Error('usage: seed.mjs <stateDir>')
mkdirSync(path, { recursive: true })
const db = new DatabaseSync(`${path}/orchestrator.sqlite`)
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
db.exec(`CREATE TABLE IF NOT EXISTS trigger (id TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS thread (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ticket (id TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS trigger_thread (thread TEXT NOT NULL, id TEXT NOT NULL, at TEXT NOT NULL, human INTEGER NOT NULL,
  PRIMARY KEY (thread, id))`)

const hash = values => createHash('sha256').update(JSON.stringify(values)).digest('hex')
const hex = text => hash([text]).slice(0, 32)
/** The core's `planTicketId`: the same id a real dispatch writes, so the derived view finds this Ticket. */
const ticketId = (issueId, sliceId) => hash(['ticket', 'plan', issueId, sliceId]).slice(0, 32)
const put = (key, value) => db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, JSON.stringify(value))
put('schema', 11)
put('master-id', `orchestrator-${hex('c1-close-master')}`)

const project = { id: 'p-widgets', name: 'Widgets', chain: 'p-widgets', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets',
  worktreeRoot: '/srv/worktrees', createdAt: '2026-11-12T09:55:00.000Z', updatedAt: '2026-11-12T09:55:00.000Z' }
put(`local-project:${project.id}`, project)

const slice = (id, title, acceptance = []) => ({ id, title, outcome: '', inScope: [], outOfScope: [], acceptance, dependsOn: [], lane: 'full' })
const alignment = (slices, at) => ({ status: 'confirmed', summary: '拆成两个切片，先后端派生再补面板标签。', slices, acceptance: [],
  proposedAt: at, decidedAt: new Date(new Date(at).getTime() + 30_000).toISOString() })

const issues = [
  { id: 'q-close-done', title: '需求列表新增待关闭状态', at: '2026-11-12T10:05:00.000Z', state: 'open',
    body: '需求列表新增待关闭状态\n\n一条需求的全部切片执行完毕后，状态显示待关闭，对齐标签保持不变。',
    alignment: alignment([slice('C1', '服务端派生 slicesFinished', ['两个接口返回派生值']), slice('C2', '面板显示待关闭', ['列表与详情一致'])],
      '2026-11-12T10:05:30.000Z') },
  { id: 'q-close-live', title: '需求详情支持批量导出', at: '2026-11-12T10:04:00.000Z', state: 'open',
    body: '需求详情支持批量导出\n\n把当前项目的需求导出为 CSV，包含状态与对齐结果。',
    alignment: alignment([slice('C1', '导出接口', ['导出文件名含项目名']), slice('C2', '导出按钮与进度')], '2026-11-12T10:04:30.000Z') },
  { id: 'q-close-closed', title: '旧版需求列表布局', at: '2026-11-12T10:03:00.000Z', state: 'closed',
    body: '旧版需求列表布局\n\n已被新版列表替换，关闭。',
    alignment: alignment([slice('C1', '移除旧布局'), slice('C2', '迁移旧数据视图')], '2026-11-12T10:03:30.000Z') },
  { id: 'q-close-unaligned', title: '为需求列表增加复制链接按钮', at: '2026-11-12T10:02:00.000Z', state: 'open',
    body: '为需求列表增加复制链接按钮\n\n每行提供一个按钮，复制该需求的详情链接。' },
]

/** One dispatched slice Ticket; `ended` absent leaves it live, which is what keeps its requirement 开放. */
const ticket = (issue, sliceId, title, at, ended) => ({
  id: ticketId(issue.id, sliceId), title: `${sliceId} · ${title}`,
  decisionId: hex(`decision-${issue.id}-${sliceId}`),
  mandate: { strength: 'explicit', policyVersion: 'mandate-v3', basis: { via: 'addressed', addressed: 'direct', source: 'local' },
    actor: { source: 'local', id: 'local' }, scope: title },
  channels: [], assignments: [], inputs: [], undelivered: [],
  createdAt: at, updatedAt: ended ? ended.at : at,
  origin: { triggerId: hex(`c1-close-trigger-${issue.id}`), triggerIds: [hex(`c1-close-trigger-${issue.id}`)] },
  plan: { issueId: issue.id, sliceId },
  ...(ended ? { ended } : {}),
})

// Both ways a slice ends count: two Executor results (completed, merged) and one owner stop.
const endedBy = (at, by, outcome) => ({ at, by, outcome })
const tickets = [
  ticket(issues[0], 'C1', '服务端派生 slicesFinished', '2026-11-12T10:06:00.000Z', endedBy('2026-11-12T10:20:00.000Z', 'executor', 'completed')),
  ticket(issues[0], 'C2', '面板显示待关闭', '2026-11-12T10:06:05.000Z', endedBy('2026-11-12T10:22:00.000Z', 'human', 'stopped')),
  ticket(issues[1], 'C1', '导出接口', '2026-11-12T10:07:00.000Z', endedBy('2026-11-12T10:21:00.000Z', 'executor', 'completed')),
  // q-close-live's C2 has no ticket end, so its requirement keeps 开放 in both versions.
  ticket(issues[1], 'C2', '导出按钮与进度', '2026-11-12T10:07:05.000Z'),
  ticket(issues[2], 'C1', '移除旧布局', '2026-11-12T10:08:00.000Z', endedBy('2026-11-12T10:19:00.000Z', 'executor', 'merged')),
  ticket(issues[2], 'C2', '迁移旧数据视图', '2026-11-12T10:08:05.000Z', endedBy('2026-11-12T10:23:00.000Z', 'executor', 'completed')),
]
for (const item of tickets) db.prepare('INSERT OR REPLACE INTO ticket VALUES (?,?)').run(item.id, JSON.stringify(item))

for (const issue of issues) {
  const record = { id: issue.id, title: issue.title, body: issue.body, author: 'local', project: issue.project ?? project.id,
    createdAt: issue.at, updatedAt: issue.at, state: issue.state, ...(issue.alignment ? { alignment: issue.alignment } : {}) }
  put(`local-issue:${issue.id}`, record)
  const threadKey = `local:${issue.id}`
  db.prepare('INSERT OR REPLACE INTO thread VALUES (?,?)').run(threadKey, JSON.stringify({ key: threadKey,
    ref: { source: 'local', id: issue.id }, createdAt: issue.at, subscriptions: tickets.filter(item => item.plan.issueId === issue.id).map(item => item.id),
    correlated: [], pending: [], meta: {}, lastAt: issue.at }))
  const triggerId = hex(`c1-close-trigger-${issue.id}`)
  db.prepare('INSERT OR REPLACE INTO trigger VALUES (?,?,?)').run(triggerId, JSON.stringify({ id: triggerId, source: 'local',
    threads: [{ source: 'local', id: issue.id }], actor: { source: 'local', id: 'local' }, human: true, addressed: 'direct', at: issue.at,
    text: issue.body, channel: { source: 'local', thread: threadKey, address: { issue: issue.id } }, meta: { project: project.id } }), issue.at)
  db.prepare('INSERT OR REPLACE INTO trigger_thread VALUES (?,?,?,?)').run(threadKey, triggerId, issue.at, 1)
}
db.close()
console.log(`seeded ${path}: 1 project, ${issues.length} requirements, ${tickets.length} tickets (${issues[0].id} finished, ${issues[1].id} live)`)
