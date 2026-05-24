import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMvpIntegratedFlow } from "./runMvpIntegratedFlow.js";
import { runAnchoredProposalRuntime, shouldActivateAnchoredProposalRuntimePrompt } from "./anchoredProposalRuntime.js";
import { activateTaskLifecycle } from "./taskLifecycleActivation.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anchored-proposal-runtime-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "src", "helper.ts"), "export function helperValue() { return 1; }\n");
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.ts"),
    "import { helperValue } from './helper.js';\nexport function targetThing() { return helperValue(); }\n",
  );
  await fs.writeFile(path.join(workspaceRoot, "src", "target.test.ts"), "import './target.js';\n");
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("runAnchoredProposalRuntime", () => {
  it("runs fake-provider exact anchored proposal runtime no-write", async () => {
    const activation = await buildReadyActivation();
    const current = await fs.readFile(path.join(workspaceRoot, "src", "target.ts"), "utf8");

    const result = await runAnchoredProposalRuntime({
      requestId: "route195-runtime",
      sessionId: "sess_route195_runtime",
      prompt: "fake anchored provider proposal dry-run for src/target.ts",
      taskActivation: activation,
      dryRunMode: "fake",
      currentContentByTargetLabel: new Map([["src/target.ts", current]]),
      inWorkspaceTargetLabels: ["src/target.ts"],
    });

    expect(result.status).toBe("runtime-handoff-ready-no-write");
    expect(result.dryRun?.providerCalled).toBe(true);
    expect(result.dryRun?.status).toBe("dry-run-exact-ready-no-write");
    expect(result.anchoredProposal?.handoffReadiness).toBe("exact-single-target");
    expect(result.changedFiles).toEqual([]);
    expect(result.evidence).toContain("anchored-proposal-runtime:provider-call-during-apply:not-run");
    expect(result.output).toContain("Review requirement: explicit-review-and-confirmation");
    expect(result.orchestrationResult?.codingResult?.changedFiles).toEqual([]);
  });

  it("keeps partial fake-provider output review-only no-write", async () => {
    const activation = await buildReadyActivation();
    const result = await runAnchoredProposalRuntime({
      requestId: "route195-partial",
      sessionId: "sess_route195_partial",
      prompt: "fake anchored provider proposal dry-run for src/target.ts",
      taskActivation: activation,
      dryRunMode: "fake",
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/target.ts", oldText: "targetThing" }],
        }),
      },
    });

    expect(result.status).toBe("runtime-review-required-no-write");
    expect(result.dryRun?.status).toBe("dry-run-review-required");
    expect(result.anchoredProposal?.handoffReadiness).toBe("review-only");
    expect(result.scorecard.noWriteStatus).toBe("pass");
  });

  it("stops before provider call when activation lacks dry-run mode", async () => {
    const activation = await buildActivation();
    const result = await runAnchoredProposalRuntime({
      requestId: "route195-none",
      sessionId: "sess_route195_none",
      prompt: "anchored provider proposal runtime",
      taskActivation: activation,
      dryRunMode: "none",
    });

    expect(result.status).toBe("runtime-stopped-no-write");
    expect(result.dryRun).toBeUndefined();
    expect(result.activation.decision).toBe("stop-no-dry-run-mode");
    expect(result.harnessTrace.providerDryRunCalled).toBe(false);
  });

  it("is reachable through the runMvp lifecycle prompt path for explicit fake anchored eval", async () => {
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_route195_runmvp",
      workspaceRoot,
      prompt: "Analyze src/target.ts and include fake anchored provider proposal runtime evaluation",
      providerMode: "synthetic",
      maxTurns: 2,
    });

    expect(result.finalOutput).toContain("anchored proposal runtime evaluated; mutation did not run.");
    expect(result.finalOutput).toContain("Activation decision: stop-low-plan-quality");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.evidence).toContain("anchored-proposal-runtime:mutation:not-run");
    expect(result.codingResult?.evidence).toContain("anchored-proposal-activation:decision:stop-low-plan-quality");
    expect(result.codingResult?.continuation.evidence.some((entry) =>
      entry.startsWith("anchored-proposal-scorecard "),
    )).toBe(true);
  });

  it("routes only explicit anchored proposal fake eval prompts", () => {
    expect(shouldActivateAnchoredProposalRuntimePrompt("Evaluate fake anchored provider proposal runtime dry-run")).toBe(true);
    expect(shouldActivateAnchoredProposalRuntimePrompt("Analyze src/target.ts and plan")).toBe(false);
  });
});

async function buildActivation() {
  const workflowPlan: WorkflowTaskPlan = {
    taskKind: "read-file",
    reason: "fake anchored provider proposal dry-run for src/target.ts",
    targetPath: "src/target.ts",
    contextPlanningRequested: true,
    contextPlanningReason: "explicit-context-packet",
    inspectFirst: true,
    verifyAfterEdit: false,
  };
  const activation = await activateTaskLifecycle({
    workspaceRoot,
    prompt: "Evaluate fake anchored provider proposal runtime dry-run for src/target.ts",
    workflowPlan,
  });
  if (!activation) throw new Error("expected task lifecycle activation");
  return activation;
}

async function buildReadyActivation() {
  const activation = await buildActivation();
  return {
    ...activation,
    analysisQualityGate: {
      ...activation.analysisQualityGate,
      allowed: true,
      decision: "allow-plan" as const,
    },
    planQuality: {
      ...activation.planQuality,
      level: "ready" as const,
    },
  };
}
