import path from 'node:path';
import { createReport, span } from '../../../core/commands/report/projection.js';
import type { ReportLine } from '../../../core/commands/report/contract.js';
import { editDiff } from '../../result/diff.js';
import type { ContentVersion, OperationReceipt } from '../operation/model.js';
import type { UndoPreview } from '../operation/preview.js';
import type { UndoResult } from '../operation/restore.js';
import type { UndoHistoryPage } from './history.js';

const DIFF_BYTES = 64 * 1024;
const text = (value: string): ReportLine => ({ kind: 'text', spans: [span(value)] });

export function undoNotice(note: string, status = 'blocked') {
  return createReport({ title: status === 'empty' ? 'Nothing to undo' : 'Undo unavailable', lines: [text(note)], facts: { status } });
}

export function undoPreviewReport(preview: UndoPreview) {
  const receipt = preview.receipt;
  const lines: ReportLine[] = [text(`Operation: ${receipt.operationId} · ${receipt.createdAt}`), text(`Session: ${receipt.sessionId}`),
    text(`Revision: ${preview.revision}`), text(`Write: ${receipt.status} · undo: ${receipt.undo}`),
    text('Preview only. Close this reader to choose confirmation. Files restore separately; later file changes block restoration.')];
  for (const entry of preview.files) {
    const file = entry.file;
    lines.push({ kind: 'heading', spans: [span(JSON.stringify(path.join(file.workspace.path, file.path)), 'path')] },
      text(`Edit: ${file.kind} · write: ${file.status} · undo: ${file.undo} · compensation: ${file.compensation ?? 'none'}`),
      text(`Recorded current: ${version(file.after)} → restore: ${version(file.before)}`));
    if (file.rename) lines.push(text(`Rename: ${JSON.stringify(file.rename.source)} → ${JSON.stringify(file.rename.target)}`));
    if (entry.blocker || !entry.prepared || !entry.current) { lines.push(text(`Blocked: ${entry.blocker ?? 'preview-unavailable'}`)); continue; }
    const current = entry.current.state === 'exists' ? entry.current.content : '';
    const before = entry.prepared.content ?? '';
    const excerpt = current !== before && Buffer.byteLength(current) + Buffer.byteLength(before) > DIFF_BYTES;
    const start = excerpt ? differenceStart(current, before) : 0;
    if (excerpt) lines.push(text(`Diff excerpt around the first change, starting at character ${start + 1}. Diff line positions refer to the excerpt; later changes may be omitted. Full hashes and all targets remain above. Re-read this file for full content.`));
    const diff = editDiff(file.path, excerpt ? current.slice(start, start + DIFF_BYTES / 8) : current, excerpt ? before.slice(start, start + DIFF_BYTES / 8) : before);
    lines.push(...(diff || 'No text difference.').split('\n').map(line => ({ kind: 'text' as const, spans: [span(line, 'code')] })));
  }
  lines.push(...preview.blockers.map(blocker => text(`Blocked: ${blocker}`)));
  if (preview.canRestore) lines.push(text(`Explicit command: /undo execute ${receipt.operationId} ${preview.revision} --execute`));
  return createReport({ title: 'Review file undo', lines, facts: { operationId: receipt.operationId, sessionId: receipt.sessionId,
    revision: preview.revision, status: 'preview', canRestore: preview.canRestore, files: receipt.files.map(file => path.join(file.workspace.path, file.path)) } });
}

export function undoResultReport(result: UndoResult, receipt: OperationReceipt, warning?: string) {
  return createReport({ title: `File undo: ${result.status}`, lines: [text(`Operation: ${result.operationId}`),
    ...receipt.files.map((file, index) => text(`${JSON.stringify(path.join(file.workspace.path, file.path))}: ${result.files[index]?.status ?? 'unknown'}`)),
    text(result.status === 'restored-verified' ? 'All selected files were restored and verified.' : 'Inspect the per-file results before starting another restoration.'),
    ...(['restored-verified', 'partial', 'unknown'].includes(result.status) ? [text('Previous file reads may be stale; re-read affected files before editing.')] : []),
    ...(warning ? [text(warning)] : []), text(`Saved results: /undo status ${result.operationId}`)],
    facts: { operationId: result.operationId, status: result.status, files: result.files.map(file => ({ ...file })), rollbackAtomicityClaim: false } });
}

export function undoStatusReport(receipts: readonly OperationReceipt[], page?: UndoHistoryPage) {
  return createReport({ title: 'Saved file operations', lines: receipts.flatMap(receipt => [
    { kind: 'heading' as const, spans: [span(`${receipt.sequence}: ${receipt.operationId} · ${receipt.createdAt}`)] },
    text(`Write: ${receipt.status} · undo: ${receipt.undo}`),
    ...receipt.files.map(file => text(`${JSON.stringify(path.join(file.workspace.path, file.path))}: write ${file.status}, undo ${file.undo}, compensation ${file.compensation ?? 'none'}`)),
  ]).concat(page ? [text(`Operations ${page.offset + 1}-${page.offset + receipts.length} of ${page.total}.`),
    text(page.nextCursor ? `Next results: /undo status --cursor=${page.nextCursor}` : 'End of saved operation results.')] : []),
  facts: { status: 'observation', count: receipts.length,
    ...(page ? { total: page.total, offset: page.offset, nextCursor: page.nextCursor ?? null } : {}),
    operations: receipts.map(receipt => ({ operationId: receipt.operationId, status: receipt.status, undo: receipt.undo })) } });
}

function version(state: ContentVersion): string { return state.state === 'absent' ? 'absent' : `sha256 ${state.hash}${state.mode === undefined ? '' : ` · mode ${state.mode.toString(8)}`}`; }

function differenceStart(current: string, before: string): number {
  let position = 0;
  while (position < Math.min(current.length, before.length) && current[position] === before[position]) position++;
  return Math.max(0, position - 128);
}
