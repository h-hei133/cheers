import fs from "node:fs";
import path from "node:path";
import { createSessionStoreLayout, locateExistingSessionLayout, type SessionStoreLayout } from "../store/sessionFileLayout.js";
import { readTranscript, parseTranscript, type ReadTranscript } from "../transcript/sessionTranscript.js";
import { readTextFile } from '../../core/workspace/files.js';
import { readStateSnapshotRequired } from '../store/sessionStateStore.js';
import { readSessionMetadataRecord } from '../store/sessionStore.js';
import type { LedgerBinding } from '../../core/agent/request/model.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';

/** Read once, retaining diagnostics instead of disguising a read failure as empty. */
export function readExportSource(sessionId: string, maxBytes?: number, store?: SessionStoreLayout):
  | { readonly ok: true; readonly transcript: ReadTranscript; readonly statePath: string; readonly metadataPath: string; readonly sessionDir: string; readonly directoryIdentity: string; readonly raw?: string }
  | { readonly ok: false; readonly reason: string } {
  try {
    const layout = locateExistingSessionLayout(store ?? createSessionStoreLayout(), sessionId);
    if (!fs.existsSync(layout.sessionDir)) return { ok: false, reason: `Session \`${sessionId}\` was not found.` };
    const directoryIdentity = readDirectoryIdentity(layout.sessionDir);
    if (!fs.existsSync(layout.transcriptPath)) return { ok: false, reason: "The session transcript is missing." };
    const source = maxBytes === undefined ? undefined : readTextFile(layout.transcriptPath, maxBytes);
    const transcript = maxBytes === undefined ? readTranscript(layout.transcriptPath) : parseTranscript(source ?? '');
    if (readDirectoryIdentity(layout.sessionDir) !== directoryIdentity) throw new Error('Session source changed identity.');
    return { ok: true, transcript,
      statePath: layout.statePath, metadataPath: layout.metadataPath, sessionDir: layout.sessionDir,
      directoryIdentity,
      ...(source === undefined ? {} : { raw: source }) };
  } catch {
    return { ok: false, reason: "The session transcript could not be read." };
  }
}

/** Accounting must come from the same state read and retain the original store identity. */
export function readExportState(source: { readonly statePath: string; readonly metadataPath: string; readonly sessionDir: string; readonly directoryIdentity: string },
  sessionId: string, maxBytes?: number): { readonly state: SessionStateSnapshot; readonly binding: LedgerBinding } | undefined {
  try {
    if (readDirectoryIdentity(source.sessionDir) !== source.directoryIdentity) return undefined;
    const metadata = readSessionMetadataRecord(source.metadataPath, maxBytes);
    const state = readStateSnapshotRequired(source.statePath, maxBytes);
    if (!metadata || metadata.id !== sessionId || typeof metadata.createdAt !== 'string' || !metadata.createdAt
      || typeof metadata.projectRoot !== 'string' || typeof state.projectRoot !== 'string'
      || readDirectoryIdentity(source.sessionDir) !== source.directoryIdentity) return undefined;
    // Historical accounting remains readable after its former workspace is removed.
    if (!path.isAbsolute(metadata.projectRoot) || !path.isAbsolute(state.projectRoot)
      || path.resolve(metadata.projectRoot) !== path.resolve(state.projectRoot)) return undefined;
    return { state, binding: { sessionId, sessionCreatedAt: metadata.createdAt, directoryIdentity: source.directoryIdentity } };
  } catch { return undefined; }
}

function readDirectoryIdentity(sessionDir: string): string {
  const stat = fs.lstatSync(sessionDir, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Session source is not a directory.');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}
