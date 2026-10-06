import { readReport, REPORT_BYTES } from '../../core/commands/report/codec.js';
import * as fs from 'node:fs';
import { reportText } from '../../core/commands/report/projection.js';
import { buildLinearSessionThreadSnapshot, sessionThreadPath } from '../schema/sessionThread.js';
import { createTranscriptEntryId } from '../sessionEventCodec.js';
import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { appendTranscriptEvent } from '../transcript/sessionTranscript.js';
import type { ReportWriter } from './model.js';

/** Capture before asynchronous command work; a later cursor cannot claim its report. */
export function captureReportWriter(store: SessionStoreAccess, sessionId: string): ReportWriter {
  let source: ReturnType<typeof cursor>;
  try { source = cursor(store, sessionId); } catch { return () => 'not-saved'; }
  return report => {
    let attempted = false;
    try {
      const snapshot = readReport(report);
      if (!snapshot) return 'not-saved';
      const text = reportText(snapshot);
      if (Buffer.byteLength(text, 'utf8') > REPORT_BYTES) return 'not-saved';
      return store.withSessionStateLock(sessionId, () => {
        const current = cursor(store, sessionId);
        if (current.entryId !== source.entryId || current.branchId !== source.branchId) return 'not-saved';
        const target = store.transcriptPath(sessionId);
        attempted = true;
        appendTranscriptEvent(target, { type: 'command-output', id: createTranscriptEntryId('report'),
          sourceEntryId: source.entryId, timestamp: new Date().toISOString(), text, report: snapshot }, undefined, { requireExisting: true });
        if (!fs.existsSync(store.metadataPath(sessionId)) || !fs.existsSync(target)) return 'unverified';
        return 'saved';
      }, { requireExisting: true });
    } catch { return attempted ? 'unverified' : 'not-saved'; }
  };
}

function cursor(store: SessionStoreAccess, sessionId: string): { entryId: string; branchId?: string } {
  if (!fs.statSync(store.metadataPath(sessionId)).isFile() || !fs.statSync(store.transcriptPath(sessionId)).isFile()) {
    throw new Error('Report storage unavailable.');
  }
  const state = store.readStateSnapshotRequired(store.statePath(sessionId));
  const thread = state.thread ?? buildLinearSessionThreadSnapshot(store.load(sessionId));
  const selected = sessionThreadPath(thread);
  const entryId = selected.path.at(-1)?.id;
  if (!selected.resolved || !entryId) throw new Error('Report source unavailable.');
  return { entryId, branchId: thread.activeBranchId };
}
