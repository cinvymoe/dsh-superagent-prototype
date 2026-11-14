/** Built-in local web Source: requirements submitted from the management panel become ordinary Threads and Triggers. */
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Trigger } from '../core/index.ts'
import type { SourceKind } from './kind.ts'
import { LOCAL_ACTOR, LOCAL_SOURCE, type LocalDiscussion, type LocalIssue } from './local-format.ts'

export { LOCAL_ACTOR, LOCAL_SOURCE } from './local-format.ts'
export type { LocalAlignment, LocalDiscussion, LocalIssue, LocalProject, LocalSlice } from './local-format.ts'

/** Thread ID and key used by every message about one local record; its id keeps a requirement (`q-`) and a discussion (`d-`) apart. */
export function localThreadId(recordId: string): string { return recordId }
export function localThreadKey(recordId: string): string { return `${LOCAL_SOURCE}:${recordId}` }

/** What a local Trigger is about: a requirement, or a discussion that has no requirement yet. */
export type LocalRecord = { issue: LocalIssue } | { discussion: LocalDiscussion }

/**
 * Build the Trigger that submits a local record or posts a comment into its Thread. A requirement's Trigger carries its
 * project; a discussion's also names the discussion, so a Session reading the message can tell what it is discussing.
 */
export function localTrigger(input: LocalRecord & { text: string; at: string; id: string }): Trigger {
  const record = 'issue' in input ? input.issue : input.discussion
  const discussion = 'discussion' in input
  return {
    id: input.id,
    source: LOCAL_SOURCE,
    threads: [{ source: LOCAL_SOURCE, id: localThreadId(record.id) }],
    actor: { source: LOCAL_SOURCE, id: record.author || LOCAL_ACTOR },
    human: true,
    addressed: 'direct',
    at: input.at,
    text: input.text,
    channel: { source: LOCAL_SOURCE, thread: localThreadKey(record.id),
      address: discussion ? { discussion: record.id } : { issue: record.id } },
    meta: { ...record.project ? { project: record.project } : {}, ...discussion ? { discussion: record.id } : {} },
  }
}

const LocalConfigSchema = z.object({}).strict()

/** Source kind for the local issue board; its replies are rendered from the durable outbox rather than sent anywhere. */
export const localKind: SourceKind<z.infer<typeof LocalConfigSchema>> = {
  kind: LOCAL_SOURCE,
  title: { zh: '本地 Issue', en: 'Local issues' },
  description: { zh: '在 Web 面板中提交需求并审阅对齐结果。', en: 'Submit requirements and review alignment in the web panel.' },
  schema: LocalConfigSchema,
  fields: [],
  health: ['local'],
  scope: () => ({ listened: true, observed: true, row: 'issues' }),
  channel: {
    allowed: () => true,
    async send() { return 'sent' },
    link: () => ({ url: '', label: { zh: '本地面板', en: 'Local panel' } }),
  },
  policy: {
    schema: z.object({
      allowed: z.array(z.object({ id: z.string(), name: z.string().optional() }))
        .default([{ id: LOCAL_ACTOR, name: '本地用户' }]),
    }),
    fields: [{
      key: 'allowed', type: 'rows', label: { zh: '允许的用户', en: 'Allowed users' },
      columns: [
        { key: 'id', label: { zh: '用户 ID', en: 'User ID' }, type: 'text', pattern: '^[^\\s]+$' },
        { key: 'name', label: { zh: '显示名', en: 'Display name' }, type: 'text', optional: true },
      ],
    }],
    explicit: { zh: '在本地面板提交需求或评论', en: 'Submit a requirement or comment in the local panel' },
    rows: () => [{
      id: 'issues', label: { zh: '本地 Issue', en: 'Local issues' },
      note: { zh: '面板中提交的需求与评论', en: 'Requirements and comments submitted in the panel' },
      cells: { listedUnaddressed: true, unlistedAddressed: true, unlistedUnaddressed: true },
    }],
  },
}

export const name = 'dsh-superagent-local'
export const inject = ['orchestrator']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(localKind), 'local: source kind')
  ctx.effect(() => {
    // The local panel has no transport to poll; report it ready once its kind is installed.
    ctx.orchestrator.context(localKind).report('local', { state: 'ready', detail: 'Local requirement panel' })
    return () => {}
  }, 'local: health')
}
