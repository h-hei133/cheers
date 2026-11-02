import { isRecord } from '../../core/values/record.js';
import type { PromptMeasurement } from './model.js';

const DIGEST = /^[a-f0-9]{64}$/;
const DIGEST_FIELDS = ['endpointId', 'schemaDigest', 'systemDigest', 'historyDigest', 'wireHistoryDigest', 'replayBinding'] as const;

/** Read only complete request identities, detached from untrusted or mutable input. */
export function decodePromptMeasurement(value: unknown): PromptMeasurement | undefined {
  if (!isRecord(value) || !Number.isSafeInteger(value.tokens) || Number(value.tokens) < 0
    || !Number.isSafeInteger(value.messageCount) || Number(value.messageCount) < 0
    || !isRecord(value.identity)) return undefined;
  const identity = value.identity;
  if (typeof identity.provider !== 'string' || typeof identity.model !== 'string' || identity.model.length === 0
    || typeof identity.endpoint !== 'string' || identity.endpoint.length === 0
    || !Number.isSafeInteger(identity.wireMessageCount) || Number(identity.wireMessageCount) < 0
    || DIGEST_FIELDS.some(field => typeof identity[field] !== 'string' || !DIGEST.test(identity[field] as string))
    || identity.wireRewriteTokens !== undefined && (typeof identity.wireRewriteTokens !== 'number'
      || !Number.isSafeInteger(identity.wireRewriteTokens) || identity.wireRewriteTokens < 0)) return undefined;
  const projection = value.projection;
  if (projection !== undefined && (!isRecord(projection)
    || typeof projection.historyDigest !== 'string' || !DIGEST.test(projection.historyDigest)
    || typeof projection.wireHistoryDigest !== 'string' || !DIGEST.test(projection.wireHistoryDigest)
    || !Number.isSafeInteger(projection.wireRewriteTokens) || Number(projection.wireRewriteTokens) < 0
    || !Number.isSafeInteger(projection.removedTokens) || Number(projection.removedTokens) < 0
    || Number(projection.removedTokens) >= Number(value.tokens))) return undefined;
  return { tokens: value.tokens as number, messageCount: value.messageCount as number, identity: {
    provider: identity.provider, model: identity.model, endpoint: identity.endpoint,
    endpointId: identity.endpointId as string, schemaDigest: identity.schemaDigest as string,
    systemDigest: identity.systemDigest as string, historyDigest: identity.historyDigest as string,
    wireHistoryDigest: identity.wireHistoryDigest as string, replayBinding: identity.replayBinding as string,
    wireMessageCount: identity.wireMessageCount as number,
    ...(identity.wireRewriteTokens !== undefined ? { wireRewriteTokens: identity.wireRewriteTokens as number } : {}),
  }, ...(isRecord(projection) ? { projection: {
    historyDigest: projection.historyDigest as string, wireHistoryDigest: projection.wireHistoryDigest as string,
    wireRewriteTokens: projection.wireRewriteTokens as number, removedTokens: projection.removedTokens as number,
  } } : {}) };
}
