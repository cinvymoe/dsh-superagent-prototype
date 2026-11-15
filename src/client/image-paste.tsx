/**
 * Clipboard-image intake shared by the panel's text boxes: a pasted or dropped image joins the selection under the same
 * limits as the requirement image picker, and an oversized screenshot is downsampled instead of refused.
 */
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode } from 'react'
import { REQUIREMENT_IMAGES } from '../limits.ts'
import { Button, Icon } from './controls.tsx'
import { usePanel } from './provider.tsx'

/** One selected image: the FileReader data URL doubles as the thumbnail and the create request's payload. */
export interface ChosenImage { name: string; mediaType: string; data: string; bytes: number; preview: string }

/** What a text box needs to accept images: the selection, its picker, the paste and drop handlers, and removal. */
export interface ImagePasteState {
  images: ChosenImage[]
  choose: (event: ChangeEvent<HTMLInputElement>) => void
  paste: (event: ClipboardEvent<HTMLElement>) => void
  drop: (event: DragEvent<HTMLElement>) => void
  dragOver: (event: DragEvent<HTMLElement>) => void
  remove: (index: number) => void
}

/** What reading one file produced: an image to attach or, when even downsampling cannot fit it, the name to refuse. */
type Prepared = { image: ChosenImage } | { refused: string }

/** The longest edge a downsampled screenshot is reduced to, and the JPEG quality its bytes are encoded with. */
const LONGEST_EDGE = 2560
const JPEG_QUALITY = 0.9

const supported = (mediaType: string): boolean => (REQUIREMENT_IMAGES.mediaTypes as readonly string[]).includes(mediaType)

/** The extension an unnamed clipboard screenshot takes from its media type. */
function extension(mediaType: string): string {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length)
}

/** A clipboard screenshot often arrives without a file name, so give it one that still reads as a paste. */
const pastedName = (mediaType: string): string => `pasted-${Date.now()}.${extension(mediaType)}`

/** A filename for the JPEG a downsampled image becomes, so the gallery does not call it by its old encoding. */
function jpegName(name: string): string {
  return /\.jpe?g$/i.test(name) ? name : `${name.replace(/\.[^./\\]+$/, '')}.jpg`
}

/** The decoded size of a base64 data URL, which is what the host's byte limit measures. */
function dataUrlBytes(data: string): number {
  const comma = data.indexOf(',')
  const base64 = comma < 0 ? data : data.slice(comma + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor(base64.length * 3 / 4) - padding
}

/** Read a file as its data URL, resolving undefined when the browser cannot read it. */
function readDataUrl(file: Blob): Promise<string | undefined> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(file)
  })
}

/** Redraw an image inside a 2560-longest-edge canvas and re-encode it as JPEG 0.9. */
async function shrink(file: File, name: string): Promise<ChosenImage | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined
  const bitmap = await createImageBitmap(file).catch(() => undefined)
  if (!bitmap) return undefined
  try {
    const scale = Math.min(1, LONGEST_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    if (!data.startsWith('data:image/jpeg;base64,')) return undefined
    return { name: jpegName(name), mediaType: 'image/jpeg', data, bytes: dataUrlBytes(data), preview: data }
  } catch {
    // A browser that cannot decode or draw the image leaves the file unattached rather than failing the whole selection.
    return undefined
  } finally {
    bitmap.close()
  }
}

/** Read one file into the selection, downsampling anything over the byte limit, or report why it cannot join. */
async function prepare(file: File): Promise<Prepared | undefined> {
  const mediaType = file.type.toLowerCase()
  if (!supported(mediaType)) return undefined
  const name = file.name.trim() || pastedName(mediaType)
  if (file.size > REQUIREMENT_IMAGES.bytes) {
    const image = await shrink(file, name)
    if (!image || image.bytes > REQUIREMENT_IMAGES.bytes) return { refused: name }
    return { image }
  }
  const data = await readDataUrl(file)
  return data ? { image: { name, mediaType, data, bytes: file.size, preview: data } } : undefined
}

/** The image files a paste carries, preferring `items` and falling back to `files` where Safari reports only those. */
function clipboardImages(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromItems = Array.from(data.items).filter(item => item.kind === 'file')
    .map(item => item.getAsFile()).filter((file): file is File => !!file && supported(file.type.toLowerCase()))
  if (fromItems.length) return fromItems
  return Array.from(data.files).filter(file => supported(file.type.toLowerCase()))
}

/**
 * The image selection of one text box. Files are read when they arrive, so the thumbnail and the payload share one data
 * URL; the host still receives `{name, mediaType, data}` only when the form submits.
 */
