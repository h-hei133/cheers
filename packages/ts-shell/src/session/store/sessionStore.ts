import * as fs from "node:fs";
import type { SessionMetadata } from "../schema/sessionMetadataCodec.js";
import { projectSessionMetadata } from "../schema/sessionMetadataCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { buildSessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { projectBranchMessages, readTranscriptEvents } from "../transcript/sessionTranscript.js";
import { createTranscriptHeader } from "../sessionEventCodec.js";
import { sessionThreadPath } from "../schema/sessionThread.js";
import { readJsonFileWithRetry, writeJsonFileAtomic } from "./sessionFileStore.js";
import type { SessionFileLayout } from "./sessionFileLayout.js";
import { readStateSnapshotRequired, writeSessionState } from "./sessionStateStore.js";

export function sessionExistsAtLayout(layout: Pick<SessionFileLayout, "sessionDir">): boolean {
  return fs.existsSync(layout.sessionDir);
}

export function writeSessionRecord(input: {
  readonly session: Session;
  readonly layout: SessionFileLayout;
}): void {
  if (!fs.existsSync(input.layout.sessionDir)) {
    fs.mkdirSync(input.layout.sessionDir, { recursive: true });
  }

  if (!fs.existsSync(input.layout.transcriptPath)) {
    // The header goes in at the moment the file comes into being, while it is
    // still empty. That is what keeps it compatible with append-only: a header
    // has to be the first line, and writing it to a file with nothing in it is
    // not a rewrite of anything. Appending never touches it afterwards.
    fs.writeFileSync(
      input.layout.transcriptPath,
      `${JSON.stringify(
        createTranscriptHeader({
          sessionId: input.session.id,
          timestamp: input.session.createdAt,
          cwd: input.session.projectRoot,
        }),
      )}\n`,
      "utf8",
    );
  }

  writeSessionMetadataRecord(input);
  writeSessionState({
    session: input.session,
    layout: input.layout,
  });
}

export function writeSessionMetadataRecord(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "metadataPath">;
}): void {
  const metadata = projectSessionMetadata(input.session);
  writeJsonFileAtomic(input.layout.metadataPath, metadata);
}

export function deleteSessionRecord(input: {
  readonly sessionId: string;
  readonly layout: Pick<SessionFileLayout, "sessionDir">;
}): void {
  if (!fs.existsSync(input.layout.sessionDir)) {
    throw new Error(`Session ${input.sessionId} not found`);
  }
  fs.rmSync(input.layout.sessionDir, { recursive: true, force: true });
}

export function loadSessionRecord(input: {
  readonly sessionId: string;
  readonly layout: SessionFileLayout;
  readonly cwd: string;
}): Session {
  if (
    !fs.existsSync(input.layout.sessionDir) ||
    !fs.existsSync(input.layout.metadataPath) ||
    !fs.existsSync(input.layout.transcriptPath)
  ) {
    throw new Error(`Session ${input.sessionId} not found`);
  }

  try {
    const metadata = readJsonFileWithRetry<SessionMetadata>(
      input.layout.metadataPath,
      {
        required: true,
        parseErrorDetail: `Failed to load session ${input.sessionId}`,
      },
    );
    const state = readStateSnapshotRequired(input.layout.statePath);
    // Which branch is in view is a question about the thread, so the thread
    // answers it. Without a thread — a session recorded before any of this
    // existed — every message in the transcript is the conversation, as before.
    //
    // A thread whose path cannot be resolved is left to `undefined` rather than
    // passed on as an empty path: an empty path is a branch with no messages,
    // which would load the session as a conversation that said nothing. Passing
    // nothing instead puts the transcript back in charge, which is the only
    // other account of what the session contained.
    const threadPath = state.thread === undefined ? undefined : sessionThreadPath(state.thread);
    const branchPath = threadPath?.resolved === true
      ? threadPath.path.map((entry) => entry.id)
      : undefined;
    const turns = projectBranchMessages(
      readTranscriptEvents(input.layout.transcriptPath),
      branchPath,
      state.thread?.entries.map((entry) => entry.id),
    );

    return projectLoadedSession({
      metadata,
      state,
      turns,
      cwd: input.cwd,
    });
  } catch (error) {
    throw new Error(
      `Failed to load session ${input.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function projectLoadedSession(input: {
  readonly metadata: SessionMetadata | undefined;
  readonly state: SessionStateSnapshot;
  readonly turns: SessionMessage[];
  readonly cwd: string;
}): Session {
  const metadata = input.metadata;
  if (!metadata) {
    throw new Error("Session metadata missing");
  }
  return {
    id: metadata.id,
    projectRoot:
      metadata.projectRoot?.trim() ||
      input.state.projectRoot?.trim() ||
      input.cwd,
    ...(metadata.rootMode ? { rootMode: metadata.rootMode } : {}),
    ...(metadata.requestedWorkspaceRoot?.trim()
      ? { requestedWorkspaceRoot: metadata.requestedWorkspaceRoot.trim() }
      : {}),
    ...(metadata.targetPathBase?.trim()
      ? { targetPathBase: metadata.targetPathBase.trim() }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(metadata, "gitRoot")
      ? { gitRoot: metadata.gitRoot?.trim() || null }
      : {}),
    title: metadata.title,
    ...(metadata.parentSession ? { parentSession: metadata.parentSession } : {}),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    status: input.state.status,
    pendingPrompt: input.state.pendingPrompt,
    lastError: input.state.lastError,
    turns: input.turns,
  };
}

export function projectInitialStateSnapshot(session: Session): SessionStateSnapshot {
  return buildSessionStateSnapshot(session, undefined);
}
