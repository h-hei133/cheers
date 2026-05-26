import { SandboxEnforcer } from "../sandbox/index.js";
import { ToolDispatcher } from "../tools/dispatcher.js";
import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher as ToolDispatcherType } from "../tools/dispatcher.js";
import {
  buildVerificationCommandPlan,
  type VerificationCommandPlan,
} from "./verificationCommandPlan.js";
import {
  runVerificationCommand,
  type VerificationCommandRun,
} from "./verificationCommandRunner.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";

export type VerificationAuthorityState =
  | "explicitly-approved"
  | "not-granted";

export interface TaskRelevantVerificationAuthority {
  readonly state: VerificationAuthorityState;
  readonly source: "explicit-authority-contract" | "none";
  readonly approvedCommand?: string;
}

export type CommandRelevanceStatus = "relevant" | "unrelated" | "not-selected";

export interface TaskRelevantCommandPlan {
  readonly changedFiles: readonly string[];
  readonly candidateCommands: readonly string[];
  readonly selectedCommand?: string;
  readonly relevanceStatus: CommandRelevanceStatus;
  readonly relevanceReason: string;
  readonly coveredFiles: readonly string[];
  readonly coveredPackageArea?: string;
  readonly commandRiskLevel: "low" | "medium";
  readonly approvalRequirement: "explicit-approval-required";
  readonly unrelatedCommandsInsufficientReason: string;
  readonly verificationCommandPlan: VerificationCommandPlan;
  readonly evidence: readonly string[];
}

export type TaskRelevantVerificationVerdict =
  | "verified"
  | "insufficient-evidence"
  | "verification-failed"
  | "approval-required";

export interface TaskRelevantVerificationResult {
  readonly taskId: string;
  readonly commandPlan: TaskRelevantCommandPlan;
  readonly authority: TaskRelevantVerificationAuthority;
  readonly dispatchStatus: "dispatched" | "not-run";
  readonly run?: VerificationCommandRun;
  readonly verdict: TaskRelevantVerificationVerdict;
  readonly resultSurface: OrchestrationResult;
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}

export async function runTaskRelevantVerificationRoute(input: {
  readonly workspaceRoot: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly prompt: string;
  readonly changedFiles: readonly string[];
  readonly candidateCommands?: readonly string[];
  readonly authority: TaskRelevantVerificationAuthority;
  readonly dispatcher?: ToolDispatcherType;
  readonly events?: QueryEvent[];
  readonly abortSignal?: AbortSignal;
}): Promise<TaskRelevantVerificationResult> {
  const commandPlan = buildTaskRelevantCommandPlan({
    changedFiles: input.changedFiles,
    candidateCommands: input.candidateCommands,
  });
  const canDispatch =
    commandPlan.relevanceStatus !== "not-selected" &&
    input.authority.state === "explicitly-approved" &&
    input.authority.approvedCommand === commandPlan.selectedCommand;

  const events = input.events ?? [];
  const dispatcher = input.dispatcher ?? createApprovedDispatcher({
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    authority: input.authority,
  });

  try {
    const run = canDispatch
      ? await runVerificationCommand({
          plan: commandPlan.verificationCommandPlan,
          dispatcher,
          events,
          taskId: input.taskId,
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          abortSignal: input.abortSignal,
        })
      : undefined;
    const verdict = classifyTaskVerdict({
      commandPlan,
      authority: input.authority,
      run,
    });
    const notProvenClaims = buildNotProvenClaims({ commandPlan, run, verdict });
    const evidence = [
      ...commandPlan.evidence,
      ...(run?.evidence ?? [
        "task-relevant-verification:dispatch:not-run",
      ]),
      `task-relevant-verification:authority:${input.authority.state}`,
      `task-relevant-verification:dispatch:${run ? "dispatched" : "not-run"}`,
      `task-relevant-verification:verdict:${verdict}`,
      "task-relevant-verification:provider-call:not-run",
      "task-relevant-verification:mutation:not-run",
    ];

    return {
      taskId: input.taskId,
      commandPlan,
      authority: input.authority,
      dispatchStatus: run ? "dispatched" : "not-run",
      ...(run ? { run } : {}),
      verdict,
      resultSurface: buildTaskRelevantVerificationSurface({
        sessionId: input.sessionId,
        prompt: input.prompt,
        commandPlan,
        run,
        verdict,
        notProvenClaims,
        evidence,
      }),
      notProvenClaims,
      evidence,
    };
  } finally {
    if (!input.dispatcher && dispatcher instanceof ToolDispatcher) {
      // The dispatcher owns a SandboxEnforcer internally; the enforcer is closed by
      // createApprovedDispatcher through the attached close hook below.
      (dispatcher as ToolDispatcher & { close?: () => void }).close?.();
    }
  }
}

