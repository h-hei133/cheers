import { captureInputLimits, type ModelInputLimits } from '../../core/models/modalities.js';
import { canonicalImageMime, inspectImage, imageExceedsLimits } from '../../model-adapters/image/input.js';
import { mapProtocolContent, protocolImage, protocolImageContent } from '../../model-adapters/image/wire.js';
import { readMedia } from '../../runtime/execution/media/index.js';
import { MediaReadError } from '../../runtime/execution/media/model.js';
import type { ChatMessage } from '../../turn/prompt.js';
import type { MultimodalContentBlock } from '../../model-adapters/multimodal.js';
import type { ContextFields } from '../../context/request/model.js';
import { isRecord } from '../../core/values/record.js';

export class InputLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'InputLimitError'; }
}

export function requestInputLimits(limits: ModelInputLimits | undefined): ModelInputLimits | undefined {
  try { return captureInputLimits(limits); }
  catch { throw new InputLimitError('The selected model has invalid input limits.'); }
}

/** Normalize every outbound image source without replacing retained transcript content. */
export async function normalizeRequestImages<T extends ChatMessage>(messages: readonly T[], vision: boolean,
  limits: ModelInputLimits | undefined, cwd: string, signal?: AbortSignal): Promise<readonly T[]> {
  const resize = limits?.images?.resize;
  if (!vision || !resize) return messages;
  let changed = false;
  const projected: T[] = [];
  for (const message of messages) {
    signal?.throwIfAborted();
    if (!Array.isArray(message.content)) { projected.push(message); continue; }
    let contentChanged = false;
    const content: MultimodalContentBlock[] = [];
    for (const block of message.content) {
      if (block.type !== 'image') { content.push(block); continue; }
      try {
        const captured = Object.freeze({ type: 'image' as const, data: block.data, mimeType: canonicalImageMime(block.mimeType) });
        const before = inspectImage(captured);
        if (!imageExceedsLimits(before, resize)) { content.push(captured); contentChanged = true; continue; }
        const normalized = await readMedia.resize(captured, resize, cwd, signal);
        signal?.throwIfAborted();
        if (imageExceedsLimits(inspectImage(normalized), resize)) throw new InputLimitError('The image could not be reduced to the selected model input limits.');
        content.push(normalized); contentChanged = true;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof InputLimitError) throw error;
        if (error instanceof MediaReadError) throw new InputLimitError(error.message);
        throw new InputLimitError('Image input could not be validated or resized. No request was sent.');
      }
    }
    projected.push(contentChanged ? { ...message, content } : message);
    changed ||= contentChanged;
  }
  return changed ? projected : messages;
}

/** Admit the exact serialized UTF-8 body and protocol message grouping before billing or dispatch. */
export function assertRequestInput(body: string, fields: ContextFields | undefined, limits: ModelInputLimits | undefined): void {
  if (!limits) return;
  if (limits.maxRequestBytes !== undefined && Buffer.byteLength(body, 'utf8') > limits.maxRequestBytes) {
    throw new InputLimitError('The request exceeds the selected model byte limit.');
  }
  if (!limits.images) return;
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new InputLimitError('The request input shape could not be verified.'); }
  if (!fields || !isRecord(parsed) || !Array.isArray(parsed[fields.conversation])) throw new InputLimitError('The endpoint image input shape could not be verified.');
  let total = 0;
  for (const message of parsed[fields.conversation] as unknown[]) {
    let count = 0;
    mapProtocolContent(message, block => {
      if (!protocolImage(block)) return block;
      count++; total++;
      if (limits.images?.resize) {
        const image = protocolImageContent(block);
        if (!image) throw new InputLimitError('The image input has no locally verifiable encoding.');
        try {
          if (imageExceedsLimits(inspectImage(image), limits.images.resize)) throw new InputLimitError('An image exceeds the selected model input limits.');
        } catch (error) {
          if (error instanceof InputLimitError) throw error;
          throw new InputLimitError('Image input could not be validated. No request was sent.');
        }
      }
      return { type: 'image' };
    });
    if (limits.images.maxPerMessage !== undefined && count > limits.images.maxPerMessage) throw new InputLimitError('A message exceeds the selected model image count limit.');
  }
  if (limits.images.maxPerRequest !== undefined && total > limits.images.maxPerRequest) throw new InputLimitError('The request exceeds the selected model image count limit.');
}
