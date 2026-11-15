/** The create-requirement dialog: one description box and optional images, opened from the list or a discussion result. */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { projectRepositories, type LocalDiscussion } from '../sources/local-format.ts'
import { usePoll } from './api.ts'
import { Button, Icon, Modal, Tag } from './controls.tsx'
import { PasteImageField, useImagePaste } from './image-paste.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { errorText } from './text.ts'

/**
 * Prefill the requirement dialog from a discussion once, without overwriting anything a person has typed. The latest
 * answered message becomes the description's conclusion, so "send to Issue" carries the result into the requirement.
 */
export function useDiscussionPrefill(id: string | undefined, fill: (text: string) => void): LocalDiscussion | undefined {
  const { call, t } = usePanel()
  const { data } = usePoll(async () => id ? call('GET local/discussions/:id', { id }) : undefined, [call, id])
  const filled = useRef<string>()
  const discussion = data?.discussion
  useEffect(() => {
    if (!discussion || filled.current === discussion.id) return
    filled.current = discussion.id
    const answer = (discussion.answers ?? []).filter(item => item.state === 'answered').sort((a, b) => a.at.localeCompare(b.at)).at(-1)
    const text = answer?.answer ? `${discussion.body}\n\n---\n\n## ${t('discussion.result')}\n\n${answer.answer}` : discussion.body
    fill(text.slice(0, 20000))
    // `fill` only seeds the dialog's own draft; re-running it for the same discussion would overwrite typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussion])
  return discussion
}

/**
 * The create-requirement dialog, shared by the requirement list and a discussion's result panel. A dialog opened from a
 * discussion seeds its box once with that discussion's text and links the new requirement back to it.
 */
export function RequirementDialog({ discussion: discussionId, onClose }: { discussion?: string; onClose: () => void }) {
  const { t, call, notify, navigate, project } = usePanel()
  const { projects } = usePanelData()
  const [description, setDescription] = useState('')
  const source = useDiscussionPrefill(discussionId, setDescription)
  const active = projects.find(item => item.id === (source?.project ?? project)) ?? projects[0]
  const paste = useImagePaste()
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = description.trim()
    if (!text || busy || !active) return
    setBusy(true)
    try {
      const { issue } = await call('POST local/issues', { body: { body: text, project: active.id,
        ...(source ? { discussion: source.id } : {}),
        ...(paste.images.length ? { images: paste.images.map(({ name, mediaType, data }) => ({ name, mediaType, data })) } : {}) } })
      onClose()
      navigate({ page: 'requirements', id: issue.id })
    } catch (failure) { notify(errorText(failure)) } finally { setBusy(false) }
  }
  return <Modal className="dt-requirement-modal" open onClose={onClose} title={t('discuss.new')} closeLabel={t('close')}
    description={source ? t('discussion.prefill', { title: source.title }) : t('discuss.newSubtitle')}>
    {!active && <p className="dt-hint">{t('discuss.noProjects')}</p>}
    {active && <form className="dt-form" onSubmit={event => { void submit(event) }}>
      <div className="dt-row-meta"><Tag tone="neutral">{active.name}</Tag>
        <span className="dt-mono">{projectRepositories(active)}</span></div>
      <PasteImageField state={paste} value={description} onChange={setDescription} disabled={busy}
        maxLength={20000} rows={7} placeholder={t('discuss.descriptionPlaceholder')}
        ariaLabel={t('discuss.descriptionPlaceholder')} note={<p className="dt-hint">{t('discuss.descriptionHint')}</p>} />
      <div className="dt-actions">
        <Button type="submit" variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
          disabled={busy || !description.trim() || !active}>{t('discuss.submit')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
      </div>
    </form>}
  </Modal>
}
