import type { ImageContent } from '../../../model-adapters/multimodal.js'
import { canonicalImageMime, imageMime, inspectImage } from '../../../model-adapters/image/input.js'

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

/** Validate script image payloads through the existing bounded source/header inspector. */
export function validateCodemodeImage(raw: unknown): ImageContent {
  let rawData = ''
  let declaredMime: string | undefined
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (/^https?:\/\//i.test(trimmed)) {
      throw new Error('image() does not accept remote http/https URLs; pass a data URI or { data, mimeType }.')
    }
    const dataMatch = /^data:([^;]+);base64,([\s\S]+)$/i.exec(trimmed)
    if (!dataMatch) throw new Error('image() string input must be a base64 data: URI.')
    declaredMime = dataMatch[1]!
    rawData = dataMatch[2]!
  } else if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>
    if (typeof rec.data === 'string') {
      rawData = rec.data
      declaredMime = typeof rec.mimeType === 'string' ? rec.mimeType : undefined
    } else if (rec.image_url && typeof rec.image_url === 'object' && typeof (rec.image_url as { url?: unknown }).url === 'string') {
      return validateCodemodeImage((rec.image_url as { url: string }).url)
    } else {
      throw new Error('image() object must provide base64 `data` or `image_url.url`.')
    }
  } else {
    throw new Error('image() expects a base64 data URI or { data, mimeType } object.')
  }

  const clean = rawData.replace(/\s+/g, '')
  if (clean.length > 4 * 1024 * 1024) throw new Error('image() exceeds the 4MiB encoded media limit.')
  if (!clean || clean.length % 4 !== 0 || !BASE64_PATTERN.test(clean)) {
    throw new Error('image() payload is not valid base64.')
  }
  const bytes = Buffer.from(clean, 'base64')
  const detected = imageMime(bytes)
  if (!detected) {
    throw new Error('image() requires valid PNG, JPEG, GIF, or WebP binary image bytes.')
  }
  const image = { type: 'image' as const, data: clean, mimeType: (declaredMime ? canonicalImageMime(declaredMime.trim().toLowerCase()) : detected) as ImageContent['mimeType'] }
  inspectImage(image)
  return image
}
