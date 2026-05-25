import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import { buildPlanningRuntimeProductProofInputs } from "./planningRuntimeProductExecution.js";
import { preparePlanningRuntimeProductProposal } from "./planningRuntimeProductProposal.js";
import { runPlanningRuntime } from "./planningRuntime.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("buildPlanningRuntimeProductProofInputs", () => {
  it("keeps the default product path review-only with no execution authority", () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
    });

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff: readyHandoff(),
    });

    expect(result.confirmation).toBeUndefined();
    expect(result.rawProposal).toBeUndefined();
    expect(result.workspace).toBeUndefined();
    expect(result.confirmationState).toBe("not-confirmed");
    expect(result.exactProposalState).toBe("missing");
    expect(result.controlledWorkspaceState).toBe("missing");
    expect(result.executionEvidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product:confirmation:not-confirmed",
        "planning-runtime-product:exact-proposal:missing",
        "planning-runtime-product:controlled-workspace:missing",
        "planning-runtime-product:confirmation-from-prompt:false",
        "planning-runtime-product:provider-call-during-confirmation:false",
        "planning-runtime-product:command-dispatch-during-confirmation:false",
      ]),
    );
  });

  it("builds controlled temp workspace proof inputs from explicit confirmation and exact proposal", () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
    });

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff: readyHandoff(),
      execution: {
        confirmation: { state: "trusted-confirmed" },
        rawProposal: exactProposal(),
        controlledWorkspace: {
          scope: "controlled-temp-workspace",
          source: "runtime-option",
        },
      },
    });

    expect(result.confirmation).toEqual({ state: "trusted-confirmed" });
    expect(result.rawProposal).toEqual(exactProposal());
    expect(result.workspace?.scope).toBe("controlled-temp-workspace");
    expect(result.currentContentByTargetPath?.get("src/planning/targetRanking.ts")).toBe(
      sourceContent(),
    );
    expect(result.expectedContentByTargetPath?.get("src/planning/targetRanking.ts")).toBe(
      expectedContent(),
    );
    expect(result.readVerifiedFile?.("src/planning/targetRanking.ts")).toBe(sourceContent());
    expect(result.controlledWorkspaceState).toBe("trusted-controlled-temp-workspace");
    expect(result.executionEvidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product:confirmation:trusted-confirmed",
        "planning-runtime-product:exact-proposal:provided",
        "planning-runtime-product:controlled-workspace:trusted-controlled-temp-workspace",
      ]),
    );
  });

  it("uses prepared product proposals without manual JSON", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
    });
    const handoff = readyHandoff();
    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff,
    });

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff,
      proposalPreparation,
      execution: {
        confirmation: { state: "not-confirmed" },
      },
    });

    expect(proposalPreparation.status).toBe("prepared-exact");
    expect(result.rawProposal?.operationKind).toBe("exact-fenced-replacement");
    expect(result.exactProposalSource).toBe("planning-runtime-deterministic");
    expect(result.providerCalled).toBe(false);
    expect(result.executionEvidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product-proposal:manual-json:not-required",
        "planning-runtime-product:exact-proposal-source:planning-runtime-deterministic",
        "planning-runtime-product:provider-called:false",
      ]),
    );
  });

  it("prepares exact proposals from product projection read evidence", async () => {
    const targetPath = "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts";
    const workspaceRoot = createWorkspace({
      [targetPath]: [
        "export function formatProductOutput() {",
        '  return [',
        '    "Planning runtime: product-path review-only handoff",',
        '  ].join("\\n");',
        "}",
        "",
      ].join("\n"),
    });
    const handoff = readyHandoffFor({
      targetPath,
      expectedChangeSummary:
        "Fix planning runtime product output so confirmed apply results do not still look review-only.",
    });

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff,
    });
    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff,
      proposalPreparation,
    });

    expect(proposalPreparation.status).toBe("prepared-exact");
    expect(proposalPreparation.source).toBe("planning-runtime-deterministic");
    expect(proposalPreparation.rawProposal?.targets?.[0]?.path).toBe(targetPath);
    expect(proposalPreparation.rawProposal?.targets?.[0]?.newText).toContain(
      "review-confirm-execute handoff",
    );
    expect(result.exactProposalSource).toBe("planning-runtime-deterministic");
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "planning-exact-proposal:source:planning-runtime-read-evidence",
        "planning-exact-proposal:old-anchor-count:1",
        "planning-runtime-product-proposal:deterministic:prepared-exact",
        "planning-runtime-product-proposal:manual-json:not-required",
      ]),
    );
    expect(JSON.stringify(proposalPreparation.evidence)).not.toContain(
      "Planning runtime: product-path review-only handoff",
    );
  });

  it("prepares exact proposals from repair-chain read evidence", async () => {
    const targetPath = "packages/ts-shell/src/orchestration/realTaskLoopRepairChain.ts";
    const workspaceRoot = createWorkspace({
      [targetPath]: [
        "export function evidence(applyResult: unknown) {",
        "  return [",
        '      "real-task-loop-repair:existing-exact-apply-lane",',
        '      ...(applyResult ? ["real-task-loop-repair:apply-route:existing-exact-lane"] : []),',
        "  ];",
        "}",
        "",
      ].join("\n"),
    });
    const handoff = readyHandoffFor({
      targetPath,
      expectedChangeSummary:
        "Improve repair loop result reporting so task results include provider anchor apply verification and repair status.",
    });

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff,
    });

    expect(proposalPreparation.status).toBe("prepared-exact");
    expect(proposalPreparation.rawProposal?.targets?.[0]?.path).toBe(targetPath);
    expect(proposalPreparation.rawProposal?.targets?.[0]?.newText).toContain(
      "result-reporting:anchor-apply-verification-repair",
    );
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "planning-exact-proposal:source:planning-runtime-read-evidence",
        "planning-exact-proposal:prepared-exact",
        "planning-runtime-product-proposal:provider-called:false",
      ]),
    );
  });

  it("keeps deterministic proposals review-only when read evidence is missing", async () => {
    const targetPath = "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts";
    const workspaceRoot = createWorkspace({
      [targetPath]: [
        'export const title = "Planning runtime: product-path review-only handoff";',
        "",
      ].join("\n"),
    });
    const handoff = buildPlanningMutationHandoffProjection({
      editTargets: [
        {
          path: targetPath,
          rationale: "repo score 99; primary-source-name-match",
          handoffRoute: "existing-proof-carrying-mutation-runtime",
          readiness: "ready-for-review",
        },
      ],
      missingFacts: [],
      taskKind: "edit-file",
      verificationIntentAvailable: true,
      expectedChangeSummary:
        "Fix planning runtime product output so confirmed apply results do not still look review-only.",
    });

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff,
    });

    expect(proposalPreparation.status).toBe("review-only");
    expect(proposalPreparation.rawProposal).toBeUndefined();
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "planning-exact-proposal:read-evidence:missing",
        "planning-runtime-product-proposal:deterministic:no-exact-proposal",
      ]),
    );
  });

  it("classifies live provider opt-in without approved attempts as config failed", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
    });
    const handoff = readyHandoff();

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff,
      liveProvider: { optIn: true, source: "runtime-option" },
    });

    expect(proposalPreparation.status).toBe("live-provider-config-failed");
    expect(proposalPreparation.providerCalled).toBe(false);
    expect(proposalPreparation.liveOptIn).toBe(true);
    expect(proposalPreparation.liveEvidenceSource).toBe("not-proven");
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product-proposal:live-provider-status:CONFIG-FAILED",
        "planning-runtime-product-proposal:live-provider-primary:not-run",
        "planning-runtime-product-proposal:live-provider-fallback:not-run",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ]),
    );
  });

  it("uses explicit fallback provider attempts without promoting fake evidence to live", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    });
    const planningResult = await readyPlanningResult(workspaceRoot);
    let primaryCalls = 0;
    let fallbackCalls = 0;

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: planningResult.mutationHandoff,
      planningResult,
      liveProvider: {
        optIn: true,
        source: "runtime-option",
        fallbackPolicy: {
          enabled: true,
          reason: "primary network failure may use configured fallback once",
        },
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "siliconflow-primary-cn",
            providerConfigSource: "approved-provider-env",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "siliconflow-primary-cn",
            },
            readinessStatus: "network",
            evidenceSource: "live-provider",
            provider: {
              proposeEdit: () => {
                primaryCalls += 1;
                return exactProposal();
              },
            },
          },
          {
            role: "fallback",
            providerSafeLabel: "focused-fake-fallback",
            providerConfigSource: "test-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-fallback",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: {
              proposeEdit: () => {
                fallbackCalls += 1;
                return exactProposal();
              },
            },
          },
        ],
      },
    });
    const proofInputs = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff: planningResult.mutationHandoff,
      proposalPreparation,
    });

    expect(primaryCalls).toBe(0);
    expect(fallbackCalls).toBe(1);
    expect(proposalPreparation.status).toBe("prepared-exact");
    expect(proposalPreparation.source).toBe("live-provider-proposal");
    expect(proposalPreparation.providerCalled).toBe(true);
    expect(proposalPreparation.liveEvidenceSource).toBe("fake-provider");
    expect(proofInputs.exactProposalSource).toBe("live-provider-proposal");
    expect(proofInputs.liveProviderEvidenceSource).toBe("fake-provider");
    expect(JSON.stringify(proposalPreparation.evidence)).not.toContain(TARGET_RANKING_OLD_TEXT);
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product-proposal:live-provider-fallback-policy:enabled",
        "planning-runtime-product-proposal:live-provider-primary:status:NETWORK-BLOCKED",
        "planning-runtime-product-proposal:live-provider-primary:provider-called:false",
        "planning-runtime-product-proposal:live-provider-fallback:provider-called:true",
        "planning-runtime-product-proposal:live-provider-fallback:evidence-source:fake-provider",
        "planning-runtime-product-proposal:live-provider-status:provider-called",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ]),
    );
  }, 15000);

  it("keeps provider-call failures typed and no-write", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    });
    const planningResult = await readyPlanningResult(workspaceRoot);

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: planningResult.mutationHandoff,
      planningResult,
      liveProvider: {
        optIn: true,
        source: "runtime-option",
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "focused-fake-primary",
            providerConfigSource: "test-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-primary",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: {
              proposeEdit: () => {
                throw new Error("network unreachable");
              },
            },
          },
        ],
      },
    });

    expect(proposalPreparation.status).toBe("live-provider-network-blocked");
    expect(proposalPreparation.providerCalled).toBe(true);
    expect(proposalPreparation.liveEvidenceSource).toBe("fake-provider");
    expect(proposalPreparation.rawProposal).toBeUndefined();
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "real-provider-proposal-dry-run:provider-error-class:network",
        "planning-runtime-product-proposal:live-provider-status:NETWORK-BLOCKED",
        "planning-runtime-product-proposal:provider-called:true",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ]),
    );
  }, 15000);

  it("preserves auth readiness as AUTH-FAILED before provider proposal calls", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    });
    const planningResult = await readyPlanningResult(workspaceRoot);
    let calls = 0;

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: planningResult.mutationHandoff,
      planningResult,
      liveProvider: {
        optIn: true,
        source: "runtime-option",
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "siliconflow-primary-cn",
            providerConfigSource: "approved-provider-env",
            providerAvailability: {
              kind: "request-blocked",
              reason: "provider-readiness:auth",
            },
            readinessStatus: "auth",
            evidenceSource: "live-provider",
            provider: {
              proposeEdit: () => {
                calls += 1;
                return exactProposal();
              },
            },
          },
        ],
      },
    });

    expect(calls).toBe(0);
    expect(proposalPreparation.status).toBe("live-provider-auth-failed");
    expect(proposalPreparation.providerCalled).toBe(false);
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product-proposal:live-provider-primary:status:AUTH-FAILED",
        "planning-runtime-product-proposal:live-provider-status:AUTH-FAILED",
        "planning-runtime-product-proposal:provider-called:false",
      ]),
    );
  }, 15000);

  it("does not promote unanchored exact provider output to prepared-exact", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    });
    const planningResult = await readyPlanningResult(workspaceRoot);
    fs.rmSync(path.join(workspaceRoot, "src", "planning", "targetRanking.ts"));

    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: planningResult.mutationHandoff,
      planningResult,
      liveProvider: {
        optIn: true,
        source: "runtime-option",
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "focused-fake-primary",
            providerConfigSource: "test-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-primary",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: {
              proposeEdit: () => exactProposal(),
            },
          },
        ],
      },
    });

    expect(proposalPreparation.status).toBe("review-only");
    expect(proposalPreparation.rawProposal?.operationKind).toBe("exact-fenced-replacement");
    expect(proposalPreparation.providerCalled).toBe(true);
    expect(proposalPreparation.evidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product-proposal:live-provider-primary:dry-run-status:dry-run-review-required",
        "planning-runtime-product-proposal:live-provider-anchor:review-only",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ]),
    );
  }, 15000);

  it("classifies live provider oldText misses and ambiguous anchors precisely", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": [
        "export function rankPlannerTargets(task: string) {",
        TARGET_RANKING_OLD_TEXT,
        TARGET_RANKING_OLD_TEXT,
        "}",
        "",
      ].join("\n"),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    });
    const planningResult = await readyPlanningResult(workspaceRoot);

    const multiple = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: planningResult.mutationHandoff,
      planningResult,
      liveProvider: {
        optIn: true,
        source: "runtime-option",
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "focused-fake-primary",
            providerConfigSource: "test-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-primary",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: {
              proposeEdit: () => exactProposal(),
            },
          },
        ],
      },
    });
    const missing = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: planningResult.mutationHandoff,
      planningResult,
      liveProvider: {
        optIn: true,
        source: "runtime-option",
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "focused-fake-primary",
            providerConfigSource: "test-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-primary",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: {
              proposeEdit: () => ({
                ...exactProposal(),
                targets: [
                  {
                    path: "src/planning/targetRanking.ts",
                    oldText: "missing old text",
                    newText: "replacement",
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    expect(multiple.status).toBe("live-provider-old-text-multiple-matches");
    expect(multiple.evidence).toContain(
      "planning-runtime-product-proposal:live-provider-status:OLD-TEXT-MULTIPLE-MATCHES",
    );
    expect(multiple.evidence).toContain(
      "planning-runtime-product-proposal:live-provider-primary:status:OLD-TEXT-MULTIPLE-MATCHES",
    );
    expect(missing.status).toBe("live-provider-old-text-not-found");
    expect(missing.evidence).toContain(
      "planning-runtime-product-proposal:live-provider-status:OLD-TEXT-NOT-FOUND",
    );
  }, 15000);

  it("builds selected workspace proof inputs only from explicit authority", async () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
    });
    const handoff = readyHandoff();
    const proposalPreparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff,
    });

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff,
      proposalPreparation,
      execution: {
        confirmation: { state: "trusted-confirmed" },
        selectedWorkspace: {
          scope: "selected-workspace",
          source: "runtime-option",
          explicitWorkspaceAuthority: true,
          allowedRoot: workspaceRoot,
        },
      },
    });

    expect(result.workspace?.scope).toBe("selected-workspace");
    expect(result.selectedWorkspaceState).toBe("trusted-selected-workspace");
    expect(result.controlledWorkspaceState).toBe("missing");
    expect(result.executionEvidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product:selected-workspace:trusted-selected-workspace",
        "planning-runtime-product:selected-workspace-source:runtime-option",
      ]),
    );
  });

  it("rejects explicit controlled authority outside temp or configured test roots", () => {
    const workspaceRoot = path.join(
      path.parse(process.cwd()).root,
      "private-agents-route210-not-temp",
    );

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff: readyHandoff(),
      execution: {
        confirmation: { state: "trusted-confirmed" },
        rawProposal: exactProposal(),
        controlledWorkspace: {
          scope: "controlled-temp-workspace",
          source: "runtime-option",
        },
      },
    });

    expect(result.workspace).toBeUndefined();
    expect(result.controlledWorkspaceState).toBe("rejected");
    expect(result.executionEvidence).toContain(
      "planning-runtime-product:controlled-workspace:rejected",
    );
  });
});

