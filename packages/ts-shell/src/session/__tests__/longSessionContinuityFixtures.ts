import * as fs from "node:fs";
import * as path from "node:path";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { OrchestrationResult } from "../../result/types.js";
import { SessionManager, type Session } from "../SessionManager.js";

export type LongSessionContinuityScenario =
  | "stopped-edit-failure"
  | "verification-failed"
  | "approved-tool-failure";

export interface LongSessionContinuityFixture {
  readonly manager: SessionManager;
  readonly session: Session;
  readonly scenario: LongSessionContinuityScenario;
  readonly projectRoot: string;
  readonly targetFile: string;
  readonly prompt: string;
  readonly failureReason: string;
  readonly nextAction: string;
  readonly result: OrchestrationResult;
  readonly statePath: string;
  readonly restoreManager: () => SessionManager;
  readonly readWorkingMemory: () => Record<string, unknown> | undefined;
}

export function createLongSessionContinuityFixture(
  manager: SessionManager,
  scenario: LongSessionContinuityScenario,
  options: {
    readonly projectRoot?: string;
    readonly targetFile?: string;
  } = {},
): LongSessionContinuityFixture {
  const projectRoot =
    options.projectRoot ??
    path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? process.cwd(),
      "long-session-continuity",
      scenario,
    );
  const targetFile =
    options.targetFile ??
    (scenario === "verification-failed"
      ? "src/broken.ts"
      : scenario === "approved-tool-failure"
        ? "scripts/run-check.ps1"
        : "docs/failed-edit.md");
  const prompt = buildPrompt(scenario, targetFile);
  const failureReason = buildFailureReason(scenario, targetFile);
  const nextAction = buildNextAction(scenario, targetFile);
  const session = manager.createNew(projectRoot);

  manager.recordApprovalAuditDecision(session.id, {
    decision: scenario === "approved-tool-failure" ? "allow-once" : "allow-always",
    decisionSource: "test-fixture",
    persistent: scenario !== "approved-tool-failure",
    cacheEffect: scenario === "approved-tool-failure" ? "none" : "persisted",
    projectRoot: session.projectRoot,
    cacheKey: `${session.projectRoot.toLowerCase()}|bash:spawn:process:npm`,
    scopeLabel: "bash/spawn/process(npm)",
    channel: "non-interactive",
    inputKey: "y",
  });
  manager.persistUserPromptBarrier(session.id, prompt);

  for (let index = 0; index < 11; index += 1) {
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result: createWarmupResult(session.id, prompt, index),
    });
  }

  if (scenario === "approved-tool-failure") {
    manager.appendQueryEvent(session.id, {
      type: "tool.started",
      toolName: "bash",
      taskId: "fixture-approved-tool",
    });
    manager.appendQueryEvent(session.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "fixture-approved-tool",
    });
    manager.appendQueryEvent(session.id, {
      type: "approval.resolved",
      toolName: "bash",
      taskId: "fixture-approved-tool",
      outcome: "approved",
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.result",
      toolName: "bash",
      taskId: "fixture-approved-tool",
      success: false,
    });
  }

  const result = createScenarioResult({
    sessionId: session.id,
    scenario,
    prompt,
    targetFile,
    failureReason,
    nextAction,
  });
  manager.appendQueryEvent(session.id, {
    type: "query.completed",
    result,
  });
  manager.addTurn(session.id, {
    role: "assistant",
    content: result.finalOutput || failureReason,
  });
  manager.saveError(session.id, failureReason, {
    terminalReason: "stopped_error",
    terminalClassification: scenario === "verification-failed" ? "error" : "stopped",
  });

  const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
  return {
    manager,
    session,
    scenario,
    projectRoot,
    targetFile,
    prompt,
    failureReason,
    nextAction,
    result,
    statePath,
    restoreManager: () => new SessionManager(),
    readWorkingMemory: () => {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        workingMemory?: Record<string, unknown>;
      };
      return state.workingMemory;
    },
  };
}

function buildPrompt(
  scenario: LongSessionContinuityScenario,
  targetFile: string,
): string {
  switch (scenario) {
    case "verification-failed":
      return `fix ${targetFile} and verify`;
    case "approved-tool-failure":
      return `run the approved verification command for ${targetFile}`;
    case "stopped-edit-failure":
      return `replace stale text in ${targetFile}`;
  }
}

function buildFailureReason(
  scenario: LongSessionContinuityScenario,
  targetFile: string,
): string {
  switch (scenario) {
    case "verification-failed":
      return "npm test failed with exit code 1";
    case "approved-tool-failure":
      return `approved command failed while checking ${targetFile}`;
    case "stopped-edit-failure":
      return `patch-from-not-found: Source text was not found in ${targetFile}.`;
  }
}

