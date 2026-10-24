import { createHash } from 'node:crypto';
import type { OperationReceipt, OperationScope } from '../operation/model.js';

const PAGE_SIZE = 40;

export interface UndoHistoryPage {
  readonly receipts: readonly OperationReceipt[];
  readonly offset: number;
  readonly total: number;
  readonly revision: string;
  readonly nextCursor?: string;
}

export function validUndoHistoryCursor(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}:[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/.test(value);
}

/** A cursor is read authority for one unchanged scoped ledger, never write approval. */
export function pageUndoHistory(scope: OperationScope, receipts: Iterable<OperationReceipt>, cursor?: string): UndoHistoryPage | undefined {
  if (cursor !== undefined && !validUndoHistoryCursor(cursor)) return undefined;
  // Hash the same JSON bytes incrementally; avoid a second ledger-sized string.
  const digest = createHash('sha256').update(`{"scope":${JSON.stringify(scope)},"receipts":[`);
  const page: OperationReceipt[] = [];
  const after = cursor?.slice(65);
  let found = cursor === undefined;
  let offset = 0;
  let total = 0;
  for (const receipt of receipts) {
    if (total) digest.update(',');
    digest.update(JSON.stringify(receipt));
    if (found && page.length < PAGE_SIZE) page.push(receipt);
    if (!found && receipt.operationId === after) {
      found = true;
      offset = total + 1;
    }
    total++;
  }
  const revision = digest.update(']}').digest('hex');
  // Drain and validate the complete ledger even after filling this display page.
  if (!found || cursor !== undefined && cursor.slice(0, 64) !== revision) return undefined;
  return { receipts: page, offset, total, revision,
    ...(offset + page.length < total ? { nextCursor: `${revision}:${page.at(-1)!.operationId}` } : {}) };
}