function readyHandoff() {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: "src/planning/targetRanking.ts",
        rationale: "repo score 99; primary-source-name-match",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    readEvidence: [
      {
        id: "read-evidence:context_engine_123:1",
        path: "src/planning/targetRanking.ts",
        reason: "target file",
        source: "repo-intelligence",
      },
    ],
  });
}

function readyHandoffFor(input: {
  readonly targetPath: string;
  readonly expectedChangeSummary: string;
}) {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: input.targetPath,
        rationale: "repo score 99; primary-source-name-match",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    contextReceipts: [
      {
        id: "context-receipt:ctx_mem_product:1",
        path: input.targetPath,
        summary: "planning runtime selected target summary",
        relevance: "target file",
      },
    ],
    readEvidence: [
      {
        id: "read-evidence:context_engine_product:1",
        path: input.targetPath,
        reason: "target file",
        source: "repo-intelligence",
      },
    ],
    expectedChangeSummary: input.expectedChangeSummary,
    verificationIntentSummary:
      "verificationPlan=readback; state=ready; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_product"],
  });
}

function exactProposal() {
  return {
    operationKind: "exact-fenced-replacement" as const,
    targets: [
      {
        path: "src/planning/targetRanking.ts",
        oldText: TARGET_RANKING_OLD_TEXT,
        newText: "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
      },
    ],
    verificationPlan: ["readback verifies controlled fixture final content"],
  };
}

async function readyPlanningResult(workspaceRoot: string) {
  const result = await runPlanningRuntime({
    workspaceRoot,
    userTask: "Fix the planner target ranking bug and cover the adjacent test",
    maxRepoFiles: 8,
    maxCandidates: 4,
    taskKindHint: "edit-file",
  });
  expect(result.status).toBe("ready-for-handoff");
  expect(result.mutationHandoff.handoffState).toBe("handoff-ready");
  expect(result.mutationHandoff.targetPaths).toEqual(["src/planning/targetRanking.ts"]);
  return result;
}

function createWorkspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "route210-product-exec-"));
  tempRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  return root;
}

function sourceContent(): string {
  return [
    "export function rankPlannerTargets(task: string) {",
    TARGET_RANKING_OLD_TEXT,
    "}",
    "",
  ].join("\n");
}

function expectedContent(): string {
  return [
    "export function rankPlannerTargets(task: string) {",
    "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
    "}",
    "",
  ].join("\n");
}

const TARGET_RANKING_OLD_TEXT =
  "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
