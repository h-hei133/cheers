import fs from "node:fs";
import path from "node:path";
import { resolveSessionTargetId } from "../cli/rpc/runtimeOps.js";
import { gatherExport } from "../session/export/collect.js";
import { renderExportHtml } from "../session/export/html.js";
import { validateSessionId } from "../session/store/sessionFileLayout.js";
import { SessionManager } from "../session/SessionManager.js";

function assertSafeSessionId(raw: string): string {
  const valid = validateSessionId(raw);
  if (valid === "." || valid === ".." || valid.includes("..")) {
    throw new Error(`Invalid session id "${raw}".`);
  }
  return valid;
}

/**
 * Exports a session by ID, "current", or session file path to self-contained HTML for `--export`.
 */
export async function runCliExport(
  source: string,
  outputPath: string | undefined,
  launchCwd: string,
): Promise<string> {
  const manager = new SessionManager();
  let sessionId = source.trim();
  let workspace = launchCwd;

  if (sessionId === "current") {
    const current = manager.resolveCurrentSessionForProject(launchCwd);
    if (!current.ok) {
      throw new Error(`No current session found for ${launchCwd}.`);
    }
    sessionId = current.session.id;
  } else if (sessionId.includes("/") || sessionId.includes("\\") || sessionId.endsWith(".jsonl") || sessionId.endsWith(".json")) {
    const resolved = path.resolve(launchCwd, sessionId);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Export source not found: ${source}`);
    }
    const candidateId = assertSafeSessionId(resolveSessionTargetId(resolved));
    const found = manager.listSessions().find((entry) => entry.id === candidateId)
      ?? (manager.sessionExists(candidateId) ? manager.getSession(candidateId) : undefined);
    if (!found) {
      throw new Error(`Could not resolve session '${candidateId}' from ${source}.`);
    }
    sessionId = found.id;
    workspace = found.projectRoot ?? launchCwd;
  } else {
    sessionId = assertSafeSessionId(sessionId);
    if (manager.sessionExists(sessionId)) {
      const saved = manager.getSession(sessionId);
      if (saved?.projectRoot) workspace = saved.projectRoot;
    } else {
      throw new Error(`Session '${source}' not found.`);
    }
  }

  const gathered = gatherExport({ sessionId, workspace });
  if (gathered.ok === false) {
    throw new Error(gathered.reason);
  }
  const html = renderExportHtml(gathered.payload);
  const destination = path.resolve(launchCwd, outputPath?.trim() || `${sessionId}.html`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html, "utf8");
  return `Exported to: ${destination}`;
}