export function buildTaskRelevantCommandPlan(input: {
  readonly changedFiles: readonly string[];
  readonly candidateCommands?: readonly string[];
}): TaskRelevantCommandPlan {
  const changedFiles = normalizeChangedFiles(input.changedFiles);
  const candidateCommands =
    input.candidateCommands && input.candidateCommands.length > 0
      ? input.candidateCommands.map((entry) => entry.trim()).filter(Boolean)
      : defaultCandidatesFor(changedFiles);
  const relevance = selectRelevantCommand(changedFiles, candidateCommands);
  const selectedCommand = relevance.selectedCommand ?? candidateCommands[0];
  const relevanceStatus =
    relevance.selectedCommand
      ? "relevant"
      : selectedCommand
        ? "unrelated"
        : "not-selected";
  const verificationCommandPlan = buildVerificationCommandPlan({
    explicitCommand: selectedCommand,
    expectedEvidence: [
      "runtime receipt marker",
      "command exit status",
      "changed-file relevance",
      ...changedFiles,
    ],
  });

  return {
    changedFiles,
    candidateCommands,
    ...(selectedCommand ? { selectedCommand } : {}),
    relevanceStatus,
    relevanceReason:
      relevanceStatus === "relevant"
        ? relevance.reason
        : relevanceStatus === "unrelated"
          ? "Selected command can run but does not inspect or cover the changed files."
          : "No verification command candidate was selected.",
    coveredFiles: relevance.coveredFiles,
    ...(relevance.coveredPackageArea ? { coveredPackageArea: relevance.coveredPackageArea } : {}),
    commandRiskLevel: "low",
    approvalRequirement: "explicit-approval-required",
    unrelatedCommandsInsufficientReason:
      "A zero exit code is not task verification unless the command covers the changed file or package area.",
    verificationCommandPlan,
    evidence: [
      `task-relevant-verification:changed-files:${changedFiles.join(",")}`,
      `task-relevant-verification:relevance:${relevanceStatus}`,
      ...(selectedCommand ? [`task-relevant-verification:selected-command:${selectedCommand}`] : []),
      ...relevance.evidence,
    ],
  };
}

function createApprovedDispatcher(input: {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly authority: TaskRelevantVerificationAuthority;
}): ToolDispatcher {
  const enforcer = new SandboxEnforcer({
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
  });
  enforcer.setEscalationPromptHandler(async (prompt) => {
    const approved =
      input.authority.state === "explicitly-approved" &&
      prompt.context.target === input.authority.approvedCommand;
    return {
      promptId: prompt.id,
      decision: approved ? "allow-once" : "deny",
      respondedAt: Date.now(),
      userComment: approved
        ? "Route223 explicit authority contract approved this exact verification command."
        : "Route223 authority contract did not approve this command.",
    };
  });
  const dispatcher = new ToolDispatcher(enforcer);
  (dispatcher as ToolDispatcher & { close?: () => void }).close = () => enforcer.close();
  return dispatcher;
}

function classifyTaskVerdict(input: {
  readonly commandPlan: TaskRelevantCommandPlan;
  readonly authority: TaskRelevantVerificationAuthority;
  readonly run?: VerificationCommandRun;
}): TaskRelevantVerificationVerdict {
  if (!input.run) {
    return input.authority.state === "explicitly-approved"
      ? "insufficient-evidence"
      : "approval-required";
  }
  if (input.commandPlan.relevanceStatus !== "relevant") {
    return "insufficient-evidence";
  }
  if (input.run.result.outcome === "success") {
    return "verified";
  }
  return "verification-failed";
}

function buildNotProvenClaims(input: {
  readonly commandPlan: TaskRelevantCommandPlan;
  readonly run?: VerificationCommandRun;
  readonly verdict: TaskRelevantVerificationVerdict;
}): readonly string[] {
  const claims = new Set<string>();
  if (input.commandPlan.relevanceStatus !== "relevant") {
    claims.add("task verification by unrelated command");
  }
  if (!input.run) {
    claims.add("selected command dispatch");
    claims.add("runtime receipt");
  }
  if (input.verdict !== "verified") {
    claims.add("task success");
  }
  claims.add("provider execution");
  claims.add("workspace mutation");
  return [...claims];
}

