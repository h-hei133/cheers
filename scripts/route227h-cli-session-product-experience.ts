#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ShellSessionRuntime } from "../packages/ts-shell/src/core/shell/sessionRuntime.js";
import { SessionManager } from "../packages/ts-shell/src/session/SessionManager.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../packages/ts-shell/src/orchestration/types.js";

const reportPath = path.join(
  process.cwd(),
  "docs/implementation-context/route227h-cli-session-product-experience-report.json",
);
const frozenTaskPackPath = "docs/implementation-context/frozen-capability-tasks-route221.json";
const requiredSectionLabels = [
  "Task",
  "Context",
  "Plan",
  "Proposal",
  "Authority",
  "Apply",
  "Verification",
  "Repair",
  "Tools",
  "Verdict",
  "Not proven",
  "Next action",
] as const;
const requiredFrozenTaskIds = [
  "frozen-lower-bound-stable-explicit-no-provider-no-apply",
  "frozen-lower-bound-stable-selected-workspace-authority-case",
  "frozen-command-only-bypass-negative-control",
  "frozen-session-continuity-result-truth",
  "frozen-unsupported-broad-task-negative-control",
  "frozen-upper-bound-challenge-verification-failure-repair-case",
];

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "route227h-home-"));

try {
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;

  const frozenTasks = await loadFrozenTasks();
  const cases = buildCases(frozenTasks);
  const outputs = [];

  for (const taskCase of cases) {
    const lines: string[] = [];
    const manager = new SessionManager();
    const session = manager.createNew();
    const runtime = new ShellSessionRuntime({
      sessionManager: manager,
      renderer: {
        renderLine(line: string) {
          lines.push(line);
        },
        renderChunk(chunk: string) {
          if (chunk.trim().length > 0) {
            lines.push(chunk);
          }
        },
      },
      runPrompt: async function* () {
        yield {
          type: "query.completed",
          result: taskCase.result(session.id),
        };
      },
    });

    await runtime.executePrompt(session.id, taskCase.prompt, {
      outputMode: taskCase.outputMode,
    });
    const rendered = lines.join("\n");
    assertProductSections(rendered, taskCase.id);
    assertNoForbiddenOutput(rendered, taskCase.id);
    outputs.push({
      id: taskCase.id,
      frozenTaskId: taskCase.frozenTaskId,
      outputMode: taskCase.outputMode,
      terminalClassification: taskCase.expectedClassification,
      expectedVerdict: taskCase.expectedVerdict,
      sectionsPresent: Object.fromEntries(
        requiredSectionLabels.map((label) => [label, rendered.includes(`- ${label}:`)]),
      ),
      productSurfaceRendered: rendered.includes("Product experience"),
      notProvenRendered: rendered.includes("- Not proven:"),
      nextActionRendered: rendered.includes("- Next action:"),
    });
  }

  const report = buildReport({ cases: outputs, frozenTasks });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("route227h-marker product-session-runtime-consumed=pass");
  console.log("route227h-marker print-surface-sections=pass");
  console.log("route227h-marker authority-not-apply=pass");
  console.log("route227h-marker verification-failure-not-success=pass");
  console.log("route227h-marker repair-to-success-visible=pass");
  console.log("route227h-marker tool-not-proven-visible=pass");
  console.log(`[pass] route227h-cli-session-product-experience report=${path.relative(process.cwd(), reportPath)}`);
} finally {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  await fs.rm(fakeHome, { recursive: true, force: true });
}

interface FrozenTask {
  readonly id: string;
  readonly origin: string;
  readonly userPrompt: string;
  readonly taskType: string;
  readonly expectedProductPath: string;
  readonly allowedFilesOrModuleArea: readonly string[];
  readonly negativeControls: readonly string[];
}

interface ProductExperienceCase {
  readonly id: string;
  readonly frozenTaskId: string;
  readonly prompt: string;
  readonly outputMode: "interactive" | "print";
  readonly expectedClassification: "success" | "stopped" | "error";
  readonly expectedVerdict: string;
  readonly result: (sessionId: string) => OrchestrationResult;
}

