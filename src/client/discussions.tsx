/** The discussion pages of the current project: start a discussion, list them, and read one before creating a requirement. */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Receipt } from '../app/store.ts'
import { projectRepositories, type LocalDiscussion } from '../sources/local-format.ts'
import { usePoll, type ThreadPageView, type TriggerRow } from './api.ts'
import { Button, Icon, Tag } from './controls.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { actorName, errorText, type T } from './text.ts'
import { MarkdownLite, PageHead, Section, When } from './widgets.tsx'

/** The tag of a discussion's own state, apart from whether it already created a requirement. */
const stateTag = (t: T, discussion: LocalDiscussion) => discussion.state === 'closed'
  ? <Tag tone="quiet">{t('discussion.closed')}</Tag> : <Tag tone="success">{t('discussion.open')}</Tag>

/** Whether the discussion already created its one requirement, as the list row and the detail both say. */
const linkTag = (t: T, discussion: LocalDiscussion) => discussion.issueId
  ? <Tag tone="info">{t('discussion.linked')}</Tag> : <Tag tone="neutral">{t('discussion.unlinked')}</Tag>

/** One message of a discussion: a human Trigger, or the agent's sent reply to it. */
type DiscussionEvent = { at: string; kind: 'trigger'; trigger: TriggerRow } | { at: string; kind: 'reply'; reply: Receipt }

/** The messages of a discussion's Thread, newest first, with the original text left to the body card above them. */
function events(discussion: LocalDiscussion, thread: ThreadPageView, replies: Receipt[]): DiscussionEvent[] {
  const original = discussion.body || discussion.title
  const skipped = thread.timeline.findIndex(trigger => trigger.text === original)
  return [
    ...thread.timeline.flatMap((trigger, index) => index === skipped ? [] : [{ at: trigger.at, kind: 'trigger' as const, trigger }]),
    ...replies.filter(reply => reply.status === 'sent').map(reply => ({ at: reply.sentAt ?? '', kind: 'reply' as const, reply })),
  ].sort((a, b) => b.at.localeCompare(a.at))
}

/** The discussion list of the current project, newest first, with the box that starts a new discussion. */
export function DiscussionList() {
  const { t, call, notify, navigate, project } = usePanel()
  const { projects } = usePanelData()
  const active = projects.find(item => item.id === project) ?? projects[0]
  const { data, error, reload } = usePoll(async () => active
    ? call('GET local/discussions', { query: { project: active.id } })
    : { discussions: [] }, [call, active?.id])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const discussions = data?.discussions ?? []
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text || busy || !active) return
    setBusy(true)
    try {
      const { discussion } = await call('POST local/discussions', { body: { body: text, project: active.id } })
      setBody('')
      await reload()
      navigate({ page: 'discussions', id: discussion.id })
    } catch (failure) { notify(errorText(failure)) } finally { setBusy(false) }
  }
  return <>
    <PageHead back={false} title={active ? active.name : t('discussion.title')}>
      <span className="dt-hint">{t('discussion.listSubtitle')}</span>
      {active && <span className="dt-mono">{projectRepositories(active)}</span>}
    </PageHead>
    <div className="dt-column">
      {!active && <p className="dt-hint">{t('discuss.noProjects')}</p>}
      {error && <p className="dt-error" role="alert">{error.message}</p>}
      {active && <form className="dt-card dt-form" onSubmit={event => { void submit(event) }}>
        <div className="dt-card-head"><span className="dt-card-title">{t('discussion.new')}</span><Tag tone="neutral">{active.name}</Tag></div>
        <textarea className="dt-textarea" value={body} maxLength={20000} rows={3}
          placeholder={t('discussion.newPlaceholder')} aria-label={t('discussion.newPlaceholder')}
          onChange={event => setBody(event.target.value)} />
        <p className="dt-hint">{t('discussion.newHint')}</p>
        <div className="dt-actions"><Button type="submit" variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
          disabled={busy || !body.trim()}>{t('discussion.create')}</Button></div>
      </form>}
      {active && <Section title={t('discussion.title')} count={discussions.length}>
        {data && discussions.length === 0 && <p className="dt-hint">{t('discussion.empty')}</p>}
        <ul className="dt-list dt-cards">{discussions.map(discussion => <li key={discussion.id} className="dt-row">
          <Icon name="message" size={14} />
          <div className="dt-row-main">
            <div className="dt-row-title dt-line"><button type="button" className="dt-textlink"
              onClick={() => navigate({ page: 'discussions', id: discussion.id })}>{discussion.title}</button></div>
            <div className="dt-row-meta">{stateTag(t, discussion)}{linkTag(t, discussion)}<When at={discussion.createdAt} /></div>
          </div>
        </li>)}</ul>
      </Section>}
    </div>
  </>
}

/**
 * One discussion: its body, its message timeline newest first with the follow-up box above it, and the actions that
 * create its requirement, open that requirement, or close the discussion.
 */
