import type { ContextFields } from './model.js';
import { IMAGE_ESTIMATE_TOKENS } from '../../session/context.js';
import { countRequestText } from './tokenizer.js';
import type { CatalogModel } from '../../core/models/catalog.js';
import type { PromptCountMethod } from './model.js';
import { isRecord } from '../../core/values/record.js';
import { mapProtocolContent, protocolImage } from '../../model-adapters/image/wire.js';

export interface WirePromptEstimate {
  readonly tokens: number;
  readonly method: PromptCountMethod;
  readonly imageCount: number;
  readonly imageAllowanceTokens: number;
}

export class WirePromptUnavailableError extends Error {}

function opaque(block: Record<string, unknown>): boolean {
  return Boolean(block.type === 'redacted_thinking' || block.type === 'reasoning' && block.encrypted_content
    || block.thoughtSignature || block.signature || block.reasoningContent);
}

/** Visit protocol content containers; tool arguments and result JSON remain literal. */
function projectContent(value: unknown, images: { count: number }): unknown {
  return mapProtocolContent(value, block => {
    if (opaque(block) || isRecord(block.reasoning) && opaque(block.reasoning)) throw new WirePromptUnavailableError('Opaque reasoning has no local token measurement.');
    if (!protocolImage(block)) return block;
    images.count++;
    return { type: 'image' };
  });
}

/** Count the endpoint's real projection; binary image encoding is not token text. */
export function estimateWirePrompt(body: Readonly<Record<string, unknown>>, fields: ContextFields | undefined, tokenizer?: CatalogModel['tokenizer']): number {
  return estimateWirePromptDetails(body, fields, tokenizer).tokens;
}

/** Count the endpoint projection while retaining image allowance provenance. */
export function estimateWirePromptDetails(body: Readonly<Record<string, unknown>>, fields: ContextFields | undefined, tokenizer?: CatalogModel['tokenizer']): WirePromptEstimate {
  if (!fields || !Array.isArray(body[fields.conversation])) throw new WirePromptUnavailableError('Endpoint prompt fields are unavailable.');
  const images = { count: 0 };
  const conversation = JSON.stringify((body[fields.conversation] as unknown[]).map(value => projectContent(value, images)));
  const envelope = { ...body, [fields.conversation]: undefined };
  const counted = countRequestText([conversation, JSON.stringify(envelope)], tokenizer);
  // JSON framing is an approximation of protocol overhead, not provider usage.
  return Object.freeze({ tokens: counted.tokens
    + images.count * IMAGE_ESTIMATE_TOKENS, method: counted.method,
    imageCount: images.count, imageAllowanceTokens: images.count * IMAGE_ESTIMATE_TOKENS });
}