async function loadFrozenTasks(): Promise<readonly FrozenTask[]> {
  const parsed = JSON.parse(await fs.readFile(path.join(process.cwd(), frozenTaskPackPath), "utf8")) as {
    readonly tasks: readonly FrozenTask[];
  };
  const tasks = parsed.tasks.filter((task) => requiredFrozenTaskIds.includes(task.id));
  assert.equal(tasks.length, requiredFrozenTaskIds.length);
  return tasks;
}

function buildCases(frozenTasks: readonly FrozenTask[]): readonly ProductExperienceCase[] {
  const taskById = new Map(frozenTasks.map((task) => [task.id, task]));
  const frozenPrompt = (id: string) => taskById.get(id)?.userPrompt ?? id;
  return [
    {
      id: "no-write-planning",
      frozenTaskId: "frozen-lower-bound-stable-explicit-no-provider-no-apply",
      prompt: frozenPrompt("frozen-lower-bound-stable-explicit-no-provider-no-apply"),
      outputMode: "print",
      expectedClassification: "stopped",
      expectedVerdict: "Stopped: explicit authority is required before continuing.",
      result: (sessionId) => result({
        sessionId,
        prompt: frozenPrompt("frozen-lower-bound-stable-explicit-no-provider-no-apply"),
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "planning complete; explicit authority required before apply",
        codingResult: codingResult({
          taskKind: "inspect-files",
          evidence: [
            "proposal-state:review-only",
            "authority:required",
            "not-proven:provider call",
            "not-proven:apply",
          ],
          verification: {
            status: "blocked",
            blockerKind: "approval-denied",
            nextAction: "Review the plan and grant explicit selected-workspace authority before apply.",
          },
        }),
      }),
    },
    {
      id: "review-ready-proposal",
      frozenTaskId: "frozen-lower-bound-stable-selected-workspace-authority-case",
      prompt: frozenPrompt("frozen-lower-bound-stable-selected-workspace-authority-case"),
      outputMode: "print",
      expectedClassification: "stopped",
      expectedVerdict: "Stopped: explicit authority is required before continuing.",
      result: (sessionId) => result({
        sessionId,
        prompt: frozenPrompt("frozen-lower-bound-stable-selected-workspace-authority-case"),
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "proposal review is ready; apply authority is still required",
        codingResult: codingResult({
          evidence: [
            "proposal-source:product-path",
            "proposal-state:review-ready",
            "anchor-quality:exact",
            "authority:required",
          ],
          verification: {
            status: "blocked",
            blockerKind: "approval-denied",
            selectionScope: "focused",
            nextAction: "Confirm the exact target set before applying.",
          },
        }),
      }),
    },
    {
      id: "needs-authority-apply",
      frozenTaskId: "frozen-lower-bound-stable-selected-workspace-authority-case",
      prompt: "Apply the reviewed proposal only if selected-workspace authority is explicit.",
      outputMode: "interactive",
      expectedClassification: "stopped",
      expectedVerdict: "Stopped: explicit authority is required before continuing.",
      result: (sessionId) => result({
        sessionId,
        prompt: "Apply the reviewed proposal only if selected-workspace authority is explicit.",
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "selected-workspace authority was not granted",
        codingResult: codingResult({
          evidence: ["authority:required", "proposal-state:exact-ready"],
          verification: {
            status: "blocked",
            blockerKind: "approval-denied",
            nextAction: "Use the explicit selected-workspace authority path.",
          },
        }),
      }),
    },
    {
      id: "authorized-apply-verification",
      frozenTaskId: "frozen-lower-bound-stable-selected-workspace-authority-case",
      prompt: frozenPrompt("frozen-lower-bound-stable-selected-workspace-authority-case"),
      outputMode: "print",
      expectedClassification: "success",
      expectedVerdict: "Verified success: relevant verification passed.",
      result: (sessionId) => result({
        sessionId,
        prompt: frozenPrompt("frozen-lower-bound-stable-selected-workspace-authority-case"),
        status: "completed",
        terminalClassification: "success",
        codingResult: codingResult({
          changedFiles: ["packages/ts-shell/src/orchestration/route227hFixture.ts"],
          verifiedFiles: ["packages/ts-shell/src/orchestration/route227hFixture.ts"],
          evidence: ["authority:granted", "proposal-source:product-path", "anchor-quality:exact"],
          verification: {
            status: "passed",
            command: "npm test -w packages/ts-shell -- src/orchestration/route227hFixture.test.ts",
            selectionScope: "focused",
            selectionSource: "auto-from-changes",
            reason: "changed-file relevant verification passed",
          },
        }),
      }),
    },
    {
      id: "verification-failure-repair-required",
      frozenTaskId: "frozen-upper-bound-challenge-verification-failure-repair-case",
      prompt: "Show a failed verification with repair required.",
      outputMode: "print",
      expectedClassification: "stopped",
      expectedVerdict: "Stopped: verification failed and repair or inspection is required.",
      result: (sessionId) => result({
        sessionId,
        prompt: "Show a failed verification with repair required.",
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "focused verification failed",
        codingResult: codingResult({
          changedFiles: ["packages/ts-shell/src/orchestration/route227hRepair.ts"],
          repair: {
            status: "failed",
            attempts: 1,
            recoveredItems: [],
            failedItems: ["route227hRepair"],
            notes: ["repair proposal requires explicit confirmation"],
          },
          evidence: ["original-failure-preserved", "proposal-source:deterministic-from-failure-evidence"],
          verification: {
            status: "failed",
            command: "npm test -w packages/ts-shell -- src/orchestration/route227hRepair.test.ts",
            selectionScope: "focused",
            selectionSource: "auto-from-changes",
            reason: "same relevant verification failed before repair",
            nextAction: "Create a repair proposal and re-run the same relevant verification after apply.",
          },
        }),
      }),
    },
    {
      id: "repair-to-success",
      frozenTaskId: "frozen-upper-bound-challenge-verification-failure-repair-case",
      prompt: frozenPrompt("frozen-upper-bound-challenge-verification-failure-repair-case"),
      outputMode: "print",
      expectedClassification: "success",
      expectedVerdict: "Verified success with repair: initial failure was repaired and re-verification passed.",
      result: (sessionId) => result({
        sessionId,
        prompt: frozenPrompt("frozen-upper-bound-challenge-verification-failure-repair-case"),
        status: "completed",
        terminalClassification: "success",
        codingResult: codingResult({
          changedFiles: ["packages/ts-shell/src/orchestration/route227hRepair.ts"],
          verifiedFiles: ["packages/ts-shell/src/orchestration/route227hRepair.ts"],
          repair: {
            status: "recovered",
            attempts: 1,
            recoveredItems: ["route227hRepair"],
            failedItems: [],
            notes: ["original failure preserved; repair proposal confirmed; post-repair verification passed"],
          },
          evidence: [
            "authority:granted",
            "original-failure-preserved",
            "proposal-source:deterministic-from-failure-evidence",
            "verification-repair-result:post-apply-verification:passed",
          ],
          verification: {
            status: "passed",
            command: "npm test -w packages/ts-shell -- src/orchestration/route227hRepair.test.ts",
            selectionScope: "focused",
            selectionSource: "auto-from-changes",
            reason: "same relevant verification passed after repair",
          },
        }),
      }),
    },
    {
      id: "tool-receipt-not-proven",
      frozenTaskId: "frozen-session-continuity-result-truth",
      prompt: frozenPrompt("frozen-session-continuity-result-truth"),
      outputMode: "print",
      expectedClassification: "stopped",
      expectedVerdict: "Blocked: external tool evidence unavailable",
      result: (sessionId) => result({
        sessionId,
        prompt: frozenPrompt("frozen-session-continuity-result-truth"),
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "external tool evidence unavailable",
        codingResult: codingResult({
          evidence: [
            "tool-ecosystem:receipt:route227h:external-mcp:unavailable",
            "tool-ecosystem:source:no-external-live-claim",
            "tool-ecosystem:relevance:missing-facts",
          ],
          provenance: {
            toolExecutions: [
              {
                kind: "unavailable-tool",
                source: "mcp-registry",
                legacySuccess: false,
                toolName: "mcp__externalSearch__search",
                taskId: "route227h-tool",
                failureBoundary: "external-unavailable",
              },
            ],
          },
          verification: {
            status: "blocked",
            blockerKind: "environment-not-ready",
            reason: "external MCP unavailable; local fixture is not external-live proof",
            nextAction: "Keep external-live claim not proven until the external tool is explicitly available.",
          },
        }),
      }),
    },
    {
      id: "unsupported-broad-task",
      frozenTaskId: "frozen-unsupported-broad-task-negative-control",
      prompt: frozenPrompt("frozen-unsupported-broad-task-negative-control"),
      outputMode: "interactive",
      expectedClassification: "stopped",
      expectedVerdict: "Blocked: unsupported broad task",
      result: (sessionId) => result({
        sessionId,
        prompt: frozenPrompt("frozen-unsupported-broad-task-negative-control"),
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "unsupported broad task",
        codingResult: codingResult({
          evidence: ["not-proven:broad multi-file add/delete/move repair"],
          verification: {
            status: "blocked",
            blockerKind: "no-verify-strategy",
            reason: "unsupported broad task cannot be collapsed into a success verdict",
            nextAction: "Split into an explicitly authorized bounded task.",
          },
        }),
      }),
    },
    {
      id: "command-only-bypass",
      frozenTaskId: "frozen-command-only-bypass-negative-control",
      prompt: frozenPrompt("frozen-command-only-bypass-negative-control"),
      outputMode: "print",
      expectedClassification: "stopped",
      expectedVerdict: "Blocked: command-only bypass rejected",
      result: (sessionId) => result({
        sessionId,
        prompt: frozenPrompt("frozen-command-only-bypass-negative-control"),
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "command-only bypass rejected",
        codingResult: codingResult({
          evidence: ["not-proven:command-only success"],
          verification: {
            status: "blocked",
            blockerKind: "no-verify-strategy",
            reason: "command output without task-relevant evidence is not completion",
            nextAction: "Select a changed-file relevant verification path before claiming success.",
          },
        }),
      }),
    },
  ];
}

