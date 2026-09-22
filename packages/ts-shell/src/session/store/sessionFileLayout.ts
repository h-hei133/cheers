import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import { userDataDirFor } from "../../core/paths/userHome.js";
import * as path from "node:path";

export interface SessionStoreLayout {
  readonly sessionsDir: string;
  readonly currentSessionStorePath: string;
}

export interface SessionFileLayout {
  readonly sessionDir: string;
  readonly metadataPath: string;
  readonly transcriptPath: string;
  readonly statePath: string;
  readonly stateLockPath: string;
}

export function createSessionStoreLayout(homeDir?: string): SessionStoreLayout {
  const root = homeDir ?? process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
  return {
    sessionsDir: path.join(userDataDirFor(root), "sessions"),
    currentSessionStorePath: path.join(
      userDataDirFor(root),
      "current-session.json",
    ),
  };
}

export function ensureSessionStoreLayout(layout: SessionStoreLayout): void {
  if (!fs.existsSync(layout.sessionsDir)) {
    fs.mkdirSync(layout.sessionsDir, { recursive: true });
  }
}

export function createSessionId(): string {
  return `sess_${crypto.randomBytes(8).toString("hex")}_${Date.now()}`;
}

export function validateSessionId(sessionId: string): string {
  const normalizedId = sessionId.trim();
  if (!normalizedId) {
    throw new Error("Session id is required");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalizedId)) {
    throw new Error(
      `Invalid session id "${sessionId}". Allowed characters: letters, numbers, dot, underscore, dash.`,
    );
  }
  return normalizedId;
}

export function projectSessionFileLayout(input: {
  readonly sessionsDir: string;
  readonly sessionId: string;
}): SessionFileLayout {
  const sessionDir = path.join(input.sessionsDir, input.sessionId);
  return {
    sessionDir,
    metadataPath: path.join(sessionDir, "metadata.json"),
    transcriptPath: path.join(sessionDir, "transcript.jsonl"),
    statePath: path.join(sessionDir, "state.json"),
    stateLockPath: path.join(sessionDir, "state.lock"),
  };
}
