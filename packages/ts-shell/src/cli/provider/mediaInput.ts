import { createHash } from 'node:crypto';
import { createToolMediaBudget } from '../../core/agent/media.js';
import { compileValidator } from '../../core/validation/compiler.js';
import { snapshotData } from '../../core/values/data.js';
import { isRecord } from '../../core/values/record.js';
import { canonicalImageMime, inspectImage } from '../../model-adapters/image/input.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';
import type { ClassificationQuestion } from '../../provider/endpoints/decisions.js';

const countLimit = createToolMediaBudget().images;
const byteLimit = createToolMediaBudget().encodedBytes;
const image = { type: 'object', additionalProperties: false, required: ['data', 'mimeType'],
  properties: { type: { const: 'image' }, data: { type: 'string', maxLength: byteLimit },
    mimeType: { enum: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'] } } };
export const mediaImagesSchema = { type: 'array', maxItems: countLimit, items: image };

export function captureMediaImages(raw: unknown, allowed: boolean): readonly ImageContent[] {
  if (raw === undefined || Array.isArray(raw) && raw.length === 0) return Object.freeze([]);
  if (!allowed) throw new Error('The selected model does not declare image input support.');
  const images = snapshotData(raw, { bytes: byteLimit + 1024, depth: 4, nodes: 32 });
  if (!Array.isArray(images) || images.length > countLimit) throw new Error('Input exceeds the four-image limit.');
  let remaining = byteLimit;
  return Object.freeze(images.map(item => {
    if (!isRecord(item) || typeof item.data !== 'string' || typeof item.mimeType !== 'string'
      || item.type !== undefined && item.type !== 'image') throw new Error('Input images require a base64 data and MIME type.');
    remaining -= item.data.length;
    if (remaining < 0) throw new Error('Input exceeds the 4MiB encoded media limit.');
    const captured = Object.freeze({ type: 'image' as const, data: item.data, mimeType: canonicalImageMime(item.mimeType) });
    try { inspectImage(captured); } catch { throw new Error('Input image data could not be verified.'); }
    return captured;
  }));
}

export function mediaImageProof(images: readonly ImageContent[]) {
  return Object.freeze(images.map(image => Object.freeze({
    mimeType: image.mimeType,
    sha256: createHash('sha256').update(image.data).digest('hex'),
  })));
}

const text = { type: 'string', minLength: 1, maxLength: 4096 };
const label = { type: 'string', minLength: 1, maxLength: 256 };
const name = { type: 'string', pattern: '^[A-Za-z0-9_.-]{1,64}$' };
const choiceKey = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' };
const question = (type: string, criteria: object) => ({ type: 'object', additionalProperties: false,
  required: ['type', 'instructions', 'criteria'], properties: { type: { const: type }, instructions: text, criteria } });
export const questionsSchema = { type: 'object', minProperties: 1, maxProperties: 16, propertyNames: name,
  additionalProperties: { oneOf: [
    question('choice', { type: 'object', minProperties: 2, maxProperties: 16, propertyNames: choiceKey, additionalProperties: label }),
    question('score', { type: 'array', minItems: 2, maxItems: 16, uniqueItems: true, items: label }),
    question('bool', { type: 'object', additionalProperties: false, required: ['true', 'false'], properties: { true: label, false: label } }),
  ] } };
const validateQuestions = compileValidator(questionsSchema);

export function captureQuestions(state: unknown, questions: unknown) {
  const input = snapshotData({ state, questions }, { bytes: 64 * 1024, depth: 16, nodes: 4096 });
  if (!isRecord(input) || !isRecord(input.state) || !isRecord(input.questions) || !validateQuestions(input.questions)) {
    throw new Error('Classification requires JSON object state and valid named questions.');
  }
  return { state: input.state, questions: input.questions as Readonly<Record<string, ClassificationQuestion>> };
}
