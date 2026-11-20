import path from 'node:path'
import type { ImageContent, ImageReadRequest, MediaPorts, MediaReadResult, MediaSource, ResizeOptions } from '../api.d.ts'

const CODECS = { png: 'image/png', mjpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as const

function signatureCodec(ports: MediaPorts, bytes: Buffer): keyof typeof CODECS | undefined {
  const mime = ports.imageMime(bytes)
  return (Object.keys(CODECS) as (keyof typeof CODECS)[]).find(codec => CODECS[codec] === mime)
}

async function decodeImage(ports: MediaPorts, source: MediaSource, cwd: string, resize: ResizeOptions, signal?: AbortSignal, outputCeiling = 16 * 1024 * 1024) {
  const codec = signatureCodec(ports, source.signature)
  if (!codec) return ports.fail('format')
  const common = ['-v', 'error', '-max_alloc', '67108864', '-max_pixels', '16777216', '-threads', '1', '-protocol_whitelist', 'file,pipe']
  const format = codec === 'gif' ? 'gif' : 'image2pipe'
  const probe = await ports.run(source, cwd, 'ffprobe', [...common,
    '-codec_whitelist', codec, '-format_whitelist', format, '-f', format,
    '-show_entries', 'stream=codec_name,width,height', '-of', 'json', '/proc/self/fd/3'], 16 * 1024, signal)
  let stream: { codec_name?: unknown; width?: unknown; height?: unknown } | undefined
  try { stream = JSON.parse(probe.toString('utf8')).streams?.[0] } catch { return ports.fail('decode') }
  if (stream?.codec_name !== codec || !Number.isSafeInteger(stream.width) || !Number.isSafeInteger(stream.height)) return ports.fail('decode')
  const width = stream.width as number, height = stream.height as number
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384 || width * height > 16_777_216) return ports.fail('pixels')
  const maxBytes = Math.min(resize.maxBytes ?? outputCeiling, outputCeiling)
  let targetWidth = Math.min(width, resize.maxWidth ?? width), targetHeight = Math.min(height, resize.maxHeight ?? height)
  // FFmpeg's JPEG qscale decreases as quality increases; dimensions shrink only after a bounded encoding attempt.
  const quality = Math.max(2, Math.min(31, Math.round(2 + (100 - (resize.jpegQuality ?? 80)) * 29 / 99)))
  for (let attempt = 0; attempt < 16; attempt++) {
    try {
      const image = await ports.run(source, cwd, 'ffmpeg', [...common,
        '-nostdin', '-xerror', '-f', format, '-c:v', codec, '-i', '/proc/self/fd/3', '-frames:v', '1', '-threads', '1', '-filter_threads', '1',
        '-vf', `scale=w='min(${targetWidth},iw)':h='min(${targetHeight},ih)':force_original_aspect_ratio=decrease`,
        '-c:v', 'mjpeg', '-q:v', String(quality), '-f', 'image2pipe', 'pipe:1'], maxBytes, signal)
      if (image[0] !== 255 || image[1] !== 216 || image[image.length - 2] !== 255 || image[image.length - 1] !== 217) return ports.fail('decode')
      return { image, width, height }
    } catch (error) {
      if (!resize.maxBytes || !ports.isOutputLimit(error) || targetWidth === 1 && targetHeight === 1) throw error
      targetWidth = Math.max(1, Math.floor(targetWidth / 2)); targetHeight = Math.max(1, Math.floor(targetHeight / 2))
    }
  }
  return ports.fail('output')
}

export async function resizeInlineImage(ports: MediaPorts, image: ImageContent, source: MediaSource, resize: ResizeOptions, cwd: string, signal?: AbortSignal): Promise<ImageContent> {
  const codec = signatureCodec(ports, source.signature)
  if (!codec || CODECS[codec] !== ports.canonicalImageMime(image.mimeType)) return ports.fail('format')
  const decoded = await decodeImage(ports, source, cwd, resize, signal)
  return { ...image, mimeType: 'image/jpeg', data: decoded.image.toString('base64') }
}

export async function readImage(ports: MediaPorts, request: ImageReadRequest, source: MediaSource): Promise<MediaReadResult> {
  const codec = signatureCodec(ports, source.signature)
  const extension = request.absolutePath.toLowerCase().split('.').pop()
  if (!codec || !({ png: ['png'], mjpeg: ['jpg', 'jpeg'], webp: ['webp'], gif: ['gif'] }[codec]).includes(extension ?? '')) return ports.fail('format')
  const { image, width, height } = await decodeImage(ports, source, request.workspaceRoot,
    { maxWidth: 1600, maxHeight: 1600, jpegQuality: 97 }, request.abortSignal, 3 * 1024 * 1024)
  return {
    output: `Read image ${JSON.stringify(path.relative(request.workspaceRoot, request.absolutePath))}: ${width}×${height} (${CODECS[codec]}). Source SHA-256: ${source.hash}. Attached a decoded JPEG frame, scaled down to at most 1600 pixels per side.${codec === 'gif' ? ' Only the first animation frame is included.' : ''}`,
    images: [{ type: 'image', mimeType: 'image/jpeg', data: image.toString('base64') }],
    metadata: { media: { kind: 'image', sourceHash: source.hash, sourceBytes: source.bytes, mimeType: CODECS[codec], width, height, frames: 1 } },
  }
}
