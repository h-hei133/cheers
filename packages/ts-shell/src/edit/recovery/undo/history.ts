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
export function pageUndoHistory(scope: OperationScope, receipts: readonly OperationReceipt[], cursor?: string): UndoHistoryPage | undefined {
  // Hash the same JSON bytes incrementally; avoid a second ledger-sized string.
  const digest = createHash('sha256').update(`{"scope":${JSON.stringify(scope)},"receipts":[`);
  for (let index = 0; index < receipts.length; index++) {
    if (index) digest.update(',');
    digest.update(JSON.stringify(receipts[index]));
  }
  const revision = digest.update(']}').digest('hex');
  let offset = 0;
  if (cursor !== undefined) {
    if (!validUndoHistoryCursor(cursor) || cursor.slice(0, 64) !== revision) return undefined;
    const index = receipts.findIndex(receipt => receipt.operationId === cursor.slice(65));
    if (index < 0) return undefined;
    offset = index + 1;
  }
  const page = receipts.slice(offset, offset + PAGE_SIZE);
  return { receipts: page, offset, total: receipts.length, revision,
    ...(offset + page.length < receipts.length ? { nextCursor: `${revision}:${page.at(-1)!.operationId}` } : {}) };
}