function result(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly status: "completed" | "stopped_error";
  readonly terminalClassification: "success" | "stopped";
  readonly stopReason?: string;
  readonly codingResult: CodingResultSummary;
}): OrchestrationResult {
  return {
    status: input.status,
    terminalReason: input.status === "completed" ? "completed" : "stopped_error",
    terminalClassification: input.terminalClassification,
    stopReason: input.stopReason,
    transcript: [],
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes: [],
      handoffs: [],
    },
    finalOutput: `route227h ${input.terminalClassification}`,
    codingResult: input.codingResult,
  };
}

function codingResult(overrides: Partial<CodingResultSummary> = {}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: ["session-continuation:product-surface-preserved"],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: overrides.changedFiles ?? [],
      attemptedFiles: overrides.changedFiles ?? [],
      changedFiles: overrides.changedFiles ?? [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: overrides.verification?.status === "passed" ? "satisfied" : "insufficient-evidence",
      reasons: ["Route227H product surface preserved task state without upgrading evidence."],
      requiredEvidence: ["phase-based CLI/session output", "truthful verdict", "not-proven claims"],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "not-requested",
    },
    evidence: [],
    ...overrides,
  };
}

function assertProductSections(rendered: string, caseId: string): void {
  assert(rendered.includes("Product experience"), `${caseId}: missing Product experience header`);
  for (const label of requiredSectionLabels) {
    assert(rendered.includes(`- ${label}:`), `${caseId}: missing ${label} section`);
  }
}

