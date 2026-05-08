import fs from "node:fs";
import path from "node:path";

export type StoppedRecoveryContextFixture = {
  projectRoot: string;
  sessionId: string;
  sessionDir: string;
  stopReason: string;
  nextAction: string;
};

export function seedStoppedRecoveryContextSession(input: {
  fakeHomeDir: string;
  sessionsDir: string;
  sessionId?: string;
  projectName?: string;
}): StoppedRecoveryContextFixture {
  const projectRoot = path.join(
    input.fakeHomeDir,
    input.projectName ?? "continue-stopped-recovery-context-project",
  );
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "docs", "failed-edit.md"),
    "Current content remains unchanged.\n",
    "utf8",
  );

  const sessionId = input.sessionId ?? "sess_continue_stopped_recovery";
  const sessionDir = path.join(input.sessionsDir, sessionId);
  const now = new Date().toISOString();
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, "metadata.json"),
    JSON.stringify(
      {
        id: sessionId,
        projectRoot,
        title: "Stopped Continue Recovery Context",
        createdAt: now,
        updatedAt: now,
      },
      null,
      2,
    ),
    "utf8",
  );

  const currentStorePath = path.join(
    input.fakeHomeDir,
    ".private-agents",
    "current-session.json",
  );
  fs.mkdirSync(path.dirname(currentStorePath), { recursive: true });
  fs.writeFileSync(
    currentStorePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        byProjectRoot: {
          [path.resolve(projectRoot).toLowerCase()]: {
            sessionId,
            updatedAt: now,
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const stopReason =
    "patch-from-not-found: Source text was not found in docs/failed-edit.md.";
  const nextAction =
    "Re-read docs/failed-edit.md, then rerun with the exact current text to replace.";
  fs.writeFileSync(
    path.join(sessionDir, "state.json"),
    JSON.stringify(
      {
        status: "completed",
        projectRoot,
        runPhase: "idle",
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
        durableStatus: "stopped",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(sessionDir, "transcript.jsonl"),
    [
      {
        type: "message",
        role: "user",
        content: "replace old text in docs/failed-edit.md",
        timestamp: now,
      },
      {
        type: "query-event",
        event: {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "stopped",
            stopReason,
            transcript: [],
            sharedContext: {
              sessionId,
              initialPrompt: "replace old text in docs/failed-edit.md",
              notes: [],
              handoffs: [],
            },
            finalOutput:
              "Stopped before editing docs/failed-edit.md because the requested source text was missing.",
            codingResult: {
              taskKind: "edit-file",
              changedFiles: [],
              failedFiles: [{ path: "docs/failed-edit.md", reason: stopReason }],
              patches: [
                {
                  path: "docs/failed-edit.md",
                  operation: "replace",
                  status: "failed",
                  failureCode: "patch-from-not-found",
                  reason: stopReason,
                },
              ],
              repair: {
                status: "failed",
                attempts: 1,
                recoveredItems: [],
                failedItems: ["docs/failed-edit.md"],
                notes: [`${stopReason} Next action: ${nextAction}`],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 1,
                evidence: ["actionable-blocker-kind:patch-from-not-found"],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: ["docs/failed-edit.md"],
                changedFiles: [],
                unchangedAttemptedFiles: ["docs/failed-edit.md"],
              },
              taskSatisfaction: {
                verdict: "completed-with-caveats",
                reasons: [stopReason],
                requiredEvidence: ["inspect->edit->verify contract execution"],
                observedEvidence: ["actionable-blocker-kind:patch-from-not-found"],
              },
              verifiedFiles: [],
              unverifiedFiles: [{ path: "docs/failed-edit.md", reason: stopReason }],
              verification: {
                status: "blocked",
                reason: stopReason,
                blockerKind: "patch-from-not-found",
                nextAction,
              },
              lastActionResultSeed: {
                actionKind: "edit-file",
                target: "docs/failed-edit.md",
                changedFiles: [],
                failedFiles: ["docs/failed-edit.md"],
                verification: {
                  status: "blocked",
                  reason: stopReason,
                  blockerKind: "patch-from-not-found",
                },
                blockerKind: "patch-from-not-found",
                reason: stopReason,
              },
              evidence: [
                "actionable-blocker-kind:patch-from-not-found",
                `mutation-summary-next-action:${nextAction}`,
              ],
              failureBoundary: stopReason,
            },
          },
        },
        timestamp: now,
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
    "utf8",
  );

  return { projectRoot, sessionId, sessionDir, stopReason, nextAction };
}

export function seedWriterStartedStoppedRecoveryContextSession(input: {
  fakeHomeDir: string;
  sessionsDir: string;
  sessionId?: string;
  projectName?: string;
  writeEffect?: "unknown" | "unverified";
}): StoppedRecoveryContextFixture & {
  writeEffect: "unknown" | "unverified";
  targetPath: string;
} {
  const projectRoot = path.join(
    input.fakeHomeDir,
    input.projectName ?? "continue-writer-started-stopped-project",
  );
  const targetPath = "docs/uncertain-edit.md";
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, targetPath),
    "Current content may or may not include the attempted edit.\n",
    "utf8",
  );

  const sessionId = input.sessionId ?? "sess_writer_started_stopped_recovery";
  const sessionDir = path.join(input.sessionsDir, sessionId);
  const now = new Date().toISOString();
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, "metadata.json"),
    JSON.stringify(
      {
        id: sessionId,
        projectRoot,
        title: "Writer Started Stopped Recovery Context",
        createdAt: now,
        updatedAt: now,
      },
      null,
      2,
    ),
    "utf8",
  );

  const currentStorePath = path.join(
    input.fakeHomeDir,
    ".private-agents",
    "current-session.json",
  );
  fs.mkdirSync(path.dirname(currentStorePath), { recursive: true });
  fs.writeFileSync(
    currentStorePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        byProjectRoot: {
          [path.resolve(projectRoot).toLowerCase()]: {
            sessionId,
            updatedAt: now,
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const writeEffect = input.writeEffect ?? "unknown";
  const stopReason =
    writeEffect === "unknown"
      ? `workspace writer started for ${targetPath}, but the write effect is unknown.`
      : `workspace writer updated ${targetPath}, but post-write verification did not prove the final content.`;
  const nextAction = `Re-read ${targetPath} before retrying; do not assume the previous write succeeded.`;
  fs.writeFileSync(
    path.join(sessionDir, "state.json"),
    JSON.stringify(
      {
        status: "completed",
        projectRoot,
        runPhase: "idle",
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
        durableStatus: "stopped",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(sessionDir, "transcript.jsonl"),
    [
      {
        type: "message",
        role: "user",
        content: `apply patch to ${targetPath}`,
        timestamp: now,
      },
      {
        type: "query-event",
        event: {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "stopped",
            stopReason,
            transcript: [],
            sharedContext: {
              sessionId,
              initialPrompt: `apply patch to ${targetPath}`,
              notes: [],
              handoffs: [],
            },
            finalOutput:
              `Stopped after the workspace writer started for ${targetPath}; write effect is ${writeEffect}.`,
            codingResult: {
              taskKind: "edit-file",
              changedFiles: [],
              failedFiles: [{ path: targetPath, reason: stopReason }],
              patches: [
                {
                  path: targetPath,
                  operation: "replace",
                  status: "failed",
                  failureCode:
                    writeEffect === "unknown"
                      ? "write-failed"
                      : "readback-mismatch",
                  reason: stopReason,
                },
              ],
              repair: {
                status: "failed",
                attempts: 1,
                recoveredItems: [],
                failedItems: [targetPath],
                notes: [
                  nextAction,
                  "workspace write route only; no automatic repair was attempted in this lane.",
                ],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 1,
                evidence: [
                  "apply-patch-workspace-write-result:writer-started-stopped",
                  `apply-patch-workspace-write-result:write-effect:${writeEffect}`,
                ],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: [targetPath],
                changedFiles: [],
                unchangedAttemptedFiles: [targetPath],
              },
              taskSatisfaction: {
                verdict: "insufficient-evidence",
                reasons: [stopReason],
                requiredEvidence: [
                  "blocked workspace write route must not display write success",
                  "blocked workspace write route must not report changed files",
                  "writer-invoked failure must require current-file inspection",
                ],
                observedEvidence: [
                  "apply-patch-workspace-write-result:writer-started-stopped",
                  `apply-patch-workspace-write-result:write-effect:${writeEffect}`,
                  "apply-patch-workspace-write-result:writer-started-no-success",
                  "apply-patch-workspace-write-result:user-inspection-required",
                ],
              },
              verifiedFiles: [],
              unverifiedFiles: [{ path: targetPath, reason: stopReason }],
              verification: {
                status: "blocked",
                reason: stopReason,
                blockerKind: "environment-not-ready",
                nextAction,
              },
              lastActionResultSeed: {
                actionKind: "edit-file",
                target: targetPath,
                changedFiles: [],
                verifiedFiles: [],
                writerStarted: true,
                writeEffect,
                requiresUserInspection: true,
                verification: {
                  status: "blocked",
                  reason: stopReason,
                  blockerKind: "environment-not-ready",
                },
                blockerKind: "environment-not-ready",
                reason: stopReason,
              },
              evidence: [
                "actionable-blocker-kind:partial-mutation-failed",
                `apply-patch-workspace-write-result:write-effect:${writeEffect}`,
                "apply-patch-workspace-write-result:writer-started-no-success",
                "apply-patch-workspace-write-result:user-inspection-required",
                `mutation-summary-next-action:${nextAction}`,
              ],
              failureBoundary:
                "single-file-apply-patch-workspace-write-writer-started-stopped",
            },
          },
        },
        timestamp: now,
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
    "utf8",
  );

  return {
    projectRoot,
    sessionId,
    sessionDir,
    stopReason,
    nextAction,
    writeEffect,
    targetPath,
  };
}