export function useImagePaste(): ImagePasteState {
  const { t, notify } = usePanel()
  const [images, setImages] = useState<ChosenImage[]>([])
  // The ref keeps a second paste that lands while the first is still reading from adding a duplicate or overfilling.
  const current = useRef<ChosenImage[]>([])
  const commit = (next: ChosenImage[]) => { current.current = next; setImages(next) }
  const intake = async (files: readonly File[]) => {
    const prepared = await Promise.all(files.map(file => prepare(file)))
    const refused = prepared.find((item): item is { refused: string } => item !== undefined && 'refused' in item)
    if (refused) { notify(t('discuss.imagesRefuseSize', { name: refused.refused })); return }
    const fresh = prepared.flatMap(item => item && 'image' in item ? [item.image] : [])
    // The same file pasted twice arrives as two File objects, so its name and decoded data identify the duplicate.
    // Different files may legitimately hold identical bytes, so the name stays part of the key.
    const seen = new Set(current.current.map(image => `${image.name}\u0000${image.data}`))
    const unique = fresh.filter(image => {
      const identity = `${image.name}\u0000${image.data}`
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    if (!unique.length) return
    if (current.current.length + unique.length > REQUIREMENT_IMAGES.count) {
      notify(t('discuss.imagesRefuseCount', { count: REQUIREMENT_IMAGES.count }))
      return
    }
    commit([...current.current, ...unique])
  }
  return {
    images,
    choose: event => {
      const files = [...event.target.files ?? []]
      // Clear the input so choosing the same file again still fires a change event.
      event.target.value = ''
      if (!files.length) return
      const refused = files.find(file => !supported(file.type.toLowerCase()))
      if (refused) { notify(t('discuss.imagesRefuseType', { name: refused.name })); return }
      void intake(files)
    },
    paste: event => {
      const files = clipboardImages(event.clipboardData)
      // A paste without an image stays a text paste, so the browser still inserts what the person copied.
      if (!files.length) return
      event.preventDefault()
      void intake(files)
    },
    drop: event => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(file => supported(file.type.toLowerCase()))
      if (!files.length) return
      event.preventDefault()
      void intake(files)
    },
    dragOver: event => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    },
    remove: index => commit(current.current.filter((_, position) => position !== index)),
  }
}

/**
 * A text box with clipboard-image intake: paste or drop an image onto it, or use **Choose images**, and the selection
 * appears below as thumbnails with their names and a remove button. Copy stays in `client/locales.ts`.
 */
export function PasteImageField({ state, value, onChange, placeholder, ariaLabel, rows, maxLength, disabled, hint, note,
  className }: {
  state: ImagePasteState
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel?: string
  rows?: number
  maxLength?: number
  disabled?: boolean
  hint?: string
  /** A line about the text box itself, shown directly under it and above the image controls. */
  note?: ReactNode
  className?: string
}) {
  const { t } = usePanel()
  const picker = useRef<HTMLInputElement>(null)
  return <>
    <textarea className={className ?? 'dt-textarea'} value={value} maxLength={maxLength} rows={rows} disabled={disabled}
      placeholder={placeholder} aria-label={ariaLabel ?? placeholder}
      onChange={event => onChange(event.target.value)}
      onPaste={state.paste} onDrop={state.drop} onDragOver={state.dragOver} />
    {note}
    <div className="dt-image-field">
      <input ref={picker} type="file" className="dt-image-input" multiple
        accept={REQUIREMENT_IMAGES.mediaTypes.join(',')} aria-label={t('discuss.imagesChoose')}
        onChange={state.choose} />
      <Button variant="outline" size="sm" icon={<Icon name="image" size={14} />} disabled={disabled}
        onClick={() => picker.current?.click()}>{t('discuss.imagesChoose')}</Button>
      <p className="dt-hint">{hint ?? t('discuss.imagesHint')}</p>
      {state.images.length > 0 && <ul className="dt-image-choices">{state.images.map((image, index) => <li
        key={`${image.name}-${index}`} className="dt-image-choice">
        <img className="dt-image-thumb" src={image.preview} alt={image.name} />
        <span className="dt-image-name" title={image.name}>{image.name}</span>
        <Button variant="ghost" size="sm" icon={<Icon name="close" size={12} />}
          aria-label={`${t('discuss.imagesRemove')} ${image.name}`}
          onClick={() => state.remove(index)} />
      </li>)}</ul>}
    </div>
  </>
}
