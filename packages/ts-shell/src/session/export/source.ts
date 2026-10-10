import fs from "node:fs";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../store/sessionFileLayout.js";
import { readTranscript, parseTranscript, type ReadTranscript } from "../transcript/sessionTranscript.js";
import { readTextFile } from '../../core/workspace/files.js';
import type { SessionThreadSnapshot } from '../schema/sessionThread.js';

/** Read once, retaining diagnostics instead of disguising a read failure as empty. */
export function readExportSource(sessionId: string, maxBytes?: number):
  | { readonly ok: true; readonly transcript: ReadTranscript; readonly statePath: string; readonly raw?: string }
  | { readonly ok: false; readonly reason: string } {
  try {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    if (!fs.existsSync(layout.sessionDir)) return { ok: false, reason: `Session \`${sessionId}\` was not found.` };
    if (!fs.existsSync(layout.transcriptPath)) return { ok: false, reason: "The session transcript is missing." };
    const source = maxBytes === undefined ? undefined : readTextFile(layout.transcriptPath, maxBytes);
    return { ok: true, transcript: maxBytes === undefined ? readTranscript(layout.transcriptPath) : parseTranscript(source ?? ''), statePath: layout.statePath,
      ...(source === undefined ? {} : { raw: source }) };
  } catch {
    return { ok: false, reason: "The session transcript could not be read." };
  }
}

/** Bounded sharing acquisition never allocates an unbounded state file. */
export function readExportThread(statePath: string, maxBytes: number): SessionThreadSnapshot | undefined {
  const source = readTextFile(statePath, maxBytes); if (source === undefined) return undefined;
  const state = JSON.parse(source) as { thread?: SessionThreadSnapshot }; return state.thread;
}
