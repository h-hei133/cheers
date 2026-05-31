import { SandboxEnforcer } from "../sandbox/index.js";
import { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher as ToolDispatcherType } from "../tools/dispatch/dispatcher.js";
import { isAllowlistedRunCommand } from "../orchestration/capabilityBoundaryProjection.js";
import {
  buildVerificationCommandPlan,
  type VerificationCommandPlan,
} from "./command/plan.js";
import {
  runVerificationCommand,
  type VerificationCommandRun,
} from "../orchestration/verificationCommandRunner.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../orchestration/types.js";
import {
  projectVerificationReceipt,
  type ProductVerificationReceipt,
} from "./verificationFacade.js";

export type VerificationAuthorityState =
  | "explicitly-approved"
  | "not-granted";

export interface TaskRelevantVerificationAuthority {
  readonly state: VerificationAuthorityState;
  readonly source: "explicit-authority-contract" | "none";
  readonly approvedCommand?: string;
}

export type CommandRelevanceStatus = "relevant" | "unrelated" | "not-selected";
export type VerificationCoverageStatus = "covered" | "partially-covered" | "uncovered";
export type VerificationLadderKind =
  | "focused-test"
  | "package-test"
  | "package-build"
  | "typecheck"
  | "content-readback"
  | "blocked";

export interface VerificationLadderStep {
  readonly kind: VerificationLadderKind;
  readonly command?: string;
  readonly state: "selected" | "skipped" | "blocked";
  readonly reason: string;
  readonly coveredFiles: readonly string[];
  readonly riskLevel: "low" | "medium";
  readonly approvalRequirement: "explicit-approval-required" | "not-applicable";
  readonly fallbackReason?: string;
  readonly evidence: readonly string[];
}

export interface PerFileVerificationCoverage {
  readonly path: string;
  readonly status: "covered" | "uncovered";
  readonly command?: string;
  readonly reason: string;
}

