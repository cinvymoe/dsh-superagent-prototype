/**
 * The discussion pages of the current project: list discussions and open one, where its exchange reads on the left and
 * its result panel on the right can send that result to a requirement.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Receipt } from '../app/store.ts'
import { discussionAlignments, projectRepositories, type LocalAnswer, type LocalDiscussion, type LocalHandoff,
  type LocalImage } from '../sources/local-format.ts'
import { discussionImage, usePoll } from './api.ts'
import { Button, DisclosureRow, Icon, Modal, Tag } from './controls.tsx'
import { PasteImageField, useImagePaste } from './image-paste.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { RequirementDialog } from './requirement-dialog.tsx'
import { errorText, type T } from './text.ts'
import { Folded, MarkdownLite, PageHead, Section, When } from './widgets.tsx'

/** The tag of a discussion's own state, apart from whether it already created a requirement. */
const stateTag = (t: T, discussion: LocalDiscussion) => discussion.state === 'closed'
  ? <Tag tone="quiet">{t('discussion.closed')}</Tag> : <Tag tone="success">{t('discussion.open')}</Tag>

/** Whether the discussion already created its one requirement, as the list row and the detail both say. */
const linkTag = (t: T, discussion: LocalDiscussion) => discussion.issueId
  ? <Tag tone="info">{t('discussion.linked')}</Tag> : <Tag tone="neutral">{t('discussion.unlinked')}</Tag>

/** The state of the newest answer, so the result panel says whether a conclusion is still on its way. */
function answerTag(t: T, answer: LocalAnswer | undefined) {
  if (!answer) return null
  return answer.state === 'answered' ? <Tag tone="success">{t('discussion.answered')}</Tag>
    : answer.state === 'failed' ? <Tag tone="danger">{t('discussion.answerFailed')}</Tag>
    : <Tag tone="neutral">{answer.state === 'answering' ? t('discussion.answerAnswering') : t('discussion.answerQueued')}</Tag>
}

/** One stored discussion image: read its bytes through the same-origin API and show them as a blob URL. */
function DiscussionImage({ discussionId, image }: { discussionId: string; image: LocalImage }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    discussionImage(discussionId, image.id).then(blob => {
      // Revoke immediately when the component unmounted while the bytes were in flight.
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }, () => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [discussionId, image.id])
  return url ? <img className="dt-requirement-image" src={url} alt={image.name} />
    : <span className="dt-image-placeholder" aria-hidden="true" />
}

/** The images one message attached, in submission order, each named with its file; nothing when it attached none. */
function DiscussionImages({ discussionId, images }: { discussionId: string; images?: LocalImage[] }) {
  if (!images?.length) return null
  return <div className="dt-image-gallery">{images.map(image => <figure key={image.id} className="dt-image-card">
    <DiscussionImage discussionId={discussionId} image={image} />
    <figcaption className="dt-image-caption">{image.name}</figcaption>
  </figure>)}</div>
}

/** One bubble of the chat: a person's message on the right, an Answerer's reply on the left, and its state when pending. */
type ChatMessage = { at: string; side: 'mine' | 'other'; text: string; images?: LocalImage[]
  answerId?: string; state?: LocalAnswer['state'] }

/** One bubble of the chat: its text folds when long, and its images or retry action stay under it. */
function ChatBubble({ text, children }: { text: string; children?: ReactNode }) {
  return <div className="dt-chat-bubble">
    <Folded text={text} />
    {children}
  </div>
}

/** One message of a discussion with its answer, a reply an older discussion already recorded, or a message recorded before answers were. */
type Exchange = { at: string; kind: 'answer'; answer: LocalAnswer } | { at: string; kind: 'reply'; reply: Receipt }
  | { at: string; kind: 'trigger'; text: string }

/**
 * The exchange of a discussion, newest first. A message that predates recorded answers still shows its text from the
 * Thread, and an older discussion's sent replies still show, so nothing written on the Thread disappears.
 */
function exchange(discussion: LocalDiscussion, replies: Receipt[], triggers: { id: string; text: string; at: string }[] = []): Exchange[] {
  const answered = new Set((discussion.answers ?? []).map(answer => answer.triggerId))
  return [
    ...(discussion.answers ?? []).map(answer => ({ at: answer.at, kind: 'answer' as const, answer })),
    ...replies.filter(reply => reply.status === 'sent').map(reply => ({ at: reply.sentAt ?? '', kind: 'reply' as const, reply })),
    ...triggers.filter(trigger => !answered.has(trigger.id) && trigger.text !== discussion.body)
      .map(trigger => ({ at: trigger.at, kind: 'trigger' as const, text: trigger.text })),
  ].sort((a, b) => b.at.localeCompare(a.at))
}

