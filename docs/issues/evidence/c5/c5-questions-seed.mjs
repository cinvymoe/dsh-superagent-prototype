/**
 * Seed one C5 question-panel screenshot state database with identical demo data (no server running).
 *
 * Both the Before host (baseline `3a1626cc`, which already carries C4's question records) and the After host render this
 * same state, so the only difference between the two captures is the C5 panel work.
 */
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
  PRIMARY KEY (thread, id));
  CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, value TEXT NOT NULL)`)

const hash = values => createHash('sha256').update(JSON.stringify(values)).digest('hex')
const hex = text => hash([text]).slice(0, 32)
/** The core's `planTicketId`: the same id a real dispatch writes, so the derived view finds this Ticket. */
const ticketId = (issueId, sliceId) => hash(['ticket', 'plan', issueId, sliceId]).slice(0, 32)
const put = (key, value) => db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, JSON.stringify(value))
put('schema', 11)
put('master-id', `orchestrator-${hex('c5-master')}`)

const project = { id: 'p-widgets', name: 'Widgets', chain: 'p-widgets', intakeRepository: 'acme/intake', codeRepository: 'acme/widgets',
  worktreeRoot: '/srv/worktrees', createdAt: '2026-11-12T08:50:00.000Z', updatedAt: '2026-11-12T08:50:00.000Z' }
put(`local-project:${project.id}`, project)

const slice = (id, title, acceptance = []) => ({ id, title, outcome: '', inScope: [], outOfScope: [], acceptance, dependsOn: [], lane: 'full' })
const issue = {
  id: 'q-ask-panel', title: '需求详情支持对关联工单提问', at: '2026-11-12T09:00:00.000Z', state: 'open',
  body: '需求详情支持对关联工单提问\n\n在关联工单的每一行提供提问入口，回答回到需求的消息记录，等待与失败要可见。',
}
const alignment = { status: 'confirmed', summary: '把提问入口放在关联工单行，回答写回需求的消息记录。',
  slices: [slice('C1', '提问记录与后台回答', ['提问立即返回 asked']), slice('C2', '时间线展示问题与回答', ['回答按 Markdown 渲染']),
    slice('C3', 'Aligner 工单复核对齐结论', ['Aligner 工单也提供提问入口'])],
  acceptance: [], proposedAt: '2026-11-12T09:10:00.000Z', decidedAt: '2026-11-12T09:10:30.000Z' }

/** One dispatched slice Ticket; `started` mirrors the Assignment whose `startedAt` the panel reads for the session entry. */
const ticket = (sliceId, title, at, { started = true } = {}) => ({
  id: ticketId(issue.id, sliceId), title: `${sliceId} · ${title}`,
  decisionId: hex(`decision-${issue.id}-${sliceId}`),
  mandate: { strength: 'explicit', policyVersion: 'mandate-v3', basis: { via: 'addressed', addressed: 'direct', source: 'local' },
    actor: { source: 'local', id: 'local' }, scope: title },
  channels: [], inputs: [], undelivered: [], createdAt: at, updatedAt: at,
  origin: { triggerId: hex(`c5-trigger-${sliceId}`), triggerIds: [hex(`c5-trigger-${sliceId}`)] },
  plan: { issueId: issue.id, sliceId },
  assignments: started ? [{ id: hex(`assignment-${sliceId}`), state: 'running', createdAt: at, startedAt: at }] : [],
})
const tickets = [
  ticket('C1', '提问记录与后台回答', '2026-11-12T09:20:00.000Z'),
  ticket('C2', '时间线展示问题与回答', '2026-11-12T09:21:00.000Z'),
  // The Aligner's own Ticket runs too, so its row offers the same entry.
  ticket('C3', 'Aligner 工单复核对齐结论', '2026-11-12T09:22:00.000Z'),
]
for (const item of tickets) db.prepare('INSERT OR REPLACE INTO ticket VALUES (?,?)').run(item.id, JSON.stringify(item))

// Two settled question records: nothing is `asked`, so the background queue has nothing to re-answer on startup.
const question = (id, ticketSlice, text, settled) => ({ id, ticket: ticketId(issue.id, ticketSlice), text,
  askedAt: settled.askedAt, ...settled })
const questions = [
  question('qn-00000000', 'C2', '为什么回答要标在关联工单上？', { status: 'answered', askedAt: '2026-11-12T11:00:00.000Z',
    answeredAt: '2026-11-12T11:01:20.000Z',
    answer: '因为回答来自该工单的会话，只对提问的工单成立：\n\n- **每个问题独立**\n- 回答不会被当成新的工作请求\n\n需要改东西时，还是写一条新的需求或评论。' }),
  question('qn-00000001', 'C1', '这个工单的首轮实现用了哪个模型？', { status: 'failed', askedAt: '2026-11-12T11:05:00.000Z',
    failedAt: '2026-11-12T11:05:40.000Z',
    error: `Ticket ${ticketId(issue.id, 'C1')}'s worker Session has no completed turn to fork at` }),
]