export function DiscussionDetail({ id }: { id: string }) {
  const { t, call, notify, navigate } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET local/discussions/:id', { id }), [id])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const discussion = data?.discussion
  const act = async (work: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await work(); await reload() } catch (failure) { notify(errorText(failure)) } finally { setBusy(false) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = comment.trim()
    if (!text || busy) return
    await act(async () => { await call('POST local/discussions/:id/comments', { id, body: { text } }); setComment('') })
  }
  if (error) return <p className="dt-error" role="alert">{error.message}</p>
  if (!discussion) return <p className="dt-hint">{t('loading')}</p>
  const thread = data.thread
  const shown = events(discussion, thread, data.replies)
  return <>
    <PageHead title={discussion.title} back={{ label: t('discussion.back'), onClick: () => navigate({ page: 'discussions' }, true) }}>
      <span className="dt-hint">{t('discussion.detail')}</span>{stateTag(t, discussion)}{linkTag(t, discussion)}
    </PageHead>
    <div className="dt-column dt-form">
      <section className="dt-card">
        <div className="dt-card-head"><span className="dt-card-title">{t('discussion.body')}</span></div>
        <div className="dt-row-meta"><span>{t('discuss.author')}：{discussion.author}</span><When at={discussion.createdAt} />
          <span className="dt-mono">{discussion.id}</span>
          {data.project && <span>{t('discuss.project')}：{data.project.name} · {projectRepositories(data.project)}</span>}</div>
        <MarkdownLite text={discussion.body} />
        {discussion.issueId && <div className="dt-actions">
          <Button variant="outline" size="sm" icon={<Icon name="inbox" size={14} />}
            onClick={() => navigate({ page: 'requirements', id: discussion.issueId! })}>{t('discussion.openIssue')}</Button>
        </div>}
      </section>

      <Section title={t('discussion.messages')} count={shown.length}>
        {/* The box sits above the list, so a submitted message appears first, directly under it. */}
        <form className="dt-form dt-timeline-form" onSubmit={event => { void submit(event) }}>
          <textarea className="dt-textarea" value={comment} maxLength={20000} rows={3}
            placeholder={t('discussion.commentPlaceholder')} aria-label={t('discussion.commentPlaceholder')}
            onChange={event => setComment(event.target.value)} />
          <div className="dt-actions"><Button type="submit" variant="outline" size="sm" icon={<Icon name="message" size={14} />}
            disabled={busy || !comment.trim()}>{t('discussion.comment')}</Button></div>
        </form>
        {shown.length === 0 && <p className="dt-hint">{t('discussion.noMessages')}</p>}
        <ul className="dt-list dt-timeline">{shown.map((event, index) => <li key={index} className="dt-row dt-event">
          <div className="dt-row-main">
            <div className="dt-row-meta">{event.kind === 'trigger' ? actorName(t, event.trigger.actor) : t('discuss.agent')}
              <When at={event.at} />{event.kind === 'reply' && <Tag tone="info">{t('discuss.agent')}</Tag>}</div>
            <MarkdownLite text={event.kind === 'trigger' ? event.trigger.text : event.reply.text} />
          </div>
        </li>)}</ul>
      </Section>

      <div className="dt-actions">
        {discussion.issueId === undefined && <Button variant="primary" size="sm" disabled={busy}
          icon={<Icon name="plus" size={14} />} onClick={() => navigate({ page: 'newRequirement', discussion: discussion.id })}>
          {t('discussion.createIssue')}</Button>}
        {discussion.state === 'open' && <Button variant="ghost" size="sm" disabled={busy}
          onClick={() => { void act(() => call('POST local/discussions/:id/close', { id })) }}>{t('discussion.close')}</Button>}
      </div>
    </div>
  </>
}

/**
 * The discussion a requirement was made from, shown on the requirement detail as the way back to that discussion. It
 * reads the discussion only to name it; a requirement submitted directly renders nothing.
 */
export function SourceDiscussion({ id }: { id: string }) {
  const { t, call, navigate } = usePanel()
  const { data } = usePoll(() => call('GET local/discussions/:id', { id }), [id])
  const discussion = data?.discussion
  if (!discussion) return null
  return <Button variant="outline" size="sm" icon={<Icon name="message" size={14} />}
    onClick={() => navigate({ page: 'discussions', id: discussion.id })}>
    {t('discussion.source', { title: discussion.title })}
  </Button>
}

/** Prefill the New requirement form from a discussion once, without overwriting anything a person has typed. */
export function useDiscussionPrefill(id: string | undefined, fill: (text: string) => void): LocalDiscussion | undefined {
  const { call } = usePanel()
  const { data } = usePoll(async () => id ? call('GET local/discussions/:id', { id }) : undefined, [call, id])
  const filled = useRef<string>()
  const discussion = data?.discussion
  useEffect(() => {
    if (!discussion || filled.current === discussion.id) return
    filled.current = discussion.id
    fill(discussion.body)
    // `fill` only clears or seeds the form's own draft; re-running it for the same discussion would overwrite typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussion])
  return discussion
}
