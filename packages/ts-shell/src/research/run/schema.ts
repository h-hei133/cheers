import { briefSchema, requestSchema, identifier, text, texts } from '../brief/schema.js';
import { claimSchema, sourceSchema, draftSchema } from '../evidence/schema.js';
import { reviewSchema } from '../review/schema.js';

const count = { type: 'integer', minimum: 0 };
const scope = { sessionId: identifier, sessionCreatedAt: text,
  workspace: { type: 'object', additionalProperties: false, required: ['path', 'identity'], properties: { path: text, identity: text } } };
const fragment = { type: 'object', additionalProperties: false, required: ['index', 'title', 'text', 'claimIds', 'sourceIds', 'inputDigest'],
  properties: { index: count, title: text, text: { type: 'string', maxLength: 12000 }, claimIds: texts, sourceIds: texts,
    inputDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' } } };
const child = { type: 'object', additionalProperties: false,
  required: ['id', 'stage', 'briefRevision', 'startedAt', 'status', 'requestIds', 'sourceIds'],
  properties: { id: identifier, stage: text, briefRevision: { type: 'integer', minimum: 1 }, startedAt: text, endedAt: text,
    status: { enum: ['running', 'completed', 'failed', 'cancelled', 'unknown'] }, requestIds: { ...texts, maxItems: 128 }, sourceIds: { ...texts, maxItems: 128 }, failure: text } };
const run = { type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'sessionId', 'sessionCreatedAt', 'workspace', 'id', 'revision', 'epoch', 'createdAt', 'deadlineAt', 'request',
    'briefRevision', 'briefs', 'status', 'stage', 'investigationRounds', 'gapQuestions', 'sources', 'claims', 'fragments', 'children', 'events', 'save', 'ledgerScopeId'],
  properties: { ...scope, schemaVersion: { const: 1 }, id: identifier, revision: count, epoch: count, createdAt: text, deadlineAt: text,
    request: requestSchema, briefRevision: { type: 'integer', minimum: 1 }, brief: briefSchema,
    briefs: { type: 'array', maxItems: 16, items: briefSchema },
    status: { enum: ['ready', 'running', 'paused', 'partial', 'completed', 'blocked', 'stale'] },
    stage: { enum: ['brief', 'investigate', 'gaps', 'draft', 'review', 'report', 'reconcile'] },
    resumeStage: { enum: ['brief', 'investigate', 'gaps', 'draft', 'review', 'report', 'reconcile'] }, reconciledUnknown: text,
    investigationRounds: count, gapQuestions: texts,
    sources: { type: 'array', maxItems: 96, items: sourceSchema }, claims: { type: 'array', maxItems: 48, items: claimSchema },
    draft: draftSchema, review: reviewSchema, fragments: { type: 'array', maxItems: 6, items: fragment },
    children: { type: 'array', maxItems: 48, items: child },
    events: { type: 'array', maxItems: 256, items: { type: 'object', additionalProperties: false,
      required: ['sequence', 'timestamp', 'kind', 'stage', 'detail'], properties: { sequence: count, timestamp: text, kind: text, stage: text, detail: text } } },
    pending: { type: 'object', additionalProperties: false, required: ['childId', 'owner', 'epoch'], properties: { childId: identifier, epoch: count,
      owner: { type: 'object', additionalProperties: false, required: ['token', 'pid', 'hostname', 'startedAt'],
        properties: { token: identifier, pid: { type: 'integer', minimum: 1 }, hostname: text, startedAt: text } } } },
    owner: { type: 'object', additionalProperties: false, required: ['token', 'pid', 'hostname', 'startedAt'],
      properties: { token: identifier, pid: { type: 'integer', minimum: 1 }, hostname: text, startedAt: text } },
    goal: { type: 'object', additionalProperties: false, required: ['id', 'controlRevision'], properties: { id: identifier, controlRevision: count } },
    ledgerScopeId: identifier, stopReason: text,
    save: { type: 'object', additionalProperties: false, required: ['requested', 'status'], properties: { requested: { type: 'boolean' },
      status: { enum: ['not-requested', 'pending', 'committed', 'denied', 'failed', 'unknown'] }, path: text, operationId: identifier } },
  } };
export const researchStateSchema = { type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'sessionId', 'sessionCreatedAt', 'workspace', 'runs'],
  properties: { ...scope, schemaVersion: { const: 1 }, currentId: identifier, runs: { type: 'array', maxItems: 4, items: run } } };
export const reportFragmentSchema = fragment;
