import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EscalationPrompt } from "./approval/contract.js";
import type {
  ApprovalEvaluation,
  PersistedApprovalGrant,
} from "./approvalTrustPolicy.js";
import { ApprovalTrustPolicy } from "./approvalTrustPolicy.js";
import { applyInteractiveApprovalDecisionWiring } from "./interactiveApprovalWiring.js";

function buildPrompt(target: string): EscalationPrompt {
  return {
    id: "esc_test",
    title: "Permission escalation required",
    message: "test",
    context: {
      toolName: "bash",
      operation: "spawn",
      target,
    },
    options: [],
    defaultOption: "deny",
    recommendedAction: "allow once",
    severity: "low",
  };
}

function buildEvaluation(cacheKey: string): ApprovalEvaluation {
  return {
    cacheKey,
    scopeLabel: "bash/spawn/process(node)",
    matchedGrant: undefined,
    projectScopedCandidates: [],
    sameOperationCandidates: [],
  };
}

describe("applyInteractiveApprovalDecisionWiring", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("does not store future authority for interactive allow-once decisions", () => {
    const rememberAllowOnce = vi.fn();
    const rememberAllowAlways = vi.fn();
    const trustPolicy = {
      rememberAllowOnce,
      rememberAllowAlways,
    } as unknown as ApprovalTrustPolicy;

    const result = applyInteractiveApprovalDecisionWiring({
      decision: "allow-once",
      prompt: buildPrompt("node --version"),
      projectRoot: "D:/Test/allow-once-interactive",
      evaluation: buildEvaluation("d:/test|bash:spawn:process:node"),
      trustPolicy,
    });

    expect(rememberAllowOnce).not.toHaveBeenCalled();
    expect(rememberAllowAlways).not.toHaveBeenCalled();
    expect(result.persistedGrant).toBeUndefined();
  });

  it("leaves no consumable grant after applying the current allow-once answer", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-once-"));
    tempDirs.push(tempDir);
    const policyPath = path.join(tempDir, "approval-policy.json");
    const trustPolicy = new ApprovalTrustPolicy(policyPath);
    const evaluation = buildEvaluation("d:/test|bash:spawn:process:node");

    applyInteractiveApprovalDecisionWiring({
      decision: "allow-once",
      prompt: buildPrompt("node --version"),
      projectRoot: "D:/Test/allow-once-interactive",
      evaluation,
      trustPolicy,
    });

    expect(trustPolicy.hasAllowOnce(evaluation.cacheKey)).toBe(false);
    expect(trustPolicy.consumeAllowOnce(evaluation.cacheKey)).toBe(false);
  });

  it("persists trust grant for interactive allow-always decisions", () => {
    const persistedGrant: PersistedApprovalGrant = {
      projectRoot: "d:/test/allow-once-interactive",
      toolName: "bash",
      operation: "spawn",
      scopeKey: "bash:spawn:process:node",
      scopeLabel: "bash/spawn/process(node)",
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
    };
    const rememberAllowOnce = vi.fn();
    const rememberAllowAlways = vi.fn().mockReturnValue(persistedGrant);
    const trustPolicy = {
      rememberAllowOnce,
      rememberAllowAlways,
    } as unknown as ApprovalTrustPolicy;

    const result = applyInteractiveApprovalDecisionWiring({
      decision: "allow-always",
      prompt: buildPrompt("node --version"),
      projectRoot: "D:/Test/allow-once-interactive",
      evaluation: buildEvaluation("d:/test|bash:spawn:process:node"),
      trustPolicy,
    });

    expect(rememberAllowAlways).toHaveBeenCalledTimes(1);
    expect(rememberAllowOnce).not.toHaveBeenCalled();
    expect(result.persistedGrant).toEqual(persistedGrant);
  });
});
