import { isRecord } from '../../core/values/record.js';
import type { ImageContent } from '../multimodal.js';

/** Recognize protocol image blocks, including malformed blocks that must not disappear from counts. */
export function protocolImage(block: Readonly<Record<string, unknown>>): boolean {
  return block.type === 'image' || block.type === 'image_url' || block.type === 'input_image'
    || isRecord(block.inlineData) && (typeof block.inlineData.mimeType !== 'string' || block.inlineData.mimeType.startsWith('image/'))
    || 'image' in block;
}

/** Extract only inline image encoding; remote resources have no locally verifiable byte/dimension bound. */
export function protocolImageContent(block: Readonly<Record<string, unknown>>): ImageContent | undefined {
  if (block.type === 'image' && isRecord(block.source) && block.source.type === 'base64'
    && typeof block.source.data === 'string' && typeof block.source.media_type === 'string') {
    return { type: 'image', data: block.source.data, mimeType: block.source.media_type };
  }
  const url = block.type === 'input_image' ? block.image_url
    : block.type === 'image_url' && isRecord(block.image_url) ? block.image_url.url : undefined;
  if (typeof url === 'string') {
    const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (match) return { type: 'image', mimeType: match[1]!, data: match[2]! };
  }
  if (isRecord(block.inlineData) && typeof block.inlineData.data === 'string' && typeof block.inlineData.mimeType === 'string') {
    return { type: 'image', data: block.inlineData.data, mimeType: block.inlineData.mimeType };
  }
  if (isRecord(block.image) && typeof block.image.format === 'string' && isRecord(block.image.source) && typeof block.image.source.bytes === 'string') {
    return { type: 'image', data: block.image.source.bytes, mimeType: `image/${block.image.format === 'jpg' ? 'jpeg' : block.image.format}` };
  }
  return undefined;
}

/** Walk content containers only; tool arguments and result JSON remain literal. */
export function mapProtocolContent(value: unknown, visit: (block: Record<string, unknown>) => unknown): unknown {
  if (!isRecord(value)) return value;
  const visited = visit(value);
  if (visited !== value) return visited;
  const projected = { ...value };
  for (const field of ['content', 'parts'] as const) {
    if (Array.isArray(value[field])) projected[field] = value[field].map(block => mapProtocolContent(block, visit));
  }
  if (value.type === 'function_call_output' && Array.isArray(value.output)) {
    projected.output = value.output.map(block => mapProtocolContent(block, visit));
  }
  if (isRecord(value.functionResponse) && Array.isArray(value.functionResponse.parts)) {
    projected.functionResponse = { ...value.functionResponse,
      parts: value.functionResponse.parts.map(block => mapProtocolContent(block, visit)) };
  }
  if (isRecord(value.toolResult) && Array.isArray(value.toolResult.content)) {
    projected.toolResult = { ...value.toolResult,
      content: value.toolResult.content.map(block => mapProtocolContent(block, visit)) };
  }
  return projected;
}
