import fs from "node:fs";
import path from "node:path";
import { createSessionStoreLayout, locateExistingSessionLayout, type SessionFileLayout, type SessionStoreLayout } from "../store/sessionFileLayout.js";
import { readTranscript, parseTranscript, type ReadTranscript } from "../transcript/sessionTranscript.js";
import { readTextFile } from '../../core/workspace/files.js';
import { assertNoPromptIntent } from '../store/prompt/intent.js';
import { readSessionMetadataRecord } from '../store/sessionStore.js';
import { readStateSnapshotRequired } from '../store/sessionStateStore.js';
import { fileVersion, readSessionFileVersion } from '../store/version.js';
import type { LedgerBinding } from '../../core/agent/request/model.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';

interface ExportSource extends SessionFileLayout {
  readonly directoryIdentity: string;
  readonly version: string | undefined;
}

/** Read once, retaining diagnostics instead of disguising a read failure as empty. */
export function readExportSource(sessionId: string, maxBytes?: number, store?: SessionStoreLayout):
  | (ExportSource & { readonly ok: true; readonly transcript: ReadTranscript; readonly raw?: string })
  | { readonly ok: false; readonly reason: string } {
  try {
    const layout = locateExistingSessionLayout(store ?? createSessionStoreLayout(), sessionId);
    if (!fs.existsSync(layout.sessionDir)) return { ok: false, reason: `Session \`${sessionId}\` was not found.` };
    assertNoPromptIntent(layout);
    const directoryIdentity = readDirectoryIdentity(layout.sessionDir);
    if (!fs.existsSync(layout.transcriptPath)) return { ok: false, reason: "The session transcript is missing." };
    const transcriptVersion = readTranscriptVersion(layout.transcriptPath);
    const version = exportVersion(layout);
    const source = maxBytes === undefined ? undefined : readTextFile(layout.transcriptPath, maxBytes);
    if (maxBytes !== undefined && source === undefined) throw new Error('The saved transcript is unavailable.');
    const transcript = source === undefined ? readTranscript(layout.transcriptPath) : parseTranscript(source);
    if (readDirectoryIdentity(layout.sessionDir) !== directoryIdentity || exportVersion(layout) !== version
      || readTranscriptVersion(layout.transcriptPath) !== transcriptVersion) {
      throw new Error('Session source changed during export.');
    }
    assertNoPromptIntent(layout);
    return { ok: true, transcript, ...layout, directoryIdentity, version,
      ...(source === undefined ? {} : { raw: source }) };
  } catch {
    return { ok: false, reason: "The session transcript could not be read." };
  }
}

/** Accounting must come from the same state read and retain the original store identity. */
export function readExportState(source: ExportSource,
  sessionId: string, maxBytes?: number): { readonly state: SessionStateSnapshot; readonly binding: LedgerBinding } | undefined {
  try {
    assertNoPromptIntent(source);
    if (!source.version || readDirectoryIdentity(source.sessionDir) !== source.directoryIdentity
      || readSessionFileVersion(source) !== source.version) return undefined;
    const metadata = readSessionMetadataRecord(source.metadataPath, maxBytes);
    const state = readStateSnapshotRequired(source.statePath, maxBytes);
    if (!metadata || metadata.id !== sessionId || typeof metadata.createdAt !== 'string' || !metadata.createdAt
      || typeof metadata.projectRoot !== 'string' || typeof state.projectRoot !== 'string'
      || readDirectoryIdentity(source.sessionDir) !== source.directoryIdentity
      || readSessionFileVersion(source) !== source.version) return undefined;
    // Historical accounting remains readable after its former workspace is removed.
    if (!path.isAbsolute(metadata.projectRoot) || !path.isAbsolute(state.projectRoot)
      || path.resolve(metadata.projectRoot) !== path.resolve(state.projectRoot)) return undefined;
    assertNoPromptIntent(source);
    return { state, binding: { sessionId, sessionCreatedAt: metadata.createdAt, directoryIdentity: source.directoryIdentity } };
  } catch { return undefined; }
}

function exportVersion(layout: SessionFileLayout): string | undefined {
  // Older transcript-only sessions can still be exported without accounting.
  try { return readSessionFileVersion(layout); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}

function readTranscriptVersion(transcriptPath: string): string {
  const stat = fs.lstatSync(transcriptPath);
  if (!stat.isFile()) throw new Error('The saved transcript is unavailable.');
  return fileVersion(stat).join(':');
}

function readDirectoryIdentity(sessionDir: string): string {
  const stat = fs.lstatSync(sessionDir, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Session source is not a directory.');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}
