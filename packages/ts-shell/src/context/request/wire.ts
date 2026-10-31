import type { ContextFields } from './model.js';
import { IMAGE_ESTIMATE_TOKENS } from '../../session/context.js';
import { countRequestText } from './tokenizer.js';
import type { CatalogModel } from '../../core/models/catalog.js';
import type { PromptCountMethod } from './model.js';

export interface WirePromptEstimate {
  readonly tokens: number;
  readonly method: PromptCountMethod;
  readonly imageCount: number;
  readonly imageAllowanceTokens: number;
}

/** Count the endpoint's real projection; binary image encoding is not token text. */
export function estimateWirePrompt(body: Readonly<Record<string, unknown>>, fields: ContextFields | undefined, tokenizer?: CatalogModel['tokenizer']): number {
  return estimateWirePromptDetails(body, fields, tokenizer).tokens;
}

/** Count the endpoint projection while retaining image allowance provenance. */
export function estimateWirePromptDetails(body: Readonly<Record<string, unknown>>, fields: ContextFields | undefined, tokenizer?: CatalogModel['tokenizer']): WirePromptEstimate {
  if (!fields || !Array.isArray(body[fields.conversation])) throw new Error('Endpoint prompt fields are unavailable.');
  let images = 0;
  const conversation = JSON.stringify(body[fields.conversation], (_key, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const block = value as Record<string, unknown>;
    if (block.type === 'redacted_thinking' || block.type === 'reasoning' && block.encrypted_content
      || block.thoughtSignature || block.signature || block.reasoningContent) {
      throw new Error('Opaque reasoning has no local token measurement.');
    }
    if (block.type === 'image' && block.source || block.type === 'image_url' && block.image_url
      || block.type === 'input_image' && block.image_url || block.inlineData && typeof block.inlineData === 'object'
      || block.image && typeof block.image === 'object' && 'source' in block.image && 'format' in block.image) {
      images++;
      return { type: 'image' };
    }
    return value;
  });
  const envelope = { ...body, [fields.conversation]: undefined };
  const counted = countRequestText([conversation, JSON.stringify(envelope)], tokenizer);
  // JSON framing is an approximation of protocol overhead, not provider usage.
  return Object.freeze({ tokens: counted.tokens
    + images * IMAGE_ESTIMATE_TOKENS, method: counted.method,
    imageCount: images, imageAllowanceTokens: images * IMAGE_ESTIMATE_TOKENS });
}
