/** The create-requirement dialog: one description box and optional images, opened from the list or a discussion result. */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { REQUIREMENT_IMAGES } from '../limits.ts'
import { projectRepositories, type LocalDiscussion } from '../sources/local-format.ts'
import { usePoll } from './api.ts'
import { Button, Icon, Modal, Tag } from './controls.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { errorText } from './text.ts'

/** One image chosen in the dialog: the FileReader data URL doubles as the thumbnail and the payload. */
interface ChosenImage { name: string; mediaType: string; data: string; bytes: number; preview: string }

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
  const [images, setImages] = useState<ChosenImage[]>([])
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...event.target.files ?? []]
    // Clear the input so choosing the same file again still fires a change event.
    event.target.value = ''
    if (!files.length) return
    const type = files.find(file => !(REQUIREMENT_IMAGES.mediaTypes as readonly string[]).includes(file.type))
    const size = files.find(file => file.size > REQUIREMENT_IMAGES.bytes)
    if (type) { notify(t('discuss.imagesRefuseType', { name: type.name })); return }
    if (size) { notify(t('discuss.imagesRefuseSize', { name: size.name })); return }
    if (images.length + files.length > REQUIREMENT_IMAGES.count) {
      notify(t('discuss.imagesRefuseCount', { count: REQUIREMENT_IMAGES.count }))
      return
    }
    const chosen = await Promise.all(files.map(file => new Promise<ChosenImage | undefined>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve({ name: file.name, mediaType: file.type, data: String(reader.result), bytes: file.size,
        preview: String(reader.result) })
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(file)
    })))
    // A file that failed to read is left out; the others still join the selection.
    setImages(current => [...current, ...chosen.filter((image): image is ChosenImage => image !== undefined)])
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = description.trim()
    if (!text || busy || !active) return
    setBusy(true)
    try {
      const { issue } = await call('POST local/issues', { body: { body: text, project: active.id,
        ...(source ? { discussion: source.id } : {}),
        ...(images.length ? { images: images.map(({ name, mediaType, data }) => ({ name, mediaType, data })) } : {}) } })
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
      <textarea className="dt-textarea" value={description} maxLength={20000} rows={7}
        placeholder={t('discuss.descriptionPlaceholder')} aria-label={t('discuss.descriptionPlaceholder')}
        onChange={event => setDescription(event.target.value)} />
      <p className="dt-hint">{t('discuss.descriptionHint')}</p>
      <div className="dt-image-field">
        <input ref={picker} type="file" className="dt-image-input" multiple
          accept={REQUIREMENT_IMAGES.mediaTypes.join(',')} aria-label={t('discuss.imagesChoose')}
          onChange={event => { void choose(event) }} />
        <Button variant="outline" size="sm" icon={<Icon name="image" size={14} />} disabled={busy}
          onClick={() => picker.current?.click()}>{t('discuss.imagesChoose')}</Button>
        <p className="dt-hint">{t('discuss.imagesHint')}</p>
        {images.length > 0 && <ul className="dt-image-choices">{images.map((image, index) => <li key={`${image.name}-${index}`}
          className="dt-image-choice">
          <img className="dt-image-thumb" src={image.preview} alt={image.name} />
          <span className="dt-image-name" title={image.name}>{image.name}</span>
          <Button variant="ghost" size="sm" icon={<Icon name="close" size={12} />}
            aria-label={`${t('discuss.imagesRemove')} ${image.name}`}
            onClick={() => setImages(current => current.filter((_, position) => position !== index))} />
        </li>)}</ul>}
      </div>
      <div className="dt-actions">
        <Button type="submit" variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
          disabled={busy || !description.trim() || !active}>{t('discuss.submit')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
      </div>
    </form>}
  </Modal>
}
