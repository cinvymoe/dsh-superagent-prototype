/** Requirement pages: submit a requirement, list the project's requirements, and review the Aligner's proposal. */
import { useState, type FormEvent } from 'react'
import type { LocalIssue } from '../sources/local-format.ts'
import { usePoll } from './api.ts'
import { Button, Icon, Tag } from './controls.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { actorName, errorText, reasonLabel, type T } from './text.ts'
import { MarkdownLite, PageHead, Section, When } from './widgets.tsx'

const stateTag = (t: T, issue: LocalIssue) => issue.state === 'closed'
  ? <Tag tone="quiet">{t('discuss.closed')}</Tag> : <Tag tone="success">{t('discuss.open')}</Tag>

function statusTag(t: T, issue: LocalIssue) {
  const alignment = issue.alignment
  if (!alignment) return <Tag tone="neutral">{t('discuss.pending')}</Tag>
  if (alignment.status === 'proposed') return <Tag tone="warning">{t('discuss.proposed')}</Tag>
  if (alignment.status === 'confirmed') return <Tag tone="success">{t('discuss.confirmed')}</Tag>
  return <Tag tone="danger">{t('discuss.rejected')}</Tag>
}

/** New-requirement page: the current project's head and one description field; each submission becomes a Thread. */
export function NewRequirementPage() {
  const { t, call, notify, navigate, project } = usePanel()
  const { projects } = usePanelData()
  const active = projects.find(item => item.id === project) ?? projects[0]
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = description.trim()
    if (!text || busy || !active) return
    setBusy(true)
    try {
      const { issue } = await call('POST local/issues', { body: { body: text, project: active.id } })
      setDescription('')
      navigate({ page: 'requirements', id: issue.id })
    } catch (failure) { notify(errorText(failure)) } finally { setBusy(false) }
  }
  return <>
    <PageHead back={false} title={active ? active.name : t('discuss.new')}>
      <span className="dt-hint">{t('discuss.newSubtitle')}</span>
      {active && <span className="dt-mono">{active.repository}</span>}
      {active?.worktreeRoot && <span className="dt-mono">{active.worktreeRoot}</span>}
    </PageHead>
    <div className="dt-column">
      {!active && <p className="dt-hint">{t('discuss.noProjects')}</p>}
      {active && <form className="dt-card dt-form" onSubmit={event => { void submit(event) }}>
        <div className="dt-card-head"><span className="dt-card-title">{t('discuss.new')}</span><Tag tone="neutral">{active.name}</Tag></div>
        <textarea className="dt-textarea" value={description} maxLength={20000} rows={6}
          placeholder={t('discuss.descriptionPlaceholder')} aria-label={t('discuss.descriptionPlaceholder')}
          onChange={event => setDescription(event.target.value)} />
        <p className="dt-hint">{t('discuss.descriptionHint')}</p>
        <div className="dt-actions">
          <Button type="submit" variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
            disabled={busy || !description.trim() || !active}>{t('discuss.submit')}</Button>
        </div>
      </form>}
    </div>
  </>
}

/** Requirement list of the current project, newest first; a row opens the requirement detail. */
export function RequirementList() {
  const { t, call, navigate, project } = usePanel()
  const { projects } = usePanelData()
  const active = projects.find(item => item.id === project) ?? projects[0]
  const { data, error } = usePoll(async () => active
    ? call('GET local/issues', { query: { project: active.id } })
    : { issues: [] }, [call, active?.id])
  const issues = data?.issues ?? []
  return <>
    <PageHead back={false} title={active ? active.name : t('discuss.requirements')}>
      <span className="dt-hint">{t('discuss.listSubtitle')}</span>
      {active && <span className="dt-mono">{active.repository}</span>}
      {active?.worktreeRoot && <span className="dt-mono">{active.worktreeRoot}</span>}
    </PageHead>
    <div className="dt-column">
      {!active && <p className="dt-hint">{t('discuss.noProjects')}</p>}
      {error && <p className="dt-error" role="alert">{error.message}</p>}
      {active && <Section title={t('discuss.requirements')} count={issues.length}>
        {data && issues.length === 0 && <p className="dt-hint">{t('discuss.empty')}</p>}
        <ul className="dt-list dt-cards">{issues.map(issue => <li key={issue.id} className="dt-row">
          <Icon name="message" size={14} />
          <div className="dt-row-main">
            <div className="dt-row-title dt-line"><button type="button" className="dt-textlink"
              onClick={() => navigate({ page: 'requirements', id: issue.id })}>{issue.title}</button></div>
            <div className="dt-row-meta">{stateTag(t, issue)}{statusTag(t, issue)}
              <When at={issue.createdAt} /><span>{t('discuss.slicesCount', { count: issue.alignment?.slices.length ?? 0 })}</span></div>
          </div>
        </li>)}</ul>
      </Section>}
    </div>
  </>
}