/** The dialog that starts a discussion: one message, posted on the current project's own discussion thread. */
function NewDiscussionDialog({ onClose }: { onClose: () => void }) {
  const { t, call, notify, navigate, project } = usePanel()
  const { projects } = usePanelData()
  const active = projects.find(item => item.id === project) ?? projects[0]
  const [body, setBody] = useState('')
  const paste = useImagePaste()
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if ((!text && !paste.images.length) || busy || !active) return
    setBusy(true)
    try {
      const { discussion } = await call('POST local/discussions', { body: { body: text, project: active.id,
        ...(paste.images.length ? { images: paste.images.map(({ name, mediaType, data }) => ({ name, mediaType, data })) } : {}) } })
      onClose()
      navigate({ page: 'discussions', id: discussion.id })
    } catch (failure) { notify(errorText(failure)) } finally { setBusy(false) }
  }
  return <Modal className="dt-discussion-modal" open onClose={onClose} title={t('discussion.new')} closeLabel={t('close')}
    description={t('discussion.newHint')}>
    {!active && <p className="dt-hint">{t('discuss.noProjects')}</p>}
    {active && <form className="dt-form" onSubmit={event => { void submit(event) }}>
      <PasteImageField state={paste} value={body} onChange={setBody} maxLength={20000} rows={5}
        placeholder={t('discussion.newPlaceholder')} ariaLabel={t('discussion.newPlaceholder')} disabled={busy} />
      <div className="dt-actions">
        <Button type="submit" variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
          disabled={busy || (!body.trim() && !paste.images.length) || !active}>{t('discussion.create')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
      </div>
    </form>}
  </Modal>
}

