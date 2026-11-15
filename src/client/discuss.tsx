/** Requirement pages: list the project's requirements in a dialog-opened form, and review the Aligner's proposal. */
import { useEffect, useState, type FormEvent } from 'react'
import { alignmentRounds, currentAlignment, projectRepositories, requirementExecutionMode, type LocalAlignment, type LocalImage,
  type LocalImageInput, type LocalIssue, type LocalIssueView } from '../sources/local-format.ts'
import { requirementImage, usePoll } from './api.ts'
import { Button, DisclosureRow, Icon, InfoTip, Pill, Switch, Tag } from './controls.tsx'
import { SourceDiscussion } from './discussions.tsx'
import { PasteImageField, useImagePaste } from './image-paste.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { RequirementDialog } from './requirement-dialog.tsx'
import { REQUIREMENT_FILTERS, type RequirementFilter } from './route.ts'
import { actorName, errorText, reasonLabel, type T } from './text.ts'
import { MarkdownLite, PageHead, Section, SessionButton, When } from './widgets.tsx'

/** Format a byte count with one decimal in B, KiB or MiB, for the image gallery's captions. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/** One stored requirement image: read its bytes through the same-origin API and show them as a blob URL. */
function RequirementImage({ issueId, image }: { issueId: string; image: LocalImage }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    requirementImage(issueId, image.id).then(blob => {
      // Revoke immediately when the component unmounted while the bytes were in flight.
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }, () => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [issueId, image.id])
  return url ? <img className="dt-requirement-image" src={url} alt={image.name} />
    : <span className="dt-image-placeholder" aria-hidden="true" />
}

/** The stored images of a requirement or of one of its follow-up messages, in submission order, each named with its file. */
function RequirementImages({ issueId, images }: { issueId: string; images?: LocalImage[] }) {
  if (!images?.length) return null
  return <div className="dt-image-gallery">{images.map(image => <figure key={image.id} className="dt-image-card">
    <RequirementImage issueId={issueId} image={image} />
    <figcaption className="dt-image-caption">{image.name} · {formatBytes(image.bytes)}</figcaption>
  </figure>)}</div>
}

/** The images one follow-up message attached, looked up by the Trigger it became; nothing when it attached none. */
const commentImages = (issue: LocalIssue, triggerId: string): LocalImage[] | undefined =>
  issue.commentImages?.find(entry => entry.triggerId === triggerId)?.images

/** A follow-up's own text without the Images block the host appends, since its thumbnails already show what it attached. */
function commentText(text: string, images: LocalImage[] | undefined): string {
  if (!images?.length) return text
  return text.replace(/(?:\n\n)?Images:\n[\s\S]*$/, '')
}

/**
 * The answer box of one waiting Ticket. Its own text and image selection keep each answer's thumbnails with that message,
 * even when the requirement waits on several Tickets at once.
 */
function WaitingAnswerBox({ busy, onSubmit }: { busy: boolean
  onSubmit: (body: { text: string; images: LocalImageInput[] }) => Promise<boolean> }) {
  const { t } = usePanel()
  const paste = useImagePaste()
  const [text, setText] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (busy || (!body && !paste.images.length)) return
    const sent = await onSubmit({ text: body,
      images: paste.images.map(({ name, mediaType, data }) => ({ name, mediaType, data })) })
    if (sent) { setText(''); paste.clear() }
  }
  return <form className="dt-form" onSubmit={event => { void submit(event) }}>
    <PasteImageField state={paste} value={text} onChange={setText} rows={3} maxLength={20000}
      placeholder={t('discuss.answerPlaceholder')} ariaLabel={t('discuss.answerPlaceholder')} />
    <div className="dt-actions"><Button type="submit" variant="primary" size="sm" icon={<Icon name="message" size={14} />}
      disabled={busy || (!text.trim() && !paste.images.length)}>{t('discuss.answerSubmit')}</Button></div>
  </form>
}