/** Requirement detail: the requirement text, its message timeline, linked Tickets, and the read-only Aligner proposal. */
export function RequirementDetail({ id }: { id: string }) {
  const { t, call, notify, navigate } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET local/issues/:id', { id }), [id])
  const [comment, setComment] = useState('')
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const issue = data?.issue
  const act = async (work: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await work(); await reload() } catch (failure) { notify(errorText(failure)) } finally { setBusy(false) }
  }
  const commentSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = comment.trim()
    if (!text) return
    await act(async () => { await call('POST local/issues/:id/comments', { id, body: { text } }); setComment('') })
  }
  const decide = (decision: 'confirm' | 'reject') => act(async () => {
    const answer = await call('POST local/issues/:id/alignment/decision', { id, body: { decision,
      ...(decision === 'reject' && reason.trim() ? { reason: reason.trim() } : {}) } })
    // Confirming is the authorization to dispatch: the slices became tickets, which the list below shows.
    if (decision === 'confirm') notify(t('discuss.dispatched', { count: answer.tickets.length }))
    setRejecting(false)
    setReason('')
  })
  if (error) return <p className="dt-error" role="alert">{error.message}</p>
  if (!issue) return <p className="dt-hint">{t('loading')}</p>
  const alignment = issue.alignment
  const timeline = data!.thread.timeline
  const replies = data!.replies.filter(reply => reply.status === 'sent')
  // The requirement card above already shows the submitted text, so its original Trigger is left out of the timeline
  // instead of repeating the full description a second time on the page.
  const original = issue.body || issue.title
  const skipped = timeline.findIndex(trigger => trigger.text === original)
  const events = [
    ...timeline.flatMap((trigger, index) => index === skipped ? [] : [{ at: trigger.at, kind: 'trigger' as const, trigger }]),
    ...replies.map(reply => ({ at: reply.sentAt ?? '', kind: 'reply' as const, reply })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  return <>
    <PageHead title={issue.title} back={{ label: t('discuss.back'), onClick: () => navigate({ page: 'requirements' }, true) }}>
      <span className="dt-hint">{t('discuss.detail')}</span>{stateTag(t, issue)}{statusTag(t, issue)}</PageHead>
    <div className="dt-column dt-form">
      <section className="dt-card">
        <div className="dt-card-head"><span className="dt-card-title">{t('discuss.requirement')}</span></div>
        <div className="dt-row-meta"><span>{t('discuss.author')}：{issue.author}</span><When at={issue.createdAt} />
          <span className="dt-mono">{issue.id}</span>{data.project && <span>{t('discuss.project')}：{data.project.name} · {data.project.repository}
            {data.project.worktreeRoot ? ` · ${data.project.worktreeRoot}` : ''}</span>}</div>
        {issue.body && <MarkdownLite text={issue.body} />}
        {!issue.body && <p className="dt-hint">{t('discuss.noBody')}</p>}
      </section>

      <section className="dt-card">
        <div className="dt-card-head"><span className="dt-card-title">{t('discuss.alignment')}</span>{statusTag(t, issue)}</div>
        {!alignment && <p className="dt-hint">{t('discuss.notAligned')}</p>}
        {alignment && <>
          {alignment.summary && <MarkdownLite text={alignment.summary} />}
          {alignment.slices.length > 0 && <ul className="dt-list">{alignment.slices.map(slice => <li key={slice.id} className="dt-row">
            <Tag tone="outline">{slice.id}</Tag>
            <div className="dt-row-main">
              <div className="dt-row-title dt-line">{slice.title}</div>
              <div className="dt-row-meta"><Tag tone="neutral">{slice.lane === 'light' ? 'light' : 'full'}</Tag>
                {slice.dependsOn.length > 0 && <span>{t('discuss.dependsOn')}：{slice.dependsOn.join(', ')}</span>}
                {slice.acceptance.length > 0 && <span>{t('discuss.acceptanceCount', { count: slice.acceptance.length })}</span>}
              </div>
            </div>
          </li>)}</ul>}
          {alignment.acceptance.length > 0 && <div>
            <div className="dt-subhead"><h3 className="dt-section-title">{t('discuss.acceptance')}</h3></div>
            <ul className="dt-list">{alignment.acceptance.map((item, index) => <li key={index} className="dt-row">
              <span className="dt-count">{index + 1}</span><span>{item}</span></li>)}</ul>
          </div>}
          <div className="dt-row-meta"><When at={alignment.proposedAt} />
            {alignment.decidedAt && <When at={alignment.decidedAt} />}
            {alignment.reason && <span>{t('discuss.reason')}：{alignment.reason}</span>}</div>
          {alignment.status === 'proposed' && <div className="dt-actions">
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
        </>}
      </section>

      <Section title={t('discuss.timeline')} count={events.length}>
        <ul className="dt-list dt-timeline">{events.map((event, index) => <li key={index} className="dt-row dt-event">
          <div className="dt-row-main">
            <div className="dt-row-meta">{event.kind === 'trigger' ? actorName(t, event.trigger.actor) : t('discuss.agent')}
              <When at={event.at} />{event.kind === 'reply' && <Tag tone="info">{t('discuss.agent')}</Tag>}</div>
            <MarkdownLite text={event.kind === 'trigger' ? event.trigger.text : event.reply.text} />
          </div>
        </li>)}</ul>
        <form className="dt-form" onSubmit={event => { void commentSubmit(event) }}>
          <textarea className="dt-textarea" value={comment} maxLength={20000} rows={3}
            placeholder={t('discuss.commentPlaceholder')} aria-label={t('discuss.commentPlaceholder')}
            onChange={event => setComment(event.target.value)} />
          <div className="dt-actions"><Button type="submit" variant="outline" size="sm" icon={<Icon name="message" size={14} />}
            disabled={busy || !comment.trim()}>{t('discuss.comment')}</Button></div>
        </form>
      </Section>

      <Section title={t('discuss.tickets')} count={data!.thread.tickets.length}>
        {data!.thread.tickets.length === 0 && <p className="dt-hint">{t('discuss.noTickets')}</p>}
        <ul className="dt-list">{data!.thread.tickets.map(ticket => <li key={ticket.id} className="dt-row">
          <Icon name="decision" size={14} /><div className="dt-row-main">
            <div className="dt-row-title dt-line"><button type="button" className="dt-textlink"
              onClick={() => navigate({ page: 'execution', id: ticket.id })}>{ticket.title}</button></div>
          </div>
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