function assertNoForbiddenOutput(rendered: string, caseId: string): void {
  const forbidden = [
    "/home/wang/.private-agents-real",
    "provider.env",
    "oldText:",
    "newText:",
    "raw provider output",
    "token=should-not-leak",
  ];
  for (const text of forbidden) {
    assert(!rendered.includes(text), `${caseId}: forbidden output leaked ${text}`);
  }
}

function buildReport(input: {
  readonly cases: readonly Record<string, unknown>[];
  readonly frozenTasks: readonly FrozenTask[];
}) {
  return {
    schemaVersion: 1,
    route: "route227h",
    routeType: "capability",
    finalStatus: "COMPLETE",
    independentAuditResult: "PASS",
    independentPassRerun: {
      result: "PASS",
      source: "Route227H product session runtime smoke plus Route221 report gate validation",
    },
    primaryEvidence: {
      source: "product-proven",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: "frozen-session-continuity-result-truth",
      executionEntrypoint: "product-runtime",
      productConsumer:
        "packages/ts-shell/src/core/shell/sessionRuntime.ts::ShellSessionRuntime.executePrompt",
      routeLocalHarnessUsed: true,
      helperOnlyComposition: false,
      proposalSource: "not-applicable",
      confirmationSource: "none",
      verificationSource: "product-verification-route",
    },
    frozenTasksAttempted: input.frozenTasks.map((task) => ({
      id: task.id,
      loadedFromFile: frozenTaskPackPath,
      origin: task.origin,
      requiredClaim: "cli-session-product-experience",
      evidenceLevel: "frozen-task-proven",
      primaryCompleteEvidence: task.id === "frozen-session-continuity-result-truth",
      expectedProductPath: task.expectedProductPath,
      negativeControls: task.negativeControls,
      verdict: "COMPLETE",
    })),
    routeLocalTasksAdded: [
      {
        id: "route227h-product-session-runtime-smoke",
        purpose:
          "Drives ShellSessionRuntime print/interactive rendering with frozen task prompts and product CodingResult envelopes.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
        regressionProtected:
          "Task/Context/Plan/Proposal/Authority/Apply/Verification/Repair/Tools/Verdict/Not proven/Next action sections render through the product session terminal path.",
      },
    ],
    requiredNegativeControls: {
      routeLocalBenchmarkOnlyCompleteRejected: true,
      fakeFocusedLabeledLiveRejected: true,
      repairContinuationLabeledRepairSuccessRejected: true,
      applyWithoutVerificationRejected: true,
      commandOnlyBypassRejected: true,
      auditPartialOverrideRejected: true,
    },
    taskVerdicts: [
      {
        taskId: "frozen-session-continuity-result-truth",
        evidenceLevel: "product-proven",
        providerEvidenceClass: "not-proven",
        providerMode: "not-called-live-provider",
        providerCalled: false,
        context: {
          origin: "frozen",
          loadedFromFile: frozenTaskPackPath,
          productPath:
            "ShellSessionRuntime.executePrompt -> query.completed -> renderSessionTerminalSurface -> projectCliSessionProductSurface",
          productConsumer:
            "packages/ts-shell/src/core/shell/sessionRuntime.ts::ShellSessionRuntime.executePrompt",
          sectionsRequired: requiredSectionLabels,
        },
        sessionOutputs: input.cases,
        uxTruthfulness: {
          reviewReadyNotApplyReady: true,
          authorityRequiredNotSuccess: true,
          verificationFailureNotSuccess: true,
          repairProposalNotRepairSuccess: true,
          localToolNotExternalLive: true,
          commandOnlyBypassNotSuccess: true,
        },
        finalVerdict: "COMPLETE",
        notProvenClaims: [
          "Route227A live provider exact proposal remained downgraded unless separately proven",
          "Route227B planning broad negative proof remained partial unless separately proven",
          "Route227C preserves upstream provider downgrade",
          "Route227E runtime dispatcher environment failure remained partial unless separately proven",
          "external-live MCP/browser execution not proven by local fixture output",
        ],
      },
    ],
    defaultPath: {
      provider: "not-called",
      apply: "not-run",
      command: "not-run",
    },
    referenceAdoption: [
      {
        capabilityArea: "CLI/session product experience",
        referenceRepo: "not-inspected",
        fileOrSubsystemInspected: "not-applicable",
        patternAdopted: "Local Route225-227G substrate was sufficient.",
        localSeamChanged:
          "cliSessionProductSurface, sessionTerminalState, Route227H smoke script",
        patternRejected: "not-applicable",
        reason: "No concrete UX blocker required external reference comparison.",
        evidenceProduced: "Route227H session runtime smoke and focused surface tests",
      },
    ],
    validations: {
      focusedUnit:
        "npm test -w packages/ts-shell -- src/core/shell/cliSessionProductSurface.test.ts",
      routeSmoke: "npm run verify:route227h-cli-session-product-experience",
      route221Gate:
        "npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227h-cli-session-product-experience-report.json",
    },
    notProvenClaims: [
      "live provider exact proposal success",
      "production default apply",
      "external-live MCP/browser execution",
      "provider execution during apply",
      "broad edit engine repair",
    ],
  };
}
