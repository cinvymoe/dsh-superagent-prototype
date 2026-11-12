/** Type-only management API contract between the web panel and host routes, imported by the panel without bundling host code. */
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PromptConfig, Prompts } from './prompts.ts'
import type { PromptsView, StateView, TicketPageView } from './http.ts'
import type { CheckoutView } from './checkout.ts'
import type { PrepareStatus } from './prepare.ts'
import type { HistoryView } from './settings-history.ts'
import type { OverviewView } from './views/overview.ts'
import type { SettingsView } from './views/settings.ts'
import type { SourceStatusView } from './views/sources.ts'
import type { DecisionListView, SearchView, ThreadDetailView, ThreadListView } from './views/threads.ts'
import type { TicketListView } from './views/tickets.ts'
import type { LocalImageInput, LocalIssueView, LocalProject, LocalQuestion, LocalSlice } from '../sources/local-format.ts'
import type { ExecutionMode } from '../core/model.ts'
import type { Receipt } from './store.ts'

export const TICKET_FILTERS = ['open', 'person', 'working', 'idle', 'ended'] as const
export const THREAD_FILTERS = ['subscribed', 'evaluating', 'recent', 'all'] as const
export type TicketFilter = typeof TICKET_FILTERS[number]
export type ThreadFilter = typeof THREAD_FILTERS[number]
interface Paged { offset?: number; limit?: number }
/** Whether a context update was already injected into the main Session or is still pending delivery. */
type Delivery = 'injected' | 'pending'

export interface Api {
  'GET state': { response: StateView }
  'GET deployment/checkout': { response: CheckoutView }
  'GET deployment/prepare': { response: PrepareStatus }
  'POST deployment/prepare': { response: { merged: boolean; head: string | null; log: string } }
  'GET overview': { response: OverviewView }
  'GET search': { query: { q: string }; response: SearchView }
  'GET sources': { response: SourceStatusView[] }
  'GET settings': { response: SettingsView }
  'POST sources/:id/labels': { response: { added: string[] } }
  'GET threads': { query?: Paged & { filter?: ThreadFilter }; response: ThreadListView }
  'GET threads/:key': { query?: { limit?: number; before?: string; around?: string }; response: ThreadDetailView }
  'POST threads/:key/unsubscribe': { response: { removed: boolean; thread: string; context_delivery: Delivery } }
  'POST triggers/:id/requeue': { response: { queued: boolean } }
  'GET decisions': { query?: Paged & { kind?: string; window?: '24h' }; response: DecisionListView }
  'POST decisions/:id/dismiss': { response: { dismissed: true } }
  'GET tickets': { query?: Paged & { state?: TicketFilter }; response: TicketListView }
  'GET tickets/:id': { response: TicketPageView }
  'GET local/projects': { response: { projects: LocalProject[] } }
  'POST local/projects': { body: { name: string; intakeRepository: string; codeRepository: string; worktreeRoot?: string }; response: { project: LocalProject } }
  'PUT local/projects/:id': { body: { name?: string; intakeRepository?: string; codeRepository?: string; worktreeRoot?: string }; response: { project: LocalProject } }
  // Local requirement responses carry the HTTP view (`LocalIssueView`), whose `slicesFinished` is derived per read.
  'GET local/issues': { query?: { project?: string }; response: { issues: LocalIssueView[] } }
  'POST local/issues': { body: { title?: string; body?: string; project: string; images?: LocalImageInput[] }; response: { issue: LocalIssueView } }
  'GET local/issues/:id': { response: { issue: LocalIssueView; project: LocalProject | null; thread: ThreadDetailView; replies: Receipt[] } }
  'POST local/issues/:id/comments': { body: { text: string }; response: { issue: LocalIssueView } }
  'POST local/issues/:id/alignment': { body: { summary?: string; slices?: LocalSlice[]; acceptance?: string[] }; response: { issue: LocalIssueView } }
  'POST local/issues/:id/alignment/decision': { body: { decision: 'confirm' | 'reject'; reason?: string; roundId?: string }; response: { issue: LocalIssueView; tickets: { id: string; title: string }[] } }
  'POST local/issues/:id/execution': { body: { mode: ExecutionMode }; response: { issue: LocalIssueView } }
  'POST local/issues/:id/close': { response: { issue: LocalIssueView } }
  'POST local/issues/:id/questions': { body: { ticket: string; text: string }; response: { issue: LocalIssueView; question: LocalQuestion } }
  'POST local/issues/:id/questions/:questionId/retry': { response: { issue: LocalIssueView; question: LocalQuestion } }
  'POST tickets/:id/retry': { response: { retried: true } }
  'POST tickets/:id/stop': { response: { stopped: true } }
  'POST executor/pause': { body: { paused: boolean }; response: { paused: boolean } }
  'PUT settings/:block': { body: { value: unknown; revision: number }; response: { revision: number; restarting: boolean } }
  'GET policy/history': { response: HistoryView }
  'POST policy-sync/:id': { response: { policy: unknown } }
  'POST setup/check': { response: { restarting: true } }
  'GET models': { response: ModelCatalog }
  'GET prompts': { query?: { revision?: number; offset?: number }; response: PromptsView }
  'PUT prompts': { body: { config: PromptConfig; baseRevision: number }; response: { revision: number; context_delivery: Delivery } }
  'POST prompts/preview': { body: PromptConfig; response: ReturnType<Prompts['preview']> }
}
type Path<K> = K extends `${string} ${infer P}` ? P : never
type Params<P> = P extends `${string}:${infer Name}/${infer Rest}` ? Record<Name, string> & Params<Rest>
  : P extends `${string}:${infer Name}` ? Record<Name, string> : unknown
export type RouteParams<K extends keyof Api> = Params<Path<K>>
export type ApiRequest<K extends keyof Api> = RouteParams<K> & Omit<Api[K], 'response'>
export type ApiResponse<K extends keyof Api> = Api[K]['response']

/**
 * Same-origin URL of one requirement image. It answers bytes rather than JSON, so the panel renders it as an image
 * source instead of calling it through the typed caller.
 */
export const localImageUrl = (issueId: string, imageId: string): string =>
  `/orchestrator/api/local/issues/${encodeURIComponent(issueId)}/images/${encodeURIComponent(imageId)}`
