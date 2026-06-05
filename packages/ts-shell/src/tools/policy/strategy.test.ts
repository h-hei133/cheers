import { describe, expect, it } from "vitest";

import { selectContext } from "../../context/selection/model.js";
import { buildExecutionPlan } from "../../planning/execution/model.js";
import { buildTaskRequestPacket } from "../../provider/request/packet.js";
import { chooseToolStrategy } from "./strategy.js";

describe("tool strategy", () => {
  it("chooses repair and verification actions from a ready plan", () => {
    const context = selectContext({
      taskKind: "debug-repair",
      taskPath: "edit",
      shortPrompt: "Fix check.",
      workspaceFiles: [{ path: "src/check.ts", purpose: "target" }],
      requiredPaths: ["src/check.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "debug-repair",
      outputKind: "diff",
      allowedTools: ["read", "repair", "verify"],
      allowedWrites: ["src/check.ts"],
      successRubric: [],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Fix check.", taskKind: "debug-repair", context, plan });

    const strategy = chooseToolStrategy({ allowedTools: ["read", "repair", "verify"], plan, request });

    expect(strategy).toMatchObject({
      state: "ready",
      actions: expect.arrayContaining(["repair"]),
      nextAction: "repair",
      terminalSuccessClaim: false,
    });
    expect(strategy.actionPlans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "repair",
        proofContribution: "addresses preserved failure before recheck",
        fallbackAction: "search",
      }),
    ]));
  });

  it("chooses verify for changed-file proof gaps and stops when budget is exhausted", () => {
    const context = selectContext({
      taskKind: "coding-edit",
      taskPath: "edit",
      shortPrompt: "Update status mapper.",
      workspaceFiles: [
        { path: "src/status.ts", purpose: "target" },
        { path: "src/status.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/status.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "coding-edit",
      outputKind: "diff",
      allowedTools: ["read", "edit", "verify"],
      allowedWrites: ["src/status.ts"],
      successRubric: ["verify changed file"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Update status mapper.", taskKind: "coding-edit", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "edit", "verify"],
      plan,
      request,
      changedFiles: ["src/status.ts"],
      proofGap: ["changed files need verification proof"],
    }).nextAction).toBe("verify");

    expect(chooseToolStrategy({
      allowedTools: ["read", "edit", "verify"],
      plan,
      request,
      changedFiles: ["src/status.ts"],
      proofGap: ["changed files need verification proof"],
      budget: { remainingSteps: 0 },
    }).nextAction).toBe("stop-not-proven");
  });

  it("chooses discovery instead of repeating failed repair when context is missing", () => {
    const context = selectContext({
      taskKind: "debug-repair",
      taskPath: "edit",
      shortPrompt: "Fix import repair.",
      workspaceFiles: [{ path: "src/importer.ts", purpose: "target" }],
      requiredPaths: ["src/importer.ts"],
      continuationAvailable: true,
      failureCategories: ["missing context"],
    });
    const plan = buildExecutionPlan({
      taskKind: "debug-repair",
      outputKind: "diff",
      allowedTools: ["read", "search", "repair", "verify"],
      allowedWrites: ["src/importer.ts"],
      successRubric: ["repair", "verify"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Fix import repair.", taskKind: "debug-repair", context, plan });

    const strategy = chooseToolStrategy({
      allowedTools: ["read", "search", "repair", "verify"],
      plan,
      request,
      taskIntent: "Fix import repair.",
      proofGap: [...context.proofGap, "repair proof missing"],
      failureHistory: [{
        action: "repair",
        signature: "Fix import repair.",
        reason: "missing context for imported owner",
      }],
    });

    expect(strategy.nextAction).toBe("search");
    expect(strategy.actions).toEqual(expect.arrayContaining(["read", "repair", "verify"]));
  });

  it("chooses artifact when claims outnumber evidence receipts", () => {
    const context = selectContext({
      taskKind: "docs-report",
      taskPath: "artifact",
      shortPrompt: "Write report.",
      workspaceFiles: [
        { path: "notes/source.md", purpose: "source" },
        { path: "reports/summary.md", purpose: "target" },
      ],
      requiredPaths: ["reports/summary.md"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "docs-report",
      outputKind: "artifact",
      allowedTools: ["read", "write", "verify"],
      allowedWrites: ["reports/summary.md"],
      successRubric: ["artifact evidence"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Write report.", taskKind: "docs-report", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "write", "verify"],
      plan,
      request,
      artifactContract: {
        claims: ["source covered", "verification passed"],
        evidenceIds: ["source-receipt"],
      },
    }).nextAction).toBe("artifact");
  });

  it("resumes pending action before starting artifact correction", () => {
    const context = selectContext({
      taskKind: "data-artifact",
      taskPath: "artifact",
      shortPrompt: "Resume artifact verification.",
      workspaceFiles: [
        { path: "notes/source.md", purpose: "source" },
        { path: "reports/summary.md", purpose: "target" },
      ],
      requiredPaths: ["reports/summary.md"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "data-artifact",
      outputKind: "artifact",
      allowedTools: ["read", "artifact", "verify", "continue"],
      allowedWrites: ["reports/summary.md"],
      successRubric: ["artifact evidence"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Resume artifact verification.", taskKind: "data-artifact", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "artifact", "verify", "continue"],
      plan,
      request,
      pendingAction: "continue",
      artifactContract: {
        claims: ["source covered", "verification passed"],
        evidenceIds: ["source-receipt"],
      },
    }).nextAction).toBe("continue");
  });

  it("keeps artifact action when generic evidence does not cover every claim", () => {
    const context = selectContext({
      taskKind: "data-artifact",
      taskPath: "artifact",
      shortPrompt: "Validate artifact claims.",
      workspaceFiles: [
        { path: "notes/source.md", purpose: "source" },
        { path: "reports/summary.md", purpose: "target" },
      ],
      requiredPaths: ["reports/summary.md"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "data-artifact",
      outputKind: "artifact",
      allowedTools: ["read", "artifact", "verify"],
      allowedWrites: ["reports/summary.md"],
      successRubric: ["artifact evidence"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Validate artifact claims.", taskKind: "data-artifact", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "artifact", "verify"],
      plan,
      request,
      artifactContract: {
        claims: ["source covered", "verification passed"],
        evidenceIds: ["source-receipt", "generic-verification-output"],
        missingClaims: ["verification passed"],
      },
    }).nextAction).toBe("artifact");
  });

  it("collects claim evidence instead of repeating artifact action after artifact proof remains missing", () => {
    const context = selectContext({
      taskKind: "data-artifact",
      taskPath: "artifact",
      shortPrompt: "Validate artifact claims.",
      workspaceFiles: [
        { path: "notes/source.md", purpose: "source" },
        { path: "reports/summary.md", purpose: "target" },
      ],
      requiredPaths: ["reports/summary.md"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "data-artifact",
      outputKind: "artifact",
      allowedTools: ["read", "artifact", "verify"],
      allowedWrites: ["reports/summary.md"],
      successRubric: ["artifact evidence"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Validate artifact claims.", taskKind: "data-artifact", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "artifact", "verify"],
      plan,
      request,
      completedActions: ["artifact"],
      artifactContract: {
        claims: ["source covered", "verification passed"],
        evidenceIds: ["verification-receipt"],
        missingClaims: ["source covered"],
      },
    }).nextAction).toBe("read");
  });

  it("does not let an earlier read failure override pending verification", () => {
    const context = selectContext({
      taskKind: "coding-edit",
      taskPath: "edit",
      shortPrompt: "Verify changed status mapper.",
      workspaceFiles: [
        { path: "src/status.ts", purpose: "target" },
        { path: "src/status.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/status.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "coding-edit",
      outputKind: "diff",
      allowedTools: ["read", "search", "edit", "verify"],
      allowedWrites: ["src/status.ts"],
      successRubric: ["targeted verification"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Verify changed status mapper.", taskKind: "coding-edit", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "search", "edit", "verify"],
      plan,
      request,
      changedFiles: ["src/status.ts"],
      pendingAction: "verify",
      proofGap: ["changed files need verification proof"],
      observationFailures: [{
        action: "read",
        signature: "task_read_owner",
        reason: "tool result failed",
      }],
    }).nextAction).toBe("verify");
  });

  it("does not carry an unavailable pending action over a proof gap", () => {
    const context = selectContext({
      taskKind: "coding-edit",
      taskPath: "edit",
      shortPrompt: "Verify changed status mapper.",
      workspaceFiles: [
        { path: "src/status.ts", purpose: "target" },
        { path: "src/status.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/status.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "coding-edit",
      outputKind: "diff",
      allowedTools: ["read", "verify"],
      allowedWrites: ["src/status.ts"],
      successRubric: ["targeted verification"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Verify changed status mapper.", taskKind: "coding-edit", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "verify"],
      plan,
      request,
      changedFiles: ["src/status.ts"],
      pendingAction: "edit",
      proofGap: ["changed files need verification proof"],
    }).nextAction).toBe("verify");
  });

  it("uses discovery after a failed edit observation instead of repeating the same mutation", () => {
    const context = selectContext({
      taskKind: "coding-edit",
      taskPath: "edit",
      shortPrompt: "Update status mapper after failed mutation.",
      workspaceFiles: [
        { path: "src/status.ts", purpose: "target" },
        { path: "src/status.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/status.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "coding-edit",
      outputKind: "diff",
      allowedTools: ["read", "search", "edit", "verify"],
      allowedWrites: ["src/status.ts"],
      successRubric: ["targeted verification"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Update status mapper after failed mutation.", taskKind: "coding-edit", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "search", "edit", "verify"],
      plan,
      request,
      observationFailures: [{
        action: "edit",
        signature: "src/status.ts",
        reason: "tool result failed",
      }],
      proofGap: ["mutation did not apply"],
    }).nextAction).toBe("search");
  });

  it("switches from a repeated repair failure in history to discovery", () => {
    const context = selectContext({
      taskKind: "debug-repair",
      taskPath: "edit",
      shortPrompt: "Fix status mapper verification.",
      workspaceFiles: [
        { path: "src/status.ts", purpose: "target" },
        { path: "src/status.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/status.ts"],
      continuationAvailable: true,
      failureCategories: ["verification failed"],
    });
    const plan = buildExecutionPlan({
      taskKind: "debug-repair",
      outputKind: "diff",
      allowedTools: ["read", "search", "repair", "verify"],
      allowedWrites: ["src/status.ts"],
      successRubric: ["repair", "verify"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Fix status mapper verification.", taskKind: "debug-repair", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "search", "repair", "verify"],
      plan,
      request,
      proofGap: ["repair proof missing", "verification failed"],
      failureHistory: [{
        action: "repair",
        signature: "src/status.ts",
        reason: "same repair already failed against src/status.ts",
      }],
    }).nextAction).toBe("search");
  });

  it("rediscovers after failed search observation before mutation", () => {
    const context = selectContext({
      taskKind: "coding-edit",
      taskPath: "edit",
      shortPrompt: "Update status mapper after failed search.",
      workspaceFiles: [{ path: "src/status.ts", purpose: "target" }],
      requiredPaths: ["src/status.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "coding-edit",
      outputKind: "diff",
      allowedTools: ["read", "search", "edit", "verify"],
      allowedWrites: ["src/status.ts"],
      successRubric: ["targeted verification"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Update status mapper after failed search.", taskKind: "coding-edit", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "search", "edit", "verify"],
      plan,
      request,
      observationFailures: [{
        action: "search",
        signature: "status owner search",
        reason: "tool result failed",
      }],
      proofGap: ["context evidence incomplete"],
    }).nextAction).toBe("search");
  });

  it("collects source evidence after failed artifact observation instead of repeating stale artifact output", () => {
    const context = selectContext({
      taskKind: "data-artifact",
      taskPath: "artifact",
      shortPrompt: "Validate report claims.",
      workspaceFiles: [
        { path: "notes/source.md", purpose: "source" },
        { path: "reports/summary.md", purpose: "target" },
      ],
      requiredPaths: ["reports/summary.md"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "data-artifact",
      outputKind: "artifact",
      allowedTools: ["read", "artifact", "verify"],
      allowedWrites: ["reports/summary.md"],
      successRubric: ["artifact evidence"],
      context,
    });
    const request = buildTaskRequestPacket({ shortPrompt: "Validate report claims.", taskKind: "data-artifact", context, plan });

    expect(chooseToolStrategy({
      allowedTools: ["read", "artifact", "verify"],
      plan,
      request,
      completedActions: ["artifact"],
      observationFailures: [{
        action: "artifact",
        signature: "reports/summary.md",
        reason: "artifact output stale after source change",
      }],
      artifactContract: {
        claims: ["source covered"],
        evidenceIds: [],
        missingClaims: ["source covered"],
      },
    }).nextAction).toBe("read");
  });
});
