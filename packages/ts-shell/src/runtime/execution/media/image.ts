import { MediaReadError, type MediaReadRequest, type MediaReadResult } from './model.js'
import type { MediaSource } from './source.js'
import { runMediaProcess } from './process.js'
import path from 'node:path'

const CODECS = { png: 'image/png', mjpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as const

function signatureCodec(bytes: Buffer): keyof typeof CODECS | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'mjpeg'
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'gif'
  return undefined
}

export async function readImage(request: MediaReadRequest, source: MediaSource): Promise<MediaReadResult> {
  const codec = signatureCodec(source.signature)
  const extension = request.absolutePath.toLowerCase().split('.').pop()
  if (!codec || !({ png: ['png'], mjpeg: ['jpg', 'jpeg'], webp: ['webp'], gif: ['gif'] }[codec]).includes(extension ?? '')) throw new MediaReadError('format')
  const common = ['-v', 'error', '-max_alloc', '67108864', '-max_pixels', '16777216', '-threads', '1', '-protocol_whitelist', 'file,pipe']
  const format = codec === 'gif' ? 'gif' : 'image2pipe'
  const probe = await runMediaProcess(source, request.workspaceRoot, 'ffprobe', [...common,
    '-codec_whitelist', codec, '-format_whitelist', format, '-f', format,
    '-show_entries', 'stream=codec_name,width,height', '-of', 'json', '/proc/self/fd/3'], 16 * 1024, request.abortSignal)
  let stream: { codec_name?: unknown; width?: unknown; height?: unknown } | undefined
  try { stream = JSON.parse(probe.toString('utf8')).streams?.[0] } catch { throw new MediaReadError('decode') }
  if (stream?.codec_name !== codec || !Number.isSafeInteger(stream.width) || !Number.isSafeInteger(stream.height)) throw new MediaReadError('decode')
  const width = stream.width as number, height = stream.height as number
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384 || width * height > 16_777_216) throw new MediaReadError('pixels')
  const image = await runMediaProcess(source, request.workspaceRoot, 'ffmpeg', [...common,
    '-nostdin', '-xerror', '-f', format, '-c:v', codec, '-i', '/proc/self/fd/3', '-frames:v', '1', '-threads', '1', '-filter_threads', '1',
    '-vf', "scale=w='min(1600,iw)':h='min(1600,ih)':force_original_aspect_ratio=decrease", '-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2pipe', 'pipe:1'], 3 * 1024 * 1024, request.abortSignal)
  if (image[0] !== 255 || image[1] !== 216 || image[image.length - 2] !== 255 || image[image.length - 1] !== 217) throw new MediaReadError('decode')
  return {
    output: `Read image ${JSON.stringify(path.relative(request.workspaceRoot, request.absolutePath))}: ${width}×${height} (${CODECS[codec]}). Source SHA-256: ${source.hash}. Attached a decoded JPEG frame, scaled down to at most 1600 pixels per side.${codec === 'gif' ? ' Only the first animation frame is included.' : ''}`,
    images: [{ type: 'image', mimeType: 'image/jpeg', data: image.toString('base64') }],
    metadata: { media: { kind: 'image', sourceHash: source.hash, sourceBytes: source.bytes, mimeType: CODECS[codec], width, height, frames: 1 } },
  }
}