export interface TaskRelevantCommandPlan {
  readonly changedFiles: readonly string[];
  readonly candidateCommands: readonly string[];
  readonly selectedCommand?: string;
  readonly verificationLadder: readonly VerificationLadderStep[];
  readonly relevanceStatus: CommandRelevanceStatus;
  readonly relevanceReason: string;
  readonly coveredFiles: readonly string[];
  readonly uncoveredFiles: readonly string[];
  readonly coverageStatus: VerificationCoverageStatus;
  readonly perFileCoverage: readonly PerFileVerificationCoverage[];
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
  | "blocked"
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
  readonly productVerification: ProductVerificationReceipt;
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
      `task-relevant-verification:dispatch:${run?.toolResult ? "dispatched" : "not-run"}`,
      `task-relevant-verification:verdict:${verdict}`,
      "task-relevant-verification:provider-call:not-run",
      "task-relevant-verification:mutation:not-run",
    ];
    const productVerification = projectVerificationReceipt({
      selectedCommand: commandPlan.selectedCommand,
      authority: input.authority.state,
      dispatchStatus: run?.toolResult ? "dispatched" : "not-run",
      runtimeStatus: run?.result.outcome,
      relevanceStatus: commandPlan.relevanceStatus,
      coverageStatus: commandPlan.coverageStatus,
      coveredFiles: commandPlan.coveredFiles,
      uncoveredFiles: commandPlan.uncoveredFiles,
      failureClass: run?.result.failureClassification?.failureClass,
      notProvenClaims,
      verdictStatus: verdict,
    });

    return {
      taskId: input.taskId,
      commandPlan,
      authority: input.authority,
      dispatchStatus: run?.toolResult ? "dispatched" : "not-run",
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
      productVerification,
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
  const verificationLadder = buildVerificationLadder({
    changedFiles,
    candidateCommands,
  });
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
      "per-file verification coverage",
      ...changedFiles,
    ],
  });
  const coverage = buildCoverage({
    changedFiles,
    coveredFiles: relevance.coveredFiles,
    ...(selectedCommand ? { selectedCommand } : {}),
  });

  return {
    changedFiles,
    candidateCommands,
    ...(selectedCommand ? { selectedCommand } : {}),
    verificationLadder,
    relevanceStatus,
    relevanceReason:
      relevanceStatus === "relevant"
        ? relevance.reason
        : relevanceStatus === "unrelated"
          ? "Selected command can run but does not inspect or cover the changed files."
          : "No verification command candidate was selected.",
    coveredFiles: relevance.coveredFiles,
    uncoveredFiles: coverage.uncoveredFiles,
    coverageStatus: coverage.coverageStatus,
    perFileCoverage: coverage.perFileCoverage,
    ...(relevance.coveredPackageArea ? { coveredPackageArea: relevance.coveredPackageArea } : {}),
    commandRiskLevel: "low",
    approvalRequirement: "explicit-approval-required",
    unrelatedCommandsInsufficientReason:
      "A zero exit code is not task verification unless the command covers the changed file or package area.",
    verificationCommandPlan,
    evidence: [
      `task-relevant-verification:changed-files:${changedFiles.join(",")}`,
      `task-relevant-verification:relevance:${relevanceStatus}`,
      `task-relevant-verification:coverage:${coverage.coverageStatus}`,
      `task-relevant-verification:uncovered-files:${coverage.uncoveredFiles.join(",") || "none"}`,
      ...(selectedCommand ? [`task-relevant-verification:selected-command:${selectedCommand}`] : []),
      ...verificationLadder.flatMap((step) => step.evidence),
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
  if (input.run.result.outcome === "blocked" || input.run.result.outcome === "skipped") {
    return "blocked";
  }
  if (input.commandPlan.relevanceStatus !== "relevant") {
    return "insufficient-evidence";
  }
  if (input.commandPlan.coverageStatus !== "covered") {
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
  if (input.commandPlan.coverageStatus !== "covered") {
    claims.add("full changed-file verification coverage");
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
  const relevantFailure = input.verdict === "verification-failed";
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
      status: relevantFailure ? "failed" : "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: relevantFailure ? [...input.commandPlan.changedFiles] : [],
      notes: relevantFailure
        ? [
            "relevant verification command failed",
            "repair-required handoff evidence available",
          ]
        : [],
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
      : input.commandPlan.uncoveredFiles.length > 0
        ? input.commandPlan.uncoveredFiles.map((file) => ({
            path: file,
            reason: "No selected verification command covered this changed file.",
          }))
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
    `Coverage: ${input.commandPlan.coverageStatus}`,
    `Covered files: ${input.commandPlan.coveredFiles.join(", ") || "none"}`,
    `Uncovered files: ${input.commandPlan.uncoveredFiles.join(", ") || "none"}`,
    `Failure class: ${input.run?.result.failureClassification?.failureClass ?? "(none)"}`,
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

function buildVerificationLadder(input: {
  readonly changedFiles: readonly string[];
  readonly candidateCommands: readonly string[];
}): readonly VerificationLadderStep[] {
  const focused = input.candidateCommands.find((command) =>
    isFocusedTsShellTestCommand(command),
  );
  const packageBuild = input.candidateCommands.find((command) =>
    command === "npm run build -w packages/ts-shell",
  );
  const steps: VerificationLadderStep[] = [];
  steps.push(ladderStep({
    kind: "focused-test",
    selected: Boolean(focused),
    changedFiles: input.changedFiles,
    reason: focused
      ? "Focused test command selected from changed-file/test adjacency."
      : "No allowlisted focused test was available for the changed files.",
    ...(focused ? { command: focused } : {}),
  }));
  steps.push(ladderStep({
    kind: "package-build",
    selected: !focused && Boolean(packageBuild),
    changedFiles: input.changedFiles,
    reason: packageBuild
      ? "Package build is available as the typecheck/build fallback."
      : "No package build fallback is available for this changed-file set.",
    ...(packageBuild ? { command: packageBuild } : {}),
    ...(focused ? { fallbackReason: "Skipped because a focused test candidate had higher confidence." } : {}),
  }));
  if (!focused && !packageBuild) {
    steps.push(ladderStep({
      kind: "blocked",
      selected: true,
      changedFiles: input.changedFiles,
      reason: "No task-relevant allowlisted verification command exists.",
    }));
  }
  return steps;
}

function ladderStep(input: {
  readonly kind: VerificationLadderKind;
  readonly command?: string;
  readonly selected: boolean;
  readonly changedFiles: readonly string[];
  readonly reason: string;
  readonly fallbackReason?: string;
}): VerificationLadderStep {
  const relevance = input.command
    ? commandRelevance(input.command, input.changedFiles)
    : { coveredFiles: [] as readonly string[] };
  return {
    kind: input.kind,
    ...(input.command ? { command: input.command } : {}),
    state: input.selected ? "selected" : input.command ? "skipped" : "blocked",
    reason: input.reason,
    coveredFiles: relevance.coveredFiles,
    riskLevel: "low",
    approvalRequirement: input.command ? "explicit-approval-required" : "not-applicable",
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
    evidence: [
      `verification-ladder:${input.kind}:${input.selected ? "selected" : input.command ? "skipped" : "blocked"}`,
      ...(input.command ? [`verification-ladder:${input.kind}:command:${input.command}`] : []),
      `verification-ladder:${input.kind}:covered:${relevance.coveredFiles.join(",") || "none"}`,
    ],
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

  if (isFocusedTsShellTestCommand(command)) {
    const testPath = focusedTestTargetFromCommand(command);
    const coveredFiles = changedFiles.filter((file) =>
      focusedTestCoversFile({ testPath, changedFile: file }),
    );
    const coveredPackageArea = testPath.startsWith("src/verification/")
      ? "packages/ts-shell/src/verification"
      : "packages/ts-shell/src/orchestration";
    return {
      reason: "focused ts-shell test covers the matching changed file/test pair.",
      coveredFiles,
      coveredPackageArea: coveredFiles.length > 0 ? coveredPackageArea : undefined,
    };
  }

  return {
    reason: "Command has no changed-file coverage rule.",
    coveredFiles: [],
  };
}

function focusedTestTargetFromCommand(command: string): string {
  const rawTarget = command.slice("npm test -w packages/ts-shell -- ".length).trim();
  return rawTarget.split(/\s+-t\s+/)[0] ?? rawTarget;
}

function isFocusedTsShellTestCommand(command: string): boolean {
  return command.startsWith("npm test -w packages/ts-shell -- src/verification/") ||
    command.startsWith("npm test -w packages/ts-shell -- src/orchestration/");
}

function defaultCandidatesFor(changedFiles: readonly string[]): readonly string[] {
  const focused = focusedTestCandidatesFor(changedFiles);
  if (changedFiles.some((file) => file.startsWith("packages/ts-shell/"))) {
    return [...focused, "npm run build -w packages/ts-shell"];
  }
  return [...focused];
}

function normalizeChangedFiles(changedFiles: readonly string[]): readonly string[] {
  return [...new Set(changedFiles.map((file) => file.replace(/\\/g, "/").trim()).filter(Boolean))];
}

function focusedTestCandidatesFor(changedFiles: readonly string[]): readonly string[] {
  return [...new Set(changedFiles.flatMap((file) => {
    const normalized = file.replace(/^packages\/ts-shell\//, "");
    if (!normalized.startsWith("src/verification/")) return [];
    const testPath = normalized.endsWith(".test.ts")
      ? normalized
      : normalized.replace(/\.ts$/, ".test.ts");
    if (testPath === normalized || testPath.endsWith(".test.ts")) {
      const command = `npm test -w packages/ts-shell -- ${testPath}`;
      return isAllowlistedRunCommand(command) ? command : [];
    }
    return [];
  }))];
}

function focusedTestCoversFile(input: {
  readonly testPath: string;
  readonly changedFile: string;
}): boolean {
  const changed = input.changedFile.replace(/^packages\/ts-shell\//, "");
  if (changed === input.testPath) return true;
  if (!input.testPath.endsWith(".test.ts")) return false;
  const implementationPath = input.testPath.replace(/\.test\.ts$/, ".ts");
  return changed === implementationPath;
}

function buildCoverage(input: {
  readonly changedFiles: readonly string[];
  readonly coveredFiles: readonly string[];
  readonly selectedCommand?: string;
}): {
  readonly coverageStatus: VerificationCoverageStatus;
  readonly uncoveredFiles: readonly string[];
  readonly perFileCoverage: readonly PerFileVerificationCoverage[];
} {
  const covered = new Set(input.coveredFiles);
  const uncoveredFiles = input.changedFiles.filter((file) => !covered.has(file));
  const coverageStatus =
    input.changedFiles.length > 0 && uncoveredFiles.length === 0
      ? "covered"
      : input.coveredFiles.length > 0
        ? "partially-covered"
        : "uncovered";
  return {
    coverageStatus,
    uncoveredFiles,
    perFileCoverage: input.changedFiles.map((file) => {
      const isCovered = covered.has(file);
      return {
        path: file,
        status: isCovered ? "covered" as const : "uncovered" as const,
        ...(isCovered && input.selectedCommand ? { command: input.selectedCommand } : {}),
        reason: isCovered
          ? "Selected verification command covers this changed file."
          : "Selected verification command does not cover this changed file.",
      };
    }),
  };
}