put(`local-issue:${issue.id}`, { id: issue.id, title: issue.title, body: issue.body, author: 'local', project: project.id,
  createdAt: issue.at, updatedAt: '2026-11-12T11:30:00.000Z', state: issue.state, alignment, questions })

const threadKey = `local:${issue.id}`
db.prepare('INSERT OR REPLACE INTO thread VALUES (?,?)').run(threadKey, JSON.stringify({ key: threadKey,
  ref: { source: 'local', id: issue.id }, createdAt: issue.at, subscriptions: tickets.map(item => item.id),
  correlated: [], pending: [], meta: {}, lastAt: '2026-11-12T11:30:00.000Z' }))

/** One human message on the requirement's Thread, as the panel's comment form records it. */
const message = (id, at, text) => {
  const triggerId = hex(`c5-message-${id}`)
  db.prepare('INSERT OR REPLACE INTO trigger VALUES (?,?,?)').run(triggerId, JSON.stringify({ id: triggerId, source: 'local',
    threads: [{ source: 'local', id: issue.id }], actor: { source: 'local', id: 'local' }, human: true, addressed: 'direct', at,
    text, channel: { source: 'local', thread: threadKey, address: { issue: issue.id } }, meta: { project: project.id } }), at)
  db.prepare('INSERT OR REPLACE INTO trigger_thread VALUES (?,?,?,?)').run(threadKey, triggerId, at, 1)
}
// The original requirement Trigger is the first message of the Thread and is left out of the timeline by the detail.
{
  const triggerId = hex('c5-trigger-original')
  db.prepare('INSERT OR REPLACE INTO trigger VALUES (?,?,?)').run(triggerId, JSON.stringify({ id: triggerId, source: 'local',
    threads: [{ source: 'local', id: issue.id }], actor: { source: 'local', id: 'local' }, human: true, addressed: 'direct',
    at: issue.at, text: issue.body, channel: { source: 'local', thread: threadKey, address: { issue: issue.id } },
    meta: { project: project.id } }), issue.at)
  db.prepare('INSERT OR REPLACE INTO trigger_thread VALUES (?,?,?,?)').run(threadKey, triggerId, issue.at, 1)
}
message('c1', '2026-11-12T10:00:00.000Z', '提问入口请放在关联工单行，别再加一页。')
message('c2', '2026-11-12T11:30:00.000Z', '回答里的 Markdown 要能正常显示。')

// One sent agent reply on the same conversation, as the outbox records it.
db.prepare('INSERT OR REPLACE INTO outbox VALUES (?,?)').run('c5-reply-1', JSON.stringify({ id: 'c5-reply-1',
  channel: { source: 'local', thread: threadKey, address: { issue: issue.id } }, text: '收到，提问与回答都会回到这里。',
  kind: 'reply', status: 'sent', sentAt: '2026-11-12T10:30:00.000Z' }))

db.close()
console.log(`seeded ${path}: 1 project, 1 requirement with ${tickets.length} linked Tickets and ${questions.length} question records`)
