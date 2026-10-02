import fs from "node:fs";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../store/sessionFileLayout.js";
import { readTranscript, type ReadTranscript } from "../transcript/sessionTranscript.js";

/** Read once, retaining diagnostics instead of disguising a read failure as empty. */
export function readExportSource(sessionId: string):
  | { readonly ok: true; readonly transcript: ReadTranscript; readonly statePath: string }
  | { readonly ok: false; readonly reason: string } {
  try {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    if (!fs.existsSync(layout.sessionDir)) return { ok: false, reason: `Session \`${sessionId}\` was not found.` };
    if (!fs.existsSync(layout.transcriptPath)) return { ok: false, reason: "The session transcript is missing." };
    return { ok: true, transcript: readTranscript(layout.transcriptPath), statePath: layout.statePath };
  } catch {
    return { ok: false, reason: "The session transcript could not be read." };
  }
}
