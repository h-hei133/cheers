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
