import { identifier, text, texts } from '../brief/schema.js';
import { referenceSchema } from '../evidence/schema.js';

export const reviewOutputSchema = { type: 'object', additionalProperties: false, required: ['findings', 'uncovered', 'limitation'],
  properties: { findings: { type: 'array', maxItems: 48, items: { type: 'object', additionalProperties: false,
    required: ['claimId', 'outcome', 'reason', 'references'], properties: { claimId: identifier,
      outcome: { enum: ['counterevidence', 'condition-mismatch', 'insufficient', 'none-found'] }, reason: text,
      references: { type: 'array', maxItems: 12, items: referenceSchema } } } }, uncovered: texts, limitation: text } };
export const reviewSchema = { ...reviewOutputSchema, required: [...reviewOutputSchema.required, 'role', 'correlation', 'inputDigest', 'childId', 'status'],
  properties: { ...reviewOutputSchema.properties, role: { const: 'independent' },
    correlation: { enum: ['same-model-independent-context', 'different-model'] },
    inputDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' }, childId: identifier,
    status: { enum: ['not-run', 'running', 'completed', 'failed', 'cancelled', 'timeout'] } } };