/** The discussion list of the current project, newest first, with the button that starts a discussion in a dialog. */
export function DiscussionList() {
  const { t, call, navigate, project } = usePanel()
  const { projects } = usePanelData()
  const active = projects.find(item => item.id === project) ?? projects[0]
  const { data, error } = usePoll(async () => active
    ? call('GET local/discussions', { query: { project: active.id } })
    : { discussions: [] }, [call, active?.id])
  const [creating, setCreating] = useState(false)
  const discussions = data?.discussions ?? []
  return <>
    <PageHead back={false} title={active ? active.name : t('discussion.title')}>
      <span className="dt-hint">{t('discussion.listSubtitle')}</span>
      {active && <span className="dt-mono">{projectRepositories(active)}</span>}
    </PageHead>
    <div className="dt-column">
      {!active && <p className="dt-hint">{t('discuss.noProjects')}</p>}
      {error && <p className="dt-error" role="alert">{error.message}</p>}
      {active && <Section title={t('discussion.title')} count={discussions.length}
        action={<Button variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
          onClick={() => setCreating(true)}>{t('discussion.new')}</Button>}>
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
    {creating && <NewDiscussionDialog onClose={() => setCreating(false)} />}
  </>
}

/**
 * One discussion, two columns: the exchange on the left (its body, then the message timeline with the follow-up box above
 * it), and the result panel on the right, which carries the newest conclusion into a requirement, opens the one already
 * made from it, hands the conclusion to the alignment worker, closes the discussion, or deletes one that is about no
 * requirement.
 */
/** One alignment round of a discussion: the conclusion it handed over, its ticket, and where that ticket stands. */
function AlignmentRound({ round, index }: { round: LocalHandoff; index: number }) {
  const { t, call, navigate } = usePanel()
  const { data, error } = usePoll(() => round.ticketId
    ? call('GET tickets/:id', { id: round.ticketId })
    : Promise.resolve(undefined), [round.ticketId])
  const ticket = data && 'id' in data ? data : undefined
  const label = ticket === undefined ? undefined
    : ticket.stage === 'person' && ticket.action ? t(`stage.${ticket.action}`)
    : ticket.stage === 'working' && ticket.action === 'queued' ? t('stage.queued')
    : ticket.stage === 'ended' ? t('ticket.ended')
    : t(`stage.${ticket.stage}`)
  const waiting = ticket?.stage === 'working' && ticket.action === 'queued'
  return <section className="dt-card" data-alignment={round.roundId}>
    <div className="dt-card-head"><span className="dt-card-title">{t('discussion.roundTitle', { round: String(index) })}</span>
      <When at={round.at} /></div>
    <div className="dt-row-meta"><span className="dt-mono">{round.roundId}</span>
      {round.ticketId && <span className="dt-mono">{round.ticketId}</span>}
      {label && <Tag tone={ticket?.state === 'ended' ? 'success' : 'neutral'}>{label}</Tag>}</div>
    <div className="dt-result"><Folded text={round.text} /></div>
    {error && <p className="dt-error" role="alert">{error.message}</p>}
    {waiting && <p className="dt-hint">{t('discussion.alignmentWaiting')}</p>}
    {round.ticketId && <div className="dt-actions">
      <Button variant="outline" size="sm" icon={<Icon name="inbox" size={14} />}
        onClick={() => navigate({ page: 'execution', id: round.ticketId! })}>{t('discussion.openTicket')}</Button>
    </div>}
  </section>
}

/**
 * One discussion, two columns under a tab for the conversation and one per alignment round: the exchange on the left as
 * chat, the message box above it, and every round's conclusion on the right as a card that stays folded until opened. A
 * message written after a round was handed over produces a new conclusion that can be handed over in turn, which starts
 * the next round and its own tab.
 */
export function DiscussionDetail({ id }: { id: string }) {
  const { t, call, notify, navigate } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET local/discussions/:id', { id }), [id])
  const [comment, setComment] = useState('')
  const paste = useImagePaste()
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Every conclusion starts folded, so the right column lists the rounds without their full text.
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  // The tab in view: the discussion itself, or one of its alignment rounds once a conclusion was handed over.
  const [tab, setTab] = useState('discussion')
  const discussion = data?.discussion
  const act = async (work: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await work(); await reload() } catch (failure) { notify(errorText(failure)) } finally { setBusy(false) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = comment.trim()
    if ((!text && !paste.images.length) || busy) return
    await act(async () => {
      await call('POST local/discussions/:id/comments', { id, body: { text,
        ...(paste.images.length ? { images: paste.images.map(({ name, mediaType, data }) => ({ name, mediaType, data })) } : {}) } })
      setComment('')
      paste.clear()
    })
  }
  // The Answerer's open questions: one card, answered in place, sent back as a single message of this discussion.
  const ask = (discussion?.asks ?? []).find(item => item.state === 'open')
  const replies = (open: typeof ask, values: Record<string, string>) => (open?.questions ?? []).map(question =>
    ({ questionId: question.id, text: (values[question.id] ?? '').trim() }))
  const sendAsk = (open: NonNullable<typeof ask>) => act(async () => {
    await call('POST local/discussions/:id/asks/:askId/reply', { id, askId: open.id, body: { answers: replies(open, answers) } })
    setAnswers({})
  })
  const retry = (answerId: string) => act(async () => {
    await call('POST local/discussions/:id/answers/:answerId/retry', { id, answerId })
  })
  // Deleting is offered only while the discussion is about no requirement, so a requirement never loses its source.
  const remove = () => act(async () => {
    setConfirming(false)
    await call('DELETE local/discussions/:id', { id })
    navigate({ page: 'discussions' }, true)
  })
  if (error) return <p className="dt-error" role="alert">{error.message}</p>
  if (!discussion) return <p className="dt-hint">{t('loading')}</p>
/** One bubble of the chat: the person's message on the right, the Answerer's reply on the left. */
  const shown = exchange(discussion, data.replies, data.thread?.timeline ?? [])
  // Chat reads oldest first; the conclusions stay newest first, as every new one is the current conclusion.
  const chat: ChatMessage[] = []
  for (const item of [...shown].reverse()) {
    if (item.kind === 'trigger') chat.push({ at: item.at, side: 'mine', text: item.text })
    else if (item.kind === 'reply') chat.push({ at: item.at, side: 'other', text: item.reply.text })
    else {
      // An answer is one exchange: the person's message and the Answerer's reply, each on its own side.
      chat.push({ at: item.answer.at, side: 'mine', text: item.answer.text,
        ...item.answer.images?.length ? { images: item.answer.images } : {} })
      if (item.answer.answer !== undefined) {
        chat.push({ at: item.answer.answeredAt ?? item.answer.at, side: 'other', text: item.answer.answer })
      } else {
        chat.push({ at: item.answer.at, side: 'other', text: item.answer.failure?.message ?? '',
          answerId: item.answer.id, state: item.answer.state })
      }
    }
  }
  const conclusions = shown.filter((item): item is Exchange & { kind: 'answer' } =>
    item.kind === 'answer' && item.answer.state === 'answered')
  const rounds = discussionAlignments(discussion)
  const handed = new Set(rounds.map(item => item.answerId))
  const latestAnswer = [...(discussion.answers ?? [])].sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  const newest = conclusions[0]
  // Hand over the newest conclusion unless a round already did, so a further message produces the next round.
  const canHand = discussion.issueId !== undefined && newest !== undefined && !handed.has(newest.answer.id)
  const handoff = () => act(async () => {
    await call('POST local/discussions/:id/handoff', { id })
    setTab(`al-${rounds.length + 1}`)
  })
  const round = rounds.find(item => item.roundId === tab)
  return <>
    <PageHead title={discussion.title} back={{ label: t('discussion.back'), onClick: () => navigate({ page: 'discussions' }, true) }}>
      <span className="dt-hint">{t('discussion.detail')}</span>{stateTag(t, discussion)}{linkTag(t, discussion)}
    </PageHead>
    <div className="dt-subtabs" role="tablist" aria-label={t('discussion.tabs')}>
      <button type="button" role="tab" className="dt-subtab" aria-selected={tab === 'discussion'}
        onClick={() => setTab('discussion')}>{t('discussion.tabDiscussion')}</button>
      {rounds.map((item, index) => <button key={item.roundId} type="button" role="tab" className="dt-subtab"
        aria-selected={tab === item.roundId} onClick={() => setTab(item.roundId!)}>
        {t('discussion.tabAlignment', { round: String(index + 1) })}</button>)}
    </div>
    {round
      ? <AlignmentRound round={round} index={rounds.indexOf(round) + 1} />
      : <div className="dt-discussion">
        <div className="dt-discussion-main">
          <section className="dt-card">
            <div className="dt-card-head"><span className="dt-card-title">{t('discussion.body')}</span></div>
            <div className="dt-row-meta"><span>{t('discuss.author')}：{discussion.author}</span><When at={discussion.createdAt} />
              <span className="dt-mono">{discussion.id}</span>
              {data.project && <span>{t('discuss.project')}：{data.project.name} · {projectRepositories(data.project)}</span>}</div>
            <Folded text={discussion.body} />
            <DiscussionImages discussionId={discussion.id} images={discussion.images} />
          </section>

          <Section title={t('discussion.chat')} count={chat.length}>
            {ask && <section className="dt-card dt-ask-card">
              <div className="dt-card-head"><span className="dt-card-title">{t('discussion.ask')}</span>
                <Tag tone="neutral">{t('discussion.askOpen')}</Tag></div>
              <p className="dt-hint">{t('discussion.askHint')}</p>
              <ol className="dt-ask-list">
                {ask.questions.map(question => <li key={question.id} className="dt-ask-item">
                  <p className="dt-ask-question">{question.question}</p>
                  {question.options?.length ? <div className="dt-actions">
                    {question.options.map(option => <Button key={option} size="sm"
                      variant={answers[question.id] === option ? 'primary' : 'outline'}
                      onClick={() => setAnswers(current => ({ ...current, [question.id]: option }))}>{option}</Button>)}
                  </div> : null}
                  <input className="dt-text-input" value={answers[question.id] ?? ''} maxLength={2000}
                    placeholder={question.options?.length ? t('discussion.askOther') : t('discussion.askOption')}
                    aria-label={question.question}
                    onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))} />
                </li>)}
              </ol>
              <div className="dt-actions">
                <Button variant="primary" size="sm" icon={<Icon name="message" size={14} />}
                  disabled={busy || !ask.questions.every(question => (answers[question.id] ?? '').trim())}
                  onClick={() => { void sendAsk(ask) }}>{t('discussion.askSend')}</Button>
              </div>
            </section>}
            {/* The box sits above the chat, so a submitted message appears at its end, directly under it. */}
            <form className="dt-form dt-timeline-form" onSubmit={event => { void submit(event) }}>
              <PasteImageField state={paste} value={comment} onChange={setComment} maxLength={20000} rows={3}
                placeholder={t('discussion.commentPlaceholder')} ariaLabel={t('discussion.commentPlaceholder')} disabled={busy} />
              <div className="dt-actions"><Button type="submit" variant="outline" size="sm" icon={<Icon name="message" size={14} />}
                disabled={busy || (!comment.trim() && !paste.images.length)}>{t('discussion.comment')}</Button></div>
            </form>
            <p className="dt-hint">{t('discussion.eachMessage')}</p>
            {chat.length === 0 && <p className="dt-hint">{t('discussion.unanswered')}</p>}
            <ul className="dt-chat">{chat.map((item, index) => <li key={`${item.side}-${index}`}
              className="dt-chat-message" data-side={item.side}>
              <div className="dt-chat-meta">{item.side === 'mine' ? t('discuss.person') : t('discuss.agent')}<When at={item.at} />
                {item.state === 'failed' ? <Tag tone="danger">{t('discussion.answerFailed')}</Tag>
                  : item.state === 'answered' || (item.side === 'other' && !item.state && item.text) ? <Tag tone="success">{t('discuss.agent')}</Tag>
                  : item.state ? <Tag tone="neutral">{item.state === 'answering' ? t('discussion.answerAnswering') : t('discussion.answerQueued')}</Tag>
                  : null}</div>
              <ChatBubble text={item.text}>
                <DiscussionImages discussionId={discussion.id} images={item.images} />
                {item.state === 'failed' && item.answerId && <div className="dt-actions">
                  <Button variant="ghost" size="sm" disabled={busy}
                    onClick={() => { void retry(item.answerId!) }}>{t('discussion.retry')}</Button></div>}
              </ChatBubble>
            </li>)}</ul>
          </Section>
        </div>

        <aside className="dt-discussion-side">
          <section className="dt-card dt-result-panel">
            <div className="dt-card-head"><span className="dt-card-title">{t('discussion.conclusions')}</span>{answerTag(t, latestAnswer)}</div>
            {conclusions.length === 0 && <p className="dt-hint">{latestAnswer ? t('discussion.resultPending') : t('discussion.resultEmpty')}</p>}
            {conclusions.map((item, index) => <DisclosureRow key={item.answer.id} icon={<Icon name="review" size={14} />}
              open={opened[item.answer.id] ?? false}
              onToggle={() => setOpened(current => ({ ...current, [item.answer.id]: !(current[item.answer.id] ?? false) }))}
              title={t('discussion.roundTitle', { round: String(conclusions.length - index) })}
              collapsedContent={<>{handed.has(item.answer.id) && <Tag tone="info">{t('discussion.handedOff')}</Tag>}
                <When at={item.answer.at} /></>}>
              <div className="dt-result"><MarkdownLite text={item.answer.answer!} /></div>
            </DisclosureRow>)}
            {conclusions.length > 0 && <p className="dt-hint">{t('discussion.resultHint')}</p>}
            <div className="dt-actions dt-result-actions">
              {discussion.issueId
                ? <>
                  <Button variant="primary" size="sm" disabled={busy || !canHand}
                    title={canHand ? t('discussion.handoffHint') : t('discussion.handedOff')}
                    icon={<Icon name="review" size={14} />} onClick={() => { void handoff() }}>{t('discussion.handoff')}</Button>
                  <Button variant="outline" size="sm" icon={<Icon name="inbox" size={14} />}
                    onClick={() => navigate({ page: 'requirements', id: discussion.issueId! })}>{t('discussion.openIssue')}</Button>
                </>
                : <Button variant="primary" size="sm" disabled={busy}
                  icon={<Icon name="plus" size={14} />} onClick={() => setCreating(true)}>{t('discussion.sendIssue')}</Button>}
              {discussion.state === 'open' && <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => { void act(() => call('POST local/discussions/:id/close', { id })) }}>{t('discussion.close')}</Button>}
              {discussion.issueId === undefined && <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => setConfirming(true)}>{t('discussion.delete')}</Button>}
            </div>
            {rounds.length > 0 && <p className="dt-hint">{t('discussion.roundsHint', { count: String(rounds.length) })}</p>}
            {rounds.length > 0 && <p className="dt-hint">
              {t('discussion.handoffTo', { ticket: rounds.at(-1)!.ticketId })}<When at={rounds.at(-1)!.at} /></p>}
          </section>
        </aside>
      </div>}
    {creating && <RequirementDialog discussion={discussion.id} onClose={() => setCreating(false)} />}
    {confirming && <Modal className="dt-discussion-modal" open onClose={() => setConfirming(false)}
      title={t('discussion.delete')} closeLabel={t('close')}
      footer={<>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>{t('cancel')}</Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => { void remove() }}>{t('confirm')}</Button>
      </>}>
      <p>{t('discussion.deleteConfirm', { title: discussion.title })}</p>
    </Modal>}
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