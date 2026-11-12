/** Validation and file storage of the images a local requirement attaches, under `<stateDir>/local-images/<issue id>/`. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { key, UserError } from '../core/index.ts'
import { REQUIREMENT_IMAGES, type RequirementImageMediaType } from '../limits.ts'
import type { LocalImage, LocalImageInput } from '../sources/local-format.ts'

const EXTENSIONS: Record<RequirementImageMediaType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif' }
const DATA_URL = /^data:[^;,]*;base64,/i
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Buffer.from([0xff, 0xd8, 0xff])
const NAME_MAX = 255

/** Directory holding one requirement's images. */
export function requirementImagesDir(stateDir: string, issueId: string): string { return join(stateDir, 'local-images', issueId) }

/** Absolute path of one stored requirement image, named after its id with the extension of its media type. */
export function requirementImagePath(stateDir: string, issueId: string, image: Pick<LocalImage, 'id' | 'mediaType'>): string {
  return join(requirementImagesDir(stateDir, issueId), `${image.id}.${EXTENSIONS[image.mediaType as RequirementImageMediaType] ?? 'bin'}`)
}

/** The media type the bytes themselves declare, or undefined when they are not a PNG, JPEG, WebP or GIF image. */
export function sniffImageMediaType(bytes: Buffer): RequirementImageMediaType | undefined {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1')
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG)) return 'image/png'
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(JPEG)) return 'image/jpeg'
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif'
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

/** Decode the submitted base64, tolerating a `data:<type>;base64,` header but no other characters. */
function decodeBase64(source: string): Buffer | undefined {
  const text = source.trim().replace(DATA_URL, '')
  if (!text || text.length % 4 !== 0 || !BASE64.test(text)) return undefined
  const bytes = Buffer.from(text, 'base64')
  return bytes.length ? bytes : undefined
}

function prepare(issueId: string, input: LocalImageInput, index: number): { image: LocalImage; bytes: Buffer } {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > NAME_MAX) throw new UserError('issueImageName')
  const mediaType = typeof input.mediaType === 'string' ? input.mediaType.trim().toLowerCase() : ''
  if (!(REQUIREMENT_IMAGES.mediaTypes as readonly string[]).includes(mediaType)) throw new UserError('issueImageType', { name })
  const bytes = typeof input.data === 'string' ? decodeBase64(input.data) : undefined
  if (!bytes) throw new UserError('issueImageData', { name })
  if (bytes.length > REQUIREMENT_IMAGES.bytes) throw new UserError('issueImageSize', { name, max: String(REQUIREMENT_IMAGES.bytes) })
  if (sniffImageMediaType(bytes) !== mediaType) throw new UserError('issueImageType', { name })
  return { image: { id: `img-${key('local-image', issueId, String(index), name).slice(0, 8)}`, name, mediaType, bytes: bytes.length }, bytes }
}

/**
 * Validate every submitted image before writing anything, so one bad image refuses the whole requirement, then store
 * the bytes under the requirement's directory. A failed write removes that directory again.
 */
export function storeRequirementImages(stateDir: string, issueId: string, inputs: readonly LocalImageInput[]): LocalImage[] {
  if (inputs.length > REQUIREMENT_IMAGES.count) throw new UserError('issueImageCount', { max: String(REQUIREMENT_IMAGES.count) })
  const prepared = inputs.map((input, index) => prepare(issueId, input, index))
  if (!prepared.length) return []
  const directory = requirementImagesDir(stateDir, issueId)
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    for (const { image, bytes } of prepared) writeFileSync(requirementImagePath(stateDir, issueId, image), bytes, { mode: 0o600 })
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
  return prepared.map(entry => entry.image)
}
