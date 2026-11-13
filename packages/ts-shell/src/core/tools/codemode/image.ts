import type { ImageContent } from '../../../model-adapters/multimodal.js'

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

function sniffImageMime(bytes: Buffer): ImageContent['mimeType'] | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6) {
    const header = bytes.subarray(0, 6).toString('ascii')
    if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif'
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  return undefined
}

/** Validate an image payload from codemode using base64 syntax and binary magic bytes. */
export function validateCodemodeImage(raw: unknown): ImageContent {
  let rawData = ''
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (/^https?:\/\//i.test(trimmed)) {
      throw new Error('image() does not accept remote http/https URLs; pass a data URI or { data, mimeType }.')
    }
    const dataMatch = /^data:[^;]+;base64,([\s\S]+)$/i.exec(trimmed)
    if (!dataMatch) throw new Error('image() string input must be a base64 data: URI.')
    rawData = dataMatch[1]!
  } else if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>
    if (typeof rec.data === 'string') {
      rawData = rec.data
    } else if (rec.image_url && typeof rec.image_url === 'object' && typeof (rec.image_url as { url?: unknown }).url === 'string') {
      return validateCodemodeImage((rec.image_url as { url: string }).url)
    } else {
      throw new Error('image() object must provide base64 `data` or `image_url.url`.')
    }
  } else {
    throw new Error('image() expects a base64 data URI or { data, mimeType } object.')
  }

  const clean = rawData.replace(/\s+/g, '')
  if (!clean || clean.length % 4 !== 0 || !BASE64_PATTERN.test(clean)) {
    throw new Error('image() payload is not valid base64.')
  }
  const bytes = Buffer.from(clean, 'base64')
  const detected = sniffImageMime(bytes)
  if (!detected) {
    throw new Error('image() requires valid PNG, JPEG, GIF, or WebP binary image bytes.')
  }
  return { type: 'image', data: clean, mimeType: detected }
}