// Pending close is the requirement's own state, derived from its slice Tickets; the alignment tag beside it is unchanged.
const stateTag = (t: T, issue: LocalIssueView) => issue.state === 'closed'
  ? <Tag tone="quiet">{t('discuss.closed')}</Tag>
  : issue.slicesFinished ? <Tag tone="info">{t('discuss.pendingClose')}</Tag> : <Tag tone="success">{t('discuss.open')}</Tag>

/** The tag of one alignment round, or the "not aligned" tag of a requirement that has none yet. */
function statusTag(t: T, round: LocalAlignment | undefined) {
  if (!round) return <Tag tone="neutral">{t('discuss.pending')}</Tag>
  if (round.status === 'proposed') return <Tag tone="warning">{t('discuss.proposed')}</Tag>
  if (round.status === 'confirmed') return <Tag tone="success">{t('discuss.confirmed')}</Tag>
  if (round.status === 'superseded') return <Tag tone="neutral">{t('discuss.superseded')}</Tag>
  return <Tag tone="danger">{t('discuss.rejected')}</Tag>
}

/** The summary, task slices and acceptance criteria of one alignment round. */
function AlignmentBody({ round }: { round: LocalAlignment }) {
  const { t } = usePanel()
  return <>
    {round.summary && <MarkdownLite text={round.summary} />}
    {round.slices.length > 0 && <ul className="dt-list">{round.slices.map(slice => <li key={slice.id} className="dt-row">
      <Tag tone="outline">{slice.id}</Tag>
      <div className="dt-row-main">
        <div className="dt-row-title dt-line">{slice.title}</div>
        <div className="dt-row-meta"><Tag tone="neutral">{slice.lane === 'light' ? 'light' : 'full'}</Tag>
          {slice.dependsOn.length > 0 && <span>{t('discuss.dependsOn')}：{slice.dependsOn.join(', ')}</span>}
          {slice.acceptance.length > 0 && <span>{t('discuss.acceptanceCount', { count: slice.acceptance.length })}</span>}
        </div>
      </div>
    </li>)}</ul>}
    {round.acceptance.length > 0 && <div>
      <div className="dt-subhead"><h3 className="dt-section-title">{t('discuss.acceptance')}</h3></div>
      <ul className="dt-list">{round.acceptance.map((item, index) => <li key={index} className="dt-row">
        <span className="dt-count">{index + 1}</span><span>{item}</span></li>)}</ul>
    </div>}
  </>
}

/** When one round was proposed and decided, with the round's status and the reason a person sent it back. */
function AlignmentRoundMeta({ round, tag = false }: { round: LocalAlignment; tag?: boolean }) {
  const { t } = usePanel()
  return <div className="dt-row-meta">{tag && statusTag(t, round)}<When at={round.proposedAt} />
    {round.decidedAt && <When at={round.decidedAt} />}
    {round.reason && <span>{t('discuss.reason')}：{round.reason}</span>}</div>
}

/**
 * One earlier round of an alignment: collapsed by default, so the page leads with the current round, while its status,
 * time and rejection reason stay readable; expanding it shows the summary, slices and acceptance criteria of that round.
 */
function EarlierAlignmentRound({ round, ordinal }: { round: LocalAlignment; ordinal: number }) {
  const { t } = usePanel()
  const [open, setOpen] = useState(false)
  return <DisclosureRow open={open} onToggle={() => setOpen(!open)} icon={<Icon name="history" size={14} />}
    title={<span className="dt-round-label">{t('discuss.roundLabel', { round: ordinal })}</span>}
    collapsedContent={<span className="dt-round-note">{statusTag(t, round)}<When at={round.decidedAt ?? round.proposedAt} />
      {round.reason && <span>{t('discuss.reason')}：{round.reason}</span>}</span>}>
    <div className="dt-disclosure-body"><AlignmentBody round={round} /><AlignmentRoundMeta round={round} tag /></div>
  </DisclosureRow>
}

/** The execution mode a requirement's slice Tickets run under: the person's choice, or native when they made none. */
const executionLabel = (t: T, issue: LocalIssue) => t(requirementExecutionMode(issue) === 'feature-exec'
  ? 'discuss.executionFeatureExec' : 'discuss.executionNative')