function buildNextAction(
  scenario: LongSessionContinuityScenario,
  targetFile: string,
): string {
  switch (scenario) {
    case "verification-failed":
      return "Inspect the failing test and continue the fix.";
    case "approved-tool-failure":
      return "Inspect command output, keep the approval provenance, and retry only after the user asks.";
    case "stopped-edit-failure":
      return `Re-read ${targetFile}, then rerun with the exact current text to replace.`;
  }
}

function createWarmupResult(
  sessionId: string,
  prompt: string,
  index: number,
): OrchestrationResult {
  return {
    status: "completed",
    terminalReason: "completed",
    terminalClassification: "success",
    transcript: [],
    sharedContext: {
      sessionId,
      initialPrompt: prompt,
      notes: [],
      handoffs: [],
    },
    finalOutput: `warmup ${index}`,
  };
}

function createScenarioResult(input: {
  readonly sessionId: string;
  readonly scenario: LongSessionContinuityScenario;
  readonly prompt: string;
  readonly targetFile: string;
  readonly failureReason: string;
  readonly nextAction: string;
}): OrchestrationResult {
  const status =
    input.scenario === "verification-failed" ? "failed" : "blocked";
  const blockerKind =
    input.scenario === "stopped-edit-failure"
      ? "patch-from-not-found"
      : input.scenario === "approved-tool-failure"
        ? "unknown"
        : undefined;
  const changedFiles =
    input.scenario === "verification-failed" ? [input.targetFile] : [];
  const failedFiles =
    input.scenario === "verification-failed"
      ? []
      : [{ path: input.targetFile, reason: input.failureReason }];
  const verifiedFiles: string[] = [];

  return {
    status: "stopped_error",
    terminalReason: "stopped_error",
    terminalClassification:
      input.scenario === "verification-failed" ? "error" : "stopped",
    stopReason: input.failureReason,
    transcript: [],
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes:
        input.scenario === "approved-tool-failure"
          ? ["approval-provenance: allow-once before execution failure"]
          : [],
      handoffs: [],
    },
    finalOutput:
      input.scenario === "verification-failed"
        ? `Edited ${input.targetFile}, but verification failed.`
        : "",
    codingResult: {
      taskKind: input.scenario === "approved-tool-failure" ? "run-command" : "edit-file",
      changedFiles,
      failedFiles,
      patches:
        input.scenario === "stopped-edit-failure"
          ? [
              {
                path: input.targetFile,
                operation: "replace",
                status: "failed",
                failureCode: "patch-from-not-found",
                reason: input.failureReason,
              },
            ]
          : [],
      repair: {
        status: input.scenario === "verification-failed" ? "not-needed" : "failed",
        attempts: 1,
        recoveredItems: [],
        failedItems:
          input.scenario === "verification-failed" ? [] : [input.targetFile],
        notes: [`${input.failureReason} Next action: ${input.nextAction}`],
      },
      continuation: {
        status: "failed-after-bounded-continuation",
        attempts: 1,
        evidence: [
          `fixture-scenario:${input.scenario}`,
          `target:${input.targetFile}`,
          `next-action:${input.nextAction}`,
        ],
      },
      changeSet: {
        gitAware: false,
        preExistingDirtyFiles: [],
        postRunDirtyFiles: changedFiles,
        attemptedFiles: [input.targetFile],
        changedFiles,
        unchangedAttemptedFiles:
          input.scenario === "verification-failed" ? [] : [input.targetFile],
      },
      taskSatisfaction: {
        verdict: "completed-with-caveats",
        reasons: [input.failureReason],
        requiredEvidence: ["long-session-continuity"],
        observedEvidence: [`fixture-scenario:${input.scenario}`],
      },
      verifiedFiles,
      unverifiedFiles: [
        {
          path: input.targetFile,
          reason: input.failureReason,
        },
      ],
      verification: {
        status,
        command:
          input.scenario === "stopped-edit-failure"
            ? undefined
            : "npm test -- src/long-session.test.ts",
        reason: input.failureReason,
        blockerKind,
        nextAction: input.nextAction,
      },
      lastActionResultSeed: {
        actionKind:
          input.scenario === "approved-tool-failure"
            ? "run-command"
            : "edit-file",
        target: input.targetFile,
        changedFiles,
        verifiedFiles,
        verification: {
          status,
          command:
            input.scenario === "stopped-edit-failure"
              ? undefined
              : "npm test -- src/long-session.test.ts",
          reason: input.failureReason,
          blockerKind,
        },
        reason: input.failureReason,
        blockerKind,
      },
      evidence: [`fixture-scenario:${input.scenario}`],
      failureBoundary: input.failureReason,
    },
  } as unknown as OrchestrationResult;
}
