/** Pull request binding, lifecycle observation, and terminal notification helpers. */
import { z } from 'zod'
import { key, liveTicket, type ChannelRef, type Follow, type OutboundMessage, type ThreadFact, type Ticket } from '../core/index.ts'
import type { Deployment } from '../deployment.ts'
import { sameGithubLogin, sameName } from '../infra/text.ts'
import type { SourceContext } from './host.ts'
import { githubPage, SOURCE, threadId, threadNumber, UserSchema } from './github-trigger.ts'

const PullSchema = z.looseObject({
  title: z.string().optional(), state: z.string(), html_url: z.string(), user: UserSchema,
  body: z.string().nullish(), created_at: z.string().optional(),
  merged: z.boolean().optional(), merged_at: z.string().nullish(), closed_at: z.string().nullish(), auto_merge: z.unknown().optional(),
  head: z.looseObject({ sha: z.string(), ref: z.string(), repo: z.looseObject({ full_name: z.string() }).nullish() }),
})
export type Pull = z.infer<typeof PullSchema> & { number: number }
export const readPull = async (ctx: SourceContext, number: number, signal?: AbortSignal,
  deployment = ctx.deployment, repository = deployment.repository): Promise<Pull> =>
  ({ ...await (ctx.commands.withDeployment?.(deployment) ?? ctx.commands).withRepository(repository).withSignal(signal).api(PullSchema, `pulls/${number}`), number })
const pullNumber = (thread: string): number | undefined => thread.startsWith(`${SOURCE}:`) ? threadNumber(thread.slice(SOURCE.length + 1)) : undefined
/** The number of the pull request a report names in the deployment's code repository, when it names one. */
export function reportedPull(report: string | undefined, deployment: Pick<Deployment, 'repository'>): number | undefined {
  if (!report) return undefined
  for (const match of report.matchAll(/https:\/\/github\.com\/([^/\s<>()]+\/[^/\s<>()]+)\/pull\/(\d+)/g)) {
    if (sameName(match[1]!, deployment.repository)) return Number(match[2])
  }
  return undefined
}
/**
 * The Thread ref of a PR: pull requests live in the code repository, whose numbers are independent of the intake
 * repository's, so a deployment that separates them qualifies the ref with the repository name.
 */
export const pullThread = (ctx: SourceContext, number: number, chain?: string): string => {
  const deployment = ctx.deploymentFor(chain)
  return threadId(deployment.intakeRepository !== deployment.repository, deployment.repository, number, chain ?? deployment.chain ?? 'default')
}
export const pullsOf = (ticket: Pick<Ticket, 'follows'>, open = false): number[] =>
  (ticket.follows ?? []).filter(item => !open || !item.closed).flatMap(item => pullNumber(item.thread) ?? [])
export const pullOf = (ticket: Pick<Ticket, 'follows'>): number | undefined => pullsOf(ticket, true).at(-1) ?? pullsOf(ticket).at(-1)
/**
 * The Channels a ticket's result reply is copied to: its own open pull requests, or the PR its latest report names when none
 * is bound yet. A ticket that started from GitHub gets the same words in its intake conversation and its code repository.
 */
export function pullReplyChannels(ticket: Ticket, deployment: Deployment): ChannelRef[] {
  const chain = ticket.execution?.chain
  const threads = new Set<string>()
  const channels: ChannelRef[] = []
  const add = (number: number, thread: string): void => {
    if (threads.has(thread)) return
    threads.add(thread)
    channels.push({ source: SOURCE, thread, address: { number: String(number), url: githubPage(deployment.repository, number, true),
      ...(chain ? { chain } : {}) } })
  }
  const follows = (ticket.follows ?? []).filter(item => pullNumber(item.thread) !== undefined)
  const own = follows.filter(item => item.own && !item.closed)
  for (const follow of own.length ? own : follows.filter(item => !item.closed)) add(pullNumber(follow.thread)!, follow.thread)
  if (!channels.length) {
    const number = reportedPull(ticket.assignments.at(-1)?.report?.summary, deployment)
    if (number !== undefined) add(number, `${SOURCE}:${threadId(deployment.intakeRepository !== deployment.repository, deployment.repository, number, deployment.chain)}`)
  }
  return channels
}
/**
 * The sections of a PR description that explain the change. A ticket's intake conversation receives them, so people who
 * only follow the issue repository still see the problem, the change, and its verification without opening the PR.
 */
