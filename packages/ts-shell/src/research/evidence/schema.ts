import { identifier, text, texts } from '../brief/schema.js';

export const referenceSchema = { type: 'object', additionalProperties: false, required: ['sourceId', 'excerptId', 'quote'],
  properties: { sourceId: identifier, excerptId: identifier, quote: { type: 'string', minLength: 1, maxLength: 1000 } } };
const references = { type: 'array', maxItems: 12, items: referenceSchema };
export const claimSchema = { type: 'object', additionalProperties: false,
  required: ['id', 'questionId', 'text', 'kind', 'scope', 'support', 'supportReason', 'supporting', 'opposing', 'conflicts', 'limitations'],
  properties: { id: identifier, questionId: identifier, text, kind: { enum: ['behavior', 'method', 'evaluation', 'metadata', 'other'] },
    scope: text, support: { enum: ['direct', 'indirect', 'insufficient', 'opposed'] }, supportReason: text,
    supporting: references, opposing: references, conflicts: texts, limitations: texts } };
export const draftSchema = { type: 'object', additionalProperties: false,
  required: ['summary', 'claims', 'covered', 'uncovered', 'limitations'],
  properties: { summary: text, claims: { type: 'array', maxItems: 48, items: claimSchema }, covered: texts, uncovered: texts, limitations: texts } };
export const sourceSchema = { type: 'object', additionalProperties: false,
  required: ['id', 'kind', 'provider', 'locator', 'fetchedAt', 'callId', 'childId', 'briefRevision', 'status', 'replicas', 'excerpts', 'limits'],
  properties: { id: identifier, kind: { enum: ['web', 'file', 'paper', 'search'] }, provider: text, locator: text, finalLocator: text,
    fetchedAt: text, callId: identifier, childId: identifier, briefRevision: { type: 'integer', minimum: 1 },
    status: { enum: ['metadata', 'abstract', 'read', 'truncated', 'no-text', 'failed', 'restricted'] },
    contentHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, hashScope: text, readKey: text, mime: text, bytes: { type: 'integer', minimum: 0 }, parser: text, title: text,
    identifiers: { type: 'object', additionalProperties: false, properties: { doi: text, arxiv: text, version: text, providerId: text } },
    replicas: texts, fulltextUrls: texts, limits: texts, stale: { type: 'boolean' }, failure: text,
    retrieval: { type: 'object', additionalProperties: false, required: ['url', 'contentHash', 'fetchedAt', 'bytes'],
      properties: { url: text, contentHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, fetchedAt: text, bytes: { type: 'integer', minimum: 0 } } },
    excerpts: { type: 'array', maxItems: 24, items: { type: 'object', additionalProperties: false,
      required: ['id', 'location', 'text'], properties: { id: identifier, location: text, text: { type: 'string', maxLength: 8000 } } } } } };