/** The requirement's execution mode as a Tag, on every list row and, once fixed by dispatch, on the detail. */
const executionTag = (t: T, issue: LocalIssue) =>
  <Tag tone={requirementExecutionMode(issue) === 'feature-exec' ? 'info' : 'neutral'}>{executionLabel(t, issue)}</Tag>

/** The processing bucket of one requirement: closed wins, then a confirmed open alignment, then everything else open. */
const requirementBucket = (issue: LocalIssue): Exclude<RequirementFilter, 'all'> =>
  issue.state === 'closed' ? 'closed'
    : currentAlignment(issue)?.status === 'confirmed' ? 'confirmed' : 'pending'

/** Requirement list of the current project, newest first and filtered by its processing status; a row opens the detail. */
export function RequirementList({ filter }: { filter: RequirementFilter }) {
  const { t, call, navigate, project } = usePanel()
  const { projects } = usePanelData()
  const active = projects.find(item => item.id === project) ?? projects[0]
  const { data, error } = usePoll(async () => active
    ? call('GET local/issues', { query: { project: active.id } })
    : { issues: [] }, [call, active?.id])
  const issues = data?.issues ?? []
  // Every bucket keeps the host's newest-first order: filtering only hides rows, it never reorders them.
  const shown = issues.filter(issue => filter === 'all' || requirementBucket(issue) === filter)
  const show = (value: RequirementFilter) => navigate(value === 'pending'
    ? { page: 'requirements' } : { page: 'requirements', query: { filter: value } }, true)
  const open = (id: string) => filter === 'pending' ? navigate({ page: 'requirements', id })
    : navigate({ page: 'requirements', id, query: { filter } })
  // Creating a requirement is a dialog over the list, so the list stays visible underneath and one project's form never
  // becomes a whole page of its own.
  const [creating, setCreating] = useState(false)
  return <>
    <PageHead back={false} title={active ? active.name : t('discuss.requirements')}>
      <span className="dt-hint">{t('discuss.listSubtitle')}</span>
      {active && <span className="dt-mono">{projectRepositories(active)}</span>}
      {active?.bot && <span className="dt-mono">{t('discuss.projectBotAccount', { account: active.bot })}</span>}
      {active?.missingChain && <span className="dt-error dt-project-missing-chain">{t('discuss.projectChainMissing',
        { chain: active.missingChain })}</span>}
      {active?.worktreeRoot && <span className="dt-mono">{active.worktreeRoot}</span>}
      {active?.prepare && <span className="dt-mono" title={active.prepare}>{t('discuss.projectPrepareSet')}</span>}
      {!!active?.blockedCommands?.length && <span className="dt-mono">{t('discuss.projectBlockedCommandsValue',
        { commands: active.blockedCommands.join(' ') })}</span>}
      {active && <Button variant="outline" size="sm" className="dt-project-edit" icon={<Icon name="settings" size={14} />}
        onClick={() => navigate({ page: 'requirements', edit: active.id })}>{t('discuss.editProject')}</Button>}
    </PageHead>
    <div className="dt-column">
      {!active && <p className="dt-hint">{t('discuss.noProjects')}</p>}
      {error && <p className="dt-error" role="alert">{error.message}</p>}
      {active && <>
        <div className="dt-filters">
          {REQUIREMENT_FILTERS.map(value => <Pill key={value} active={filter === value}
            onClick={() => show(value)}>{t(`requirementFilter.${value}`)}</Pill>)}
        </div>
        <Section title={t('discuss.requirements')} count={shown.length}
          action={<Button variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
            onClick={() => setCreating(true)}>{t('discuss.new')}</Button>}>
          {data && issues.length === 0 && <p className="dt-hint">{t('discuss.empty')}</p>}
          {data && issues.length > 0 && shown.length === 0 && <p className="dt-hint">{t('discuss.emptyFilter')}</p>}
          <ul className="dt-list dt-cards">{shown.map(issue => {
            const rounds = alignmentRounds(issue)
            const current = rounds.at(-1)
            return <li key={issue.id} className="dt-row">
              <Icon name="message" size={14} />
              <div className="dt-row-main">
                <div className="dt-row-title dt-line"><button type="button" className="dt-textlink"
                  onClick={() => open(issue.id)}>{issue.title}</button></div>
                <div className="dt-row-meta">{stateTag(t, issue)}{statusTag(t, current)}{executionTag(t, issue)}
                  <When at={issue.createdAt} />
                  <span>{t('discuss.slicesCount', { count: current?.slices.length ?? 0 })}</span>
                  {/* The round count tells a reviewer how many alignment proposals this requirement went through. */}
                  {rounds.length > 0 && <span>{t('discuss.roundsCount', { count: rounds.length })}</span>}
                  {!!issue.images?.length && <span>{t('discuss.imageCount', { count: issue.images.length })}</span>}</div>
              </div>
            </li>
          })}</ul>
        </Section>
      </>}
    </div>
    {creating && <RequirementDialog onClose={() => setCreating(false)} />}
  </>
}