function buildTaskRelevantVerificationSurface(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly commandPlan: TaskRelevantCommandPlan;
  readonly run?: VerificationCommandRun;
  readonly verdict: TaskRelevantVerificationVerdict;
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}): OrchestrationResult {
  const verified = input.verdict === "verified";
  const verification = input.run?.result.verification ?? {
    status: input.verdict === "approval-required" ? "blocked" as const : "skipped" as const,
    ...(input.commandPlan.selectedCommand ? { command: input.commandPlan.selectedCommand } : {}),
    reason: input.commandPlan.relevanceReason,
    selectionScope: "focused" as const,
    selectionSource: "auto-from-changes" as const,
    nextAction:
      input.verdict === "approval-required"
        ? "Grant explicit command authority before dispatch."
        : "Dispatch a relevant verification command before claiming success.",
  };
  const failedReason = input.run?.result.failureSummary ?? input.commandPlan.relevanceReason;
  const codingResult: CodingResultSummary = {
    taskKind: "run-command",
    changedFiles: [...input.commandPlan.changedFiles],
    failedFiles: verified ? [] : [{ path: "(verification)", reason: failedReason }],
    repair: {
      status: input.verdict === "verification-failed" ? "failed" : "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: input.verdict === "verification-failed" ? [...input.commandPlan.changedFiles] : [],
      notes: input.verdict === "verification-failed" ? ["relevant verification command failed"] : [],
    },
    continuation: {
      status: verified ? "first-pass-success" : "failed-after-bounded-continuation",
      attempts: 0,
      evidence: [...input.evidence],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [...input.commandPlan.changedFiles],
      changedFiles: [...input.commandPlan.changedFiles],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: verified ? "satisfied" : "insufficient-evidence",
      reasons: [
        verified
          ? "Relevant verification command passed for the changed file set."
          : failedReason,
      ],
      requiredEvidence: [
        "changed files",
        "task-relevant command",
        "explicit approval",
        "runtime receipt",
      ],
      observedEvidence: [...input.evidence],
    },
    verifiedFiles: verified ? [...input.commandPlan.coveredFiles] : [],
    unverifiedFiles: verified
      ? []
      : input.commandPlan.changedFiles.map((file) => ({
          path: file,
          reason: failedReason,
        })),
    verification,
    evidence: [...input.evidence],
    ...(verified ? {} : { failureBoundary: `task-relevant-verification-${input.verdict}` }),
  };

  const finalOutput = [
    `task-relevant verification ${input.verdict}.`,
    `Command: ${input.commandPlan.selectedCommand ?? "(none)"}`,
    `Relevance: ${input.commandPlan.relevanceStatus}`,
    `Runtime receipts: ${input.run?.result.runtimeReceiptMarkers.length ?? 0}`,
    `Not proven: ${input.notProvenClaims.join(", ")}`,
    "Raw output: excluded",
  ].join("\n");

  return {
    status: verified ? "completed" : "stopped_error",
    terminalReason: verified ? "completed" : "stopped_error",
    terminalClassification: verified ? "success" : "stopped",
    ...(verified ? {} : { stopReason: failedReason }),
    transcript: [{ role: "coder", content: finalOutput, codingResult }],
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes: [],
      handoffs: [],
    },
    finalOutput,
    codingResult,
  };
}

function selectRelevantCommand(
  changedFiles: readonly string[],
  candidates: readonly string[],
): {
  readonly selectedCommand?: string;
  readonly reason: string;
  readonly coveredFiles: readonly string[];
  readonly coveredPackageArea?: string;
  readonly evidence: readonly string[];
} {
  for (const command of candidates) {
    const relevance = commandRelevance(command, changedFiles);
    if (relevance.coveredFiles.length > 0) {
      return {
        selectedCommand: command,
        reason: relevance.reason,
        coveredFiles: relevance.coveredFiles,
        ...(relevance.coveredPackageArea ? { coveredPackageArea: relevance.coveredPackageArea } : {}),
        evidence: [
          `task-relevant-verification:covered-files:${relevance.coveredFiles.join(",")}`,
          ...(relevance.coveredPackageArea
            ? [`task-relevant-verification:covered-package:${relevance.coveredPackageArea}`]
            : []),
        ],
      };
    }
  }
  return {
    reason: "No candidate command covers the changed files.",
    coveredFiles: [],
    evidence: ["task-relevant-verification:covered-files:none"],
  };
}

function commandRelevance(
  command: string,
  changedFiles: readonly string[],
): {
  readonly reason: string;
  readonly coveredFiles: readonly string[];
  readonly coveredPackageArea?: string;
} {
  if (command === "npm run build -w packages/ts-shell") {
    const coveredFiles = changedFiles.filter((file) => file.startsWith("packages/ts-shell/"));
    return {
      reason: "ts-shell package build covers changed files under packages/ts-shell.",
      coveredFiles,
      coveredPackageArea: coveredFiles.length > 0 ? "packages/ts-shell" : undefined,
    };
  }

  if (command.startsWith("npm test -w packages/ts-shell -- src/orchestration/")) {
    const coveredFiles = changedFiles.filter((file) =>
      file.startsWith("packages/ts-shell/src/orchestration/"),
    );
    return {
      reason: "focused ts-shell orchestration test covers orchestration changed files.",
      coveredFiles,
      coveredPackageArea: coveredFiles.length > 0 ? "packages/ts-shell/src/orchestration" : undefined,
    };
  }

  return {
    reason: "Command has no changed-file coverage rule.",
    coveredFiles: [],
  };
}

function defaultCandidatesFor(changedFiles: readonly string[]): readonly string[] {
  if (changedFiles.some((file) => file.startsWith("packages/ts-shell/"))) {
    return ["npm run build -w packages/ts-shell"];
  }
  return [];
}

function normalizeChangedFiles(changedFiles: readonly string[]): readonly string[] {
  return [...new Set(changedFiles.map((file) => file.replace(/\\/g, "/").trim()).filter(Boolean))];
}