function descriptionBody(body: string): string {
  const sections = body.split(/\n+(?=## )/)
  const wanted = sections.filter(section => /^##\s*(?:问题|修改|验证|Problem|Changes|Verification)(?:\s|$)/u.test(section))
  return (wanted.length ? wanted : sections).join('\n\n').trim().replace(/^This is by an automated agent, not a human\.\s*/i, '')
}
/**
 * Builds idempotent notices that copy a pull request's description into the GitHub conversation that opened the ticket,
 * which lives in the intake repository when the deployment separates it from the code repository. The PR Thread itself
 * is skipped: GitHub already shows the description there.
 */
export function pullDescriptionNotices(ticket: Ticket, pr: Pull, deployment: Deployment): OutboundMessage[] {
  const body = pr.body?.trim()
  if (!body) return []
  const thread = `${SOURCE}:${threadId(deployment.intakeRepository !== deployment.repository, deployment.repository,
    pr.number, deployment.chain ?? 'default')}`
  const channels = ticket.channels.filter(channel => channel.source === SOURCE && channel.thread !== thread)
  if (!channels.length) return []
  const title = pr.title ?? `PR #${pr.number}`
  const text = `### PR #${pr.number} 描述同步：${title}（分支 \`${pr.head.ref}\`）\n\nThis is by an automated agent, not a human.\n\n${descriptionBody(body)}`
  return channels.map(channel => ({ id: key('pr-description', String(pr.number), channel.thread ?? ''), channel, text,
    kind: 'notice', ticketId: ticket.id }))
}
/** True when the PR was opened by the agent account from a branch in the configured repository (not a fork). */
export const agentPull = (pr: { user: { login: string }; head?: { repo?: { full_name: string } | null } | null },
  deployment: Pick<Deployment, 'github' | 'repository'>): boolean =>
  sameGithubLogin(pr.user.login, deployment.github.login) && sameName(pr.head?.repo?.full_name ?? '', deployment.repository)
/** True when a branch belongs to the ticket: its last path segment is the ticket's short name, such as `agent/<name>`. */
export const ticketBranch = (ticket: Pick<Ticket, 'execution'>, ref: string): boolean =>
  !!ticket.execution?.name && ref.split('/').at(-1) === ticket.execution.name
const AUTO_MERGE_ON: ThreadFact = { label: { zh: '自动合并', en: 'Auto-merge' }, value: { zh: '已开启', en: 'on' } }

/**
 * Validates and binds an open PR to a ticket when the PR is either the ticket's origin PR or an agent-authored PR on the ticket's branch, enforcing that one PR binds to at most one open ticket.
 * Returns an error message when binding is rejected, or undefined when the PR is bound or when the PR is not open (which is not an error).
 */
export function claimPull(ctx: SourceContext, ticketId: string, pr: Pull): string | undefined {
  const ticket = ctx.tickets.get(ticketId)
  if (!ticket || !liveTicket(ticket)) return 'Ticket ended because its PR was closed'
  const source = ctx.triggers.get(ticket.origin.triggerId)
  const deployment = ctx.deploymentFor(ticket.execution?.chain ?? (source?.meta.chain as string | undefined))
  const started = source?.source === SOURCE && source.meta.isPr === true && source.meta.number === pr.number
  const opened = agentPull(pr, deployment) && ticketBranch(ticket, pr.head.ref)
  if (!started && !opened) {
    const { login } = deployment.github
    return `PR does not belong to this ticket: use the source PR or a PR by ${login} from a branch whose last path segment is DSH_SUPERAGENT_NAME; omit pr_number when no PR exists`
  }
  const owner = ctx.tickets.open().find(item => (item.execution?.chain ?? 'default') === (deployment.chain ?? 'default') && pullsOf(item, true).includes(pr.number))
  if (owner && owner.id !== ticketId) return 'PR already belongs to another active ticket'
  const thread = pullThread(ctx, pr.number, deployment.chain)
  const follow = ticket.follows?.find(item => item.thread === `${SOURCE}:${thread}`)
  if (pr.state === 'open' && (!follow || follow.closed || (opened && !follow.own))) {
    bind(ctx, ticketId, pr, opened)
    for (const message of pullDescriptionNotices(ticket, pr, deployment)) ctx.notify(message)
  }
  return undefined
}
/**
 * Reconciles a polled PR's open/merged/closed state and auto-merge fact with any bound or branch-matching ticket.
 * An open agent PR auto-binds to the single open ticket on its branch unless that ticket already follows another open PR
 * (which only the Executor's report changes).
 * @returns whether the PR has ended.
 */
export async function observePull(ctx: SourceContext, pr: Pull, deployment = ctx.deployment): Promise<boolean> {
  const ended = pr.state === 'closed' || !!pr.merged
  if (ended) closePull(ctx, pr, deployment)
  else {
    const candidates = agentPull(pr, deployment) ? ctx.tickets.open().filter(ticket => (ticket.execution?.chain ?? 'default') === (deployment.chain ?? 'default') && ticketBranch(ticket, pr.head.ref)) : []
    const ticket = candidates.length === 1 ? candidates[0]! : undefined
    // A PR the ticket followed until it closed, and that is open again, is followed again.
    const reopened = ticket?.follows?.some(item => item.thread === `${SOURCE}:${pullThread(ctx, pr.number, deployment.chain)}` && item.closed)
    if (ticket && (reopened || pullsOf(ticket, true).every(number => number === pr.number))) claimPull(ctx, ticket.id, pr)
  }
  ctx.threads.describe(`github:${pullThread(ctx, pr.number, deployment.chain)}`, { facts: { autoMerge: !ended && pr.auto_merge != null ? AUTO_MERGE_ON : null } })
  return ended
}
function bind(ctx: SourceContext, ticketId: string, pr: Pull, own: boolean): void {
  const ticket = ctx.tickets.get(ticketId)
  const thread = pullThread(ctx, pr.number, ticket?.execution?.chain)
  ctx.atomic(() => {
    ctx.tickets.bindThread(ticketId, { source: SOURCE, id: thread }, own)
    ctx.threads.patch(`github:${thread}`, { number: pr.number, isPr: true, url: pr.html_url, prAuthor: pr.user.login })
  })
}
/**
 * Reports a merged or closed PR once to the open tickets that follow it, whose end the core decides.
 * Their subscription to the PR stays so a later human comment there resumes the ticket.
 */
function closePull(ctx: SourceContext, pr: Pull, deployment: Deployment): void {
  if (!ctx.tickets.open().some(ticket => (ticket.execution?.chain ?? 'default') === (deployment.chain ?? 'default') && pullsOf(ticket, true).includes(pr.number))) return
  const at = pr.merged_at ?? pr.closed_at ?? new Date().toISOString()
  ctx.tickets.threadClosed({ source: SOURCE, id: pullThread(ctx, pr.number, deployment.chain) }, pr.merged ? 'merged' : 'closed', at)
}
/**
 * Builds idempotent outbound notices for every conversation that should hear the PR outcome when a ticket ends with its PR
 * (selecting the last-closed PR it opened, else the last one it followed): the PR itself in the code repository, the
 * conversation the ticket started from when that is another GitHub Thread, and its IM channels. Every notice carries the
 * same text, so a deployment that separates the intake and code repositories reports once in each. The notice language
 * follows the ticket's source request: Chinese when it contains Han characters and no kana, otherwise English.
 */
export function pullEndNotices(ticket: Ticket, request: string, repository: string, source?: ChannelRef): OutboundMessage[] {
  const outcome = ticket.ended?.outcome
  const follows = (ticket.follows ?? []).filter(item => item.closed && pullNumber(item.thread) !== undefined)
  const latest = (items: Follow[]) => items.sort((a, b) => b.closed!.at.localeCompare(a.closed!.at))[0]
  const follow = latest(follows.filter(item => item.own)) ?? latest(follows)
  if ((outcome !== 'merged' && outcome !== 'closed') || !follow) return []
  const number = pullNumber(follow.thread)!
  const url = githubPage(repository, number, true)
  const chinese = /\p{Script=Han}/u.test(request) && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(request)
  const text = chinese
    ? outcome === 'merged' ? `[PR #${number}](${url}) 已合并。` : `[PR #${number}](${url}) 已关闭，未合并。`
    : outcome === 'merged' ? `[PR #${number}](${url}) has merged.` : `[PR #${number}](${url}) was closed without merging.`
  // A ticket that started from a GitHub conversation reports the PR's outcome there and on the PR itself, in the code
  // repository: the same text once in each repository when the deployment separates them. IM channels hear it too.
  const chain = ticket.execution?.chain
  const pull: ChannelRef = { source: SOURCE, thread: follow.thread, address: { number: String(number), url, ...(chain ? { chain } : {}) } }
  const github = source?.source === SOURCE ? [pull, ...(source.thread === pull.thread ? [] : [source])] : []
  return [...github, ...ticket.channels.filter(channel => channel.source !== SOURCE)].map(channel => ({
    id: key('pr-terminal', String(number), channel.source, JSON.stringify(channel.address), outcome), channel, text, kind: 'notice', ticketId: ticket.id }))
}