/** Requirement detail: the requirement text, its message timeline, linked Tickets, and the read-only Aligner proposal. */
export function RequirementDetail({ id, filter }: { id: string; filter: RequirementFilter }) {
  const { t, call, notify, navigate } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET local/issues/:id', { id }), [id])
  const [comment, setComment] = useState('')
  const commentPaste = useImagePaste()
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  // The linked Ticket whose Ask composer is open, and its draft: one composer at a time, closed by cancel or submit.
  const [asking, setAsking] = useState<string>()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const issue = data?.issue
  /** Run one mutation, reload on success and report a refusal; true tells a form its box may clear itself. */
  const act = async (work: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try { await work(); await reload(); return true } catch (failure) { notify(errorText(failure)); return false } finally { setBusy(false) }
  }
  const commentSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = comment.trim()
    if ((!text && !commentPaste.images.length) || busy) return
    const submitted = await act(async () => {
      await call('POST local/issues/:id/comments', { id, body: { text, ...(commentPaste.images.length ? {
        images: commentPaste.images.map(({ name, mediaType, data }) => ({ name, mediaType, data })),
      } : {}) } })
    })
    if (submitted) { setComment(''); commentPaste.clear() }
  }
  // A question from a Ticket is answered through the same human comment path as the follow-up box: the Engine routes
  // that Trigger to the subscribed Ticket and the answer joins this requirement's message timeline.
  const answerSubmit = (body: { text: string; images: LocalImageInput[] }): Promise<boolean> =>
    act(() => call('POST local/issues/:id/comments', { id, body: { text: body.text,
      ...(body.images.length ? { images: body.images } : {}) } }))
  // A question is about one linked Ticket: the host records it as asked and answers it in the background, and only the
  // requirement record changes, so the page re-reads that record to let the answer appear in the timeline on its poll.
  const ask = async (event: FormEvent, ticketId: string) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    await act(async () => {
      await call('POST local/issues/:id/questions', { id, body: { ticket: ticketId, text } })
      setAsking(undefined)
      setDraft('')
    })
  }
  const retryQuestion = (questionId: string) => act(() => call('POST local/issues/:id/questions/:questionId/retry',
    { id, questionId }))
  const decide = (decision: 'confirm' | 'reject') => act(async () => {
    // The decision names the round this page showed, so a page left open cannot confirm a newer proposal.
    const round = issue && currentAlignment(issue)
    const answer = await call('POST local/issues/:id/alignment/decision', { id, body: { decision,
      ...(round ? { roundId: round.roundId } : {}),
      ...(decision === 'reject' && reason.trim() ? { reason: reason.trim() } : {}) } })
    // Confirming is the authorization to dispatch: the slices became tickets, which the list below shows.
    if (decision === 'confirm') notify(t('discuss.dispatched', { count: answer.tickets.length }))
    setRejecting(false)
    setReason('')
  })
  if (error) return <p className="dt-error" role="alert">{error.message}</p>
  if (!issue) return <p className="dt-hint">{t('loading')}</p>
  // Every round an Aligner proposed, oldest first: the last one is current and earlier ones stay readable below it.
  const rounds = alignmentRounds(issue)
  const current = rounds.at(-1)
  const earlier = rounds.slice(0, -1).reverse()
  // A requirement that already produced Tickets keeps the execution mode they were dispatched under.
  const dispatched = data!.thread.tickets.length > 0
  // Every Ticket parked in the person/answer stage is a question this page must be able to answer, since a local
  // Channel has no external page and the generic comment box alone does not say which Ticket the reply belongs to.
  const waiting = data!.thread.tickets.filter(ticket => ticket.stage === 'person' && ticket.action === 'answer')
  const timeline = data!.thread.timeline
  const replies = data!.replies.filter(reply => reply.status === 'sent')
  // The requirement card above already shows the submitted text, so its original Trigger is left out of the timeline
  // instead of repeating the full description a second time on the page. A requirement with images has their absolute
  // paths appended to that Trigger's text, so the match also accepts the `Images:` block after the same description.
  const original = issue.body || issue.title
  const isOriginal = (text: string) => text === original || (!!(issue.images?.length) && text.startsWith(`${original}\n\nImages:`))
  const skipped = timeline.findIndex(trigger => isOriginal(trigger.text))
  // The questions live on the requirement record, not in the thread's Trigger timeline; they join the message timeline
  // here, dated by when they were asked, so each one takes its place in the same newest-first order.
  const questions = (issue.questions ?? []).map(question => ({ at: question.askedAt, kind: 'question' as const, question }))
  // Newest first: the person keeps the conversation at the top, directly under the follow-up box, so the newest
  // message is the first row and the earliest one falls to the bottom of the list.
  const events = [
    ...timeline.flatMap((trigger, index) => index === skipped ? [] : [{ at: trigger.at, kind: 'trigger' as const, trigger }]),
    ...replies.map(reply => ({ at: reply.sentAt ?? '', kind: 'reply' as const, reply })),
    ...questions,
  ].sort((a, b) => b.at.localeCompare(a.at))
  // A question names its Ticket; a Ticket that left the thread reads as its id instead.
  const ticketLabel = (ticketId: string) => data!.thread.tickets.find(ticket => ticket.id === ticketId)?.title ?? ticketId
  return <>
    <PageHead title={issue.title} back={{ label: t('discuss.back'), onClick: () => navigate(filter === 'pending'
      ? { page: 'requirements' } : { page: 'requirements', query: { filter } }, true) }}>
      <span className="dt-hint">{t('discuss.detail')}</span>{stateTag(t, issue)}{statusTag(t, current)}</PageHead>
    <div className="dt-column dt-form">
      <section className="dt-card">
        <div className="dt-card-head"><span className="dt-card-title">{t('discuss.requirement')}</span></div>
        <div className="dt-row-meta"><span>{t('discuss.author')}：{issue.author}</span><When at={issue.createdAt} />
          <span className="dt-mono">{issue.id}</span>{data.project && <span>{t('discuss.project')}：{data.project.name} · {projectRepositories(data.project)}
            {data.project.worktreeRoot ? ` · ${data.project.worktreeRoot}` : ''}</span>}
          {data.project?.bot && <span className="dt-mono">{t('discuss.projectBotAccount', { account: data.project.bot })}</span>}</div>
        {issue.discussionId && <div className="dt-actions"><SourceDiscussion id={issue.discussionId} /></div>}
        {issue.body && <MarkdownLite text={issue.body} />}
        {!issue.body && <p className="dt-hint">{t('discuss.noBody')}</p>}
        <RequirementImages issueId={issue.id} images={issue.images} />
      </section>

      {/* A waiting Ticket is the page's call to action: the question and its answer box sit above the alignment proposal. */}
      {waiting.map(ticket => <section key={ticket.id} className="dt-card">
        <div className="dt-card-head"><span className="dt-card-title">{t('discuss.waitingAnswer', { title: ticket.title })}</span></div>
        {ticket.attention && <MarkdownLite text={ticket.attention.question} />}
        <WaitingAnswerBox busy={busy} onSubmit={answerSubmit} />
      </section>)}

      <section className="dt-card">
        <div className="dt-card-head"><span className="dt-card-title">{t('discuss.alignment')}</span>{statusTag(t, current)}</div>
        {!current && <p className="dt-hint">{t('discuss.notAligned')}</p>}
        {current && <>
          {/* The current round is always expanded; every earlier round stays collapsed until a person opens it. */}
          <div className="dt-round dt-round-current" data-round={current.roundId}>
            <div className="dt-subhead"><h3 className="dt-section-title">{t('discuss.roundLabel', { round: rounds.length })}</h3>
              <Tag tone="info">{t('discuss.roundCurrent')}</Tag></div>
            <AlignmentBody round={current} />
            <AlignmentRoundMeta round={current} />
            {dispatched
              ? <div className="dt-row-meta">{executionTag(t, issue)}<span>{t('discuss.executionLocked')}</span></div>
              : current.status === 'proposed' && <div className="dt-switch-row">
                <span className="dt-field-head">{t('discuss.executionSwitch')}<InfoTip text={t('discuss.executionHint')} /></span>
                <Switch checked={requirementExecutionMode(issue) === 'feature-exec'} label={t('discuss.executionSwitch')}
                  onChange={next => { void act(() => call('POST local/issues/:id/execution', { id,
                    body: { mode: next ? 'feature-exec' : 'native' } })) }} />
              </div>}
            {/* A decision applies to the current round only, so an older round never offers the buttons. */}
            {current.status === 'proposed' && <div className="dt-actions">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => { void decide('confirm') }}>{t('discuss.confirm')}</Button>
              {!rejecting && <Button variant="outline" size="sm" disabled={busy}
                onClick={() => setRejecting(true)}>{t('discuss.reject')}</Button>}
              {rejecting && <>
                <input className="dt-text-input" value={reason} maxLength={4000} placeholder={t('discuss.rejectReason')}
                  onChange={event => setReason(event.target.value)} />
                <Button variant="outline" size="sm" disabled={busy} onClick={() => { void decide('reject') }}>{t('discuss.reject')}</Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setRejecting(false); setReason('') }}>{t('cancel')}</Button>
              </>}
            </div>}
          </div>
          {earlier.length > 0 && <div className="dt-rounds-history">
            <div className="dt-subhead"><h3 className="dt-section-title">{t('discuss.roundsEarlier')}</h3>
              <span className="dt-count">{earlier.length}</span></div>
            {earlier.map((round, index) => <EarlierAlignmentRound key={round.roundId} round={round}
              ordinal={earlier.length - index} />)}
          </div>}
        </>}
      </section>

      <Section title={t('discuss.timeline')} count={events.length}>
        {/* The follow-up box sits above the list: a submitted message lands at the top, right under the box. */}
        <form className="dt-form dt-timeline-form" onSubmit={event => { void commentSubmit(event) }}>
          <PasteImageField state={commentPaste} value={comment} onChange={setComment} maxLength={20000} rows={3}
            placeholder={t('discuss.commentPlaceholder')} ariaLabel={t('discuss.commentPlaceholder')} />
          <div className="dt-actions"><Button type="submit" variant="outline" size="sm" icon={<Icon name="message" size={14} />}
            disabled={busy || (!comment.trim() && !commentPaste.images.length)}>{t('discuss.comment')}</Button></div>
        </form>
        <ul className="dt-list dt-timeline">{events.map((event, index) => <li key={index}
          className={event.kind === 'question' ? 'dt-row dt-event dt-question' : 'dt-row dt-event'}>
          {event.kind === 'question' ? <div className="dt-row-main">
            <div className="dt-row-meta"><span className="dt-question-ticket">{t('discuss.questionOf',
              { title: ticketLabel(event.question.ticket) })}</span><When at={event.at} />
              {event.question.status === 'asked' && <Tag tone="info">{t('discuss.questionAsked')}</Tag>}
              {event.question.status === 'answered' && <Tag tone="success">{t('discuss.questionAnswered')}</Tag>}
              {event.question.status === 'failed' && <Tag tone="danger">{t('discuss.questionFailed')}</Tag>}</div>
            <MarkdownLite text={event.question.text} />
            {event.question.status === 'answered' && !!event.question.answer && <div className="dt-question-answer">
              <div className="dt-subhead"><h3 className="dt-section-title">{t('discuss.questionAnswer')}</h3></div>
              <MarkdownLite text={event.question.answer} />
            </div>}
            {event.question.status === 'failed' && <div className="dt-question-failure">
              {!!event.question.error && <p className="dt-error" role="alert">{event.question.error}</p>}
              <div className="dt-actions"><Button variant="outline" size="sm" disabled={busy}
                onClick={() => { void retryQuestion(event.question.id) }}>{t('discuss.questionRetry')}</Button></div>
            </div>}
          </div> : <div className="dt-row-main">
            <div className="dt-row-meta">{event.kind === 'trigger' ? actorName(t, event.trigger.actor) : t('discuss.agent')}
              <When at={event.at} />{event.kind === 'reply' && <Tag tone="info">{t('discuss.agent')}</Tag>}</div>
            {event.kind === 'trigger'
              ? <><MarkdownLite text={commentText(event.trigger.text, commentImages(issue, event.trigger.id))} />
                <RequirementImages issueId={issue.id} images={commentImages(issue, event.trigger.id)} /></>
              : <MarkdownLite text={event.reply.text} />}
          </div>}
        </li>)}</ul>
      </Section>

      <Section title={t('discuss.tickets')} count={data!.thread.tickets.length}>
        {data!.thread.tickets.length === 0 && <p className="dt-hint">{t('discuss.noTickets')}</p>}
        <ul className="dt-list">{data!.thread.tickets.map(ticket => <li key={ticket.id} className="dt-row">
          <Icon name="decision" size={14} /><div className="dt-row-main">
            <div className="dt-row-title dt-line"><button type="button" className="dt-textlink"
              onClick={() => navigate({ page: 'execution', id: ticket.id })}>{ticket.title}</button></div>
            {/* Only a Ticket that started its Executor Session can be asked about; the same condition offers Open Session. */}
            {ticket.sessionId && asking === ticket.id && <form className="dt-form dt-question-form"
              onSubmit={event => { void ask(event, ticket.id) }}>
              <textarea className="dt-textarea" value={draft} maxLength={4000} rows={3}
                placeholder={t('discuss.askPlaceholder')} aria-label={t('discuss.askPlaceholder')}
                onChange={event => setDraft(event.target.value)} />
              <div className="dt-actions">
                <Button type="submit" variant="primary" size="sm" icon={<Icon name="message" size={14} />}
                  disabled={busy || !draft.trim()}>{t('discuss.askSubmit')}</Button>
                <Button variant="ghost" size="sm" disabled={busy}
                  onClick={() => { setAsking(undefined); setDraft('') }}>{t('cancel')}</Button>
              </div>
            </form>}
          </div>
          {ticket.sessionId && <div className="dt-row-actions"><SessionButton variant="outline" sessionId={ticket.sessionId} />
            {/* The open composer replaces its own Ask entry, so the row never offers two forms for the same Ticket. */}
            {asking !== ticket.id && <Button variant="outline" size="sm" icon={<Icon name="message" size={14} />}
              onClick={() => { setAsking(ticket.id); setDraft('') }}>{t('discuss.ask')}</Button>}</div>}
        </li>)}</ul>
      </Section>

      {data!.thread.decisions.length > 0 && <Section title={t('discuss.decisions')} count={data!.thread.decisions.length}>
        <ul className="dt-list">{data!.thread.decisions.map(decision => <li key={decision.id} className="dt-row">
          <Tag tone="neutral">{decision.kind}</Tag>
          <div className="dt-row-main"><div className="dt-row-meta"><When at={decision.at} />
            {decision.reason.map((item, index) => <span key={index}>{reasonLabel(t, item.code)}</span>)}</div></div>
        </li>)}</ul>
      </Section>}

      <div className="dt-actions">
        {issue.state === 'open' && <Button variant="ghost" size="sm" disabled={busy}
          onClick={() => { void act(() => call('POST local/issues/:id/close', { id })) }}>{t('discuss.close')}</Button>}
      </div>
    </div>
  </>
}