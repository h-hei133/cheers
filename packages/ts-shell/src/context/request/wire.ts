import type { ContextFields } from './model.js';
import { IMAGE_ESTIMATE_TOKENS } from '../../session/context.js';
import { countRequestText } from './tokenizer.js';
import type { CatalogModel } from '../../core/models/catalog.js';
import type { PromptCountMethod } from './model.js';
import { isRecord } from '../../core/values/record.js';

export interface WirePromptEstimate {
  readonly tokens: number;
  readonly method: PromptCountMethod;
  readonly imageCount: number;
  readonly imageAllowanceTokens: number;
}

function opaque(block: Record<string, unknown>): boolean {
  return Boolean(block.type === 'redacted_thinking' || block.type === 'reasoning' && block.encrypted_content
    || block.thoughtSignature || block.signature || block.reasoningContent);
}

/** Visit protocol content containers; tool arguments and result JSON remain literal. */
function projectContent(value: unknown, images: { count: number }): unknown {
  if (!isRecord(value)) return value;
  if (opaque(value) || isRecord(value.reasoning) && opaque(value.reasoning)) {
    throw new Error('Opaque reasoning has no local token measurement.');
  }
  if (value.type === 'image' && value.source || value.type === 'image_url' && value.image_url
    || value.type === 'input_image' && value.image_url || isRecord(value.inlineData)
    || isRecord(value.image) && 'source' in value.image && 'format' in value.image) {
    images.count++;
    return { type: 'image' };
  }
  const projected = { ...value };
  for (const field of ['content', 'parts'] as const) {
    if (Array.isArray(value[field])) projected[field] = value[field].map(block => projectContent(block, images));
  }
  if (value.type === 'function_call_output' && Array.isArray(value.output)) {
    projected.output = value.output.map(block => projectContent(block, images));
  }
  if (isRecord(value.functionResponse) && Array.isArray(value.functionResponse.parts)) {
    projected.functionResponse = { ...value.functionResponse,
      parts: value.functionResponse.parts.map(block => projectContent(block, images)) };
  }
  if (isRecord(value.toolResult) && Array.isArray(value.toolResult.content)) {
    projected.toolResult = { ...value.toolResult,
      content: value.toolResult.content.map(block => projectContent(block, images)) };
  }
  return projected;
}

/** Count the endpoint's real projection; binary image encoding is not token text. */
export function estimateWirePrompt(body: Readonly<Record<string, unknown>>, fields: ContextFields | undefined, tokenizer?: CatalogModel['tokenizer']): number {
  return estimateWirePromptDetails(body, fields, tokenizer).tokens;
}

/** Count the endpoint projection while retaining image allowance provenance. */
export function estimateWirePromptDetails(body: Readonly<Record<string, unknown>>, fields: ContextFields | undefined, tokenizer?: CatalogModel['tokenizer']): WirePromptEstimate {
  if (!fields || !Array.isArray(body[fields.conversation])) throw new Error('Endpoint prompt fields are unavailable.');
  const images = { count: 0 };
  const conversation = JSON.stringify((body[fields.conversation] as unknown[]).map(value => projectContent(value, images)));
  const envelope = { ...body, [fields.conversation]: undefined };
  const counted = countRequestText([conversation, JSON.stringify(envelope)], tokenizer);
  // JSON framing is an approximation of protocol overhead, not provider usage.
  return Object.freeze({ tokens: counted.tokens
    + images.count * IMAGE_ESTIMATE_TOKENS, method: counted.method,
    imageCount: images.count, imageAllowanceTokens: images.count * IMAGE_ESTIMATE_TOKENS });
}
