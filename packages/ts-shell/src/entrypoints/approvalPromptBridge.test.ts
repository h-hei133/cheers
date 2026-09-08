import { describe, expect, it, vi } from "vitest";
import { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import type { EscalationPrompt } from "../sandbox/index.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { createCliEscalationPromptHandler } from "./cliApprovalModule.js";
import {
  createApprovalResponse,
  formatApprovalConflictResolutionLine,
  formatApprovalDecisionLine,
  formatApprovalObjectLine,
  formatApprovalPromptDecisionMenuLine,
  formatDefaultNonInteractiveDenyLine,
  formatExplicitApprovalComment,
  formatInteractiveApprovalComment,
  formatInteractiveBlockedComment,
  formatNonInteractiveApprovalComment,
  formatNonInteractiveApprovalPolicyLine,
  formatNonInteractiveBlockedComment,
  formatTrustPolicyUpdatedLine,
  renderApprovalAuditSurface,
  renderApprovalRequiredSurface,
  renderCachedApprovalSurface,
} from "./approvalPromptBridge.js";

function createPrompt(): EscalationPrompt {
  return {
    id: "approval_prompt_1",
    severity: "high",
    recommendedAction: "deny",
    message: "Tool wants to run a command.",
    context: {
      toolName: "shell",
      operation: "execute",
      target: "npm test",
    },
  };
}

class CapturingRenderer extends StreamingRenderer {
  readonly lines: string[] = [];

  override renderLine(line: string): void {
    this.lines.push(line);
  }
}

function createRenderer(): CapturingRenderer {
  return new CapturingRenderer();
}

describe("approval prompt bridge", () => {
  it("renders approval-required prompt facts and appended surface lines", () => {
    const renderer = createRenderer();

    renderApprovalRequiredSurface(renderer, {
      prompt: createPrompt(),
      includeRisk: true,
      decisionSource: "default-deny",
      lines: ["- Trust boundary project: coding-agents"],
    });

    expect(renderer.lines).toEqual([
      "\nApproval",
      "- Mode: user confirmation required",
      "- Tool: shell",
      "- Action: execute",
      "- Target: npm test",
      "- Risk: high",
      "- Decision source: default-deny",
      "- Trust boundary project: coding-agents",
    ]);
  });

  it("renders cached approval facts without changing decision wording", () => {
    const renderer = createRenderer();

    renderCachedApprovalSurface(renderer, {
      prompt: createPrompt(),
      lines: ["- Decision: allow-always (project policy match)"],
    });

    expect(renderer.lines).toEqual([
      "\nApproval",
      "- Mode: cached grant",
      "- Tool: shell",
      "- Action: execute",
      "- Target: npm test",
      "- Decision: allow-always (project policy match)",
    ]);
  });

  it("formats approval provenance and decision lines exactly", () => {
    expect(
      formatApprovalObjectLine("Non-interactive", {
        mode: "allow-once",
        verifyLineage: "blocked-verify-resume",
        persistent: false,
      }),
    ).toBe(
      "Non-interactive approval object: mode=allow-once, lineage=blocked-verify-resume, persistent=no",
    );
    expect(
      formatApprovalObjectLine("Interactive", {
        mode: "allow-always",
        verifyLineage: "blocked-verify-resume",
        persistent: true,
      }),
    ).toBe(
      "Interactive approval object: mode=allow-always, lineage=blocked-verify-resume, persistent=yes",
    );
    expect(formatApprovalDecisionLine("deny")).toBe("Approval decision: deny");
    expect(formatApprovalPromptDecisionMenuLine()).toBe(
      "Decision: y=allow-once, a=allow-always, n=deny (default n)",
    );
    expect(formatDefaultNonInteractiveDenyLine()).toBe(
      "Non-interactive approval policy: deny (default deny)",
    );
  });

  it("preserves non-interactive approval policy suffixes", () => {
    expect(
      formatNonInteractiveApprovalPolicyLine({
        resolvedDecision: "allow-once",
        cliDecision: "allow-once",
        decisionSource: "cli-policy",
        hasCachedGrant: true,
      }),
    ).toBe("Non-interactive approval policy: allow-once (explicit CLI)");
    expect(
      formatNonInteractiveApprovalPolicyLine({
        resolvedDecision: "allow-always",
        decisionSource: "approval-mode-object",
        hasCachedGrant: false,
      }),
    ).toBe(
      "Non-interactive approval policy: allow-always (prompt approval-mode-object)",
    );
    expect(
      formatNonInteractiveApprovalPolicyLine({
        resolvedDecision: "allow-always",
        decisionSource: "allow-always-policy",
        hasCachedGrant: true,
      }),
    ).toBe("Non-interactive approval policy: allow-always (cached grant)");
    expect(
      formatNonInteractiveApprovalPolicyLine({
        resolvedDecision: "deny",
        decisionSource: "default-deny",
        hasCachedGrant: false,
      }),
    ).toBe("Non-interactive approval policy: deny (default deny)");
  });

  it("formats approval response comments without choosing decisions", () => {
    expect(formatNonInteractiveBlockedComment("Approval mode is ambiguous.")).toBe(
      "CLI non-interactive approval blocked: Approval mode is ambiguous.",
    );
    expect(formatInteractiveBlockedComment("Approval mode is ambiguous.")).toBe(
      "CLI interactive approval blocked: Approval mode is ambiguous.",
    );
    expect(
      formatNonInteractiveApprovalComment({
        decision: "allow-once",
        decisionSource: "cli-policy",
      }),
    ).toBe("CLI non-interactive approval: allow-once (cli-policy)");
    expect(
      formatInteractiveApprovalComment({
        decision: "allow-always",
        decisionSource: "approval-mode-object",
      }),
    ).toBe(
      "CLI interactive approval: allow-always (approval-mode-object)",
    );
    expect(
      formatExplicitApprovalComment({
        decision: "deny",
        hasApprovalModeObject: true,
      }),
    ).toBe("CLI explicit approval: deny (approval-mode-object)");
    expect(
      formatExplicitApprovalComment({
        decision: "deny",
        hasApprovalModeObject: false,
      }),
    ).toBe("CLI explicit approval: deny");
  });

  it("formats trust and conflict lines, and shapes responses explicitly", () => {
    expect(
      formatTrustPolicyUpdatedLine({
        scopeLabel: "shell:execute:npm-test",
        projectRoot: "/tmp/coding-agents",
      }),
    ).toBe("Trust policy updated: shell:execute:npm-test @ coding-agents");
    expect(formatApprovalConflictResolutionLine()).toBe(
      "Resolve approval conflict explicitly with --non-interactive-approval deny|allow-once|allow-always.",
    );
    expect(
      createApprovalResponse({
        promptId: "approval_prompt_1",
        decision: "allow-once",
        respondedAt: 123,
        userComment: "CLI explicit approval: allow-once",
      }),
    ).toEqual({
      promptId: "approval_prompt_1",
      decision: "allow-once",
      respondedAt: 123,
      userComment: "CLI explicit approval: allow-once",
    });
  });

  it("delegates audit rendering without altering audit keys", () => {
    const renderer = createRenderer();

    renderApprovalAuditSurface(renderer, {
      channel: "non-interactive",
      decision: "deny",
      decisionSource: "default-deny",
      persistent: false,
      cacheEffect: "none",
      projectRoot: "/tmp/coding-agents",
      cacheKey: "cache-key",
      scopeLabel: "shell:execute:npm-test",
      inputKey: "n",
      stopReason: "Interactive approval denied by user input.",
    });

    expect(renderer.lines).toEqual([
      "approval-audit:event=decision",
      "approval-audit:channel=non-interactive",
      "approval-audit:decision=deny",
      "approval-audit:decision-source=default-deny",
      "approval-audit:persistent=false",
      "approval-audit:cache-effect=none",
      "approval-audit:project-root=/tmp/coding-agents",
      "approval-audit:cache-key=cache-key",
      "approval-audit:scope=shell:execute:npm-test",
      "approval-audit:input-key=n",
      "approval-audit:stop-reason=Interactive approval denied by user input.",
    ]);
  });
});

describe("createCliEscalationPromptHandler with promptInteractiveApproval", () => {
  function uniquePrompt(tag: string): EscalationPrompt {
    return {
      id: `approval_prompt_${tag}`,
      severity: "high",
      recommendedAction: "deny",
      message: "Tool wants to run a unique command.",
      context: {
        toolName: "shell",
        operation: "execute",
        target: `run-untrusted-${tag}-${Date.now()}`,
      },
    };
  }

  it("uses promptInteractiveApproval to resolve allow-once decision", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const interactiveApproval = vi.fn().mockResolvedValue("allow-once");
    const handler = createCliEscalationPromptHandler(
      renderer,
      null,
      () => "compact",
      trustPolicy,
      () => "/project",
      undefined,
      undefined,
      undefined,
      () => "ask",
      interactiveApproval,
    );

    const prompt = uniquePrompt("once");
    const result = await handler(prompt);
    expect(interactiveApproval).toHaveBeenCalledOnce();
    expect(result.decision).toBe("allow-once");
    expect(renderer.lines).toEqual([]);
  });

  it("uses promptInteractiveApproval to resolve allow-always and records policy grant", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const interactiveApproval = vi.fn().mockResolvedValue("allow-always");
    const handler = createCliEscalationPromptHandler(
      renderer,
      null,
      () => "compact",
      trustPolicy,
      () => "/project",
      undefined,
      undefined,
      undefined,
      () => "ask",
      interactiveApproval,
    );

    const prompt = uniquePrompt("always");
    const result = await handler(prompt);
    expect(interactiveApproval).toHaveBeenCalledOnce();
    expect(result.decision).toBe("allow-always");
    expect(trustPolicy.evaluate(prompt, "/project").matchedGrant).toBeDefined();
    expect(renderer.lines).toEqual([]);
  });

  it("uses promptInteractiveApproval to resolve deny decision", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const interactiveApproval = vi.fn().mockResolvedValue("deny");
    const handler = createCliEscalationPromptHandler(
      renderer,
      null,
      () => "compact",
      trustPolicy,
      () => "/project",
      undefined,
      undefined,
      undefined,
      () => "ask",
      interactiveApproval,
    );
    const prompt = uniquePrompt("deny");
    const result = await handler(prompt);
    expect(interactiveApproval).toHaveBeenCalledOnce();
    expect(result.decision).toBe("deny");
    expect(renderer.lines).toEqual([]);
  });

  it("safely falls back to deny when promptInteractiveApproval rejects", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const interactiveApproval = vi.fn().mockRejectedValue(new Error("UI crashed"));
    const handler = createCliEscalationPromptHandler(
      renderer,
      null,
      () => "compact",
      trustPolicy,
      () => "/project",
      undefined,
      undefined,
      undefined,
      () => "ask",
      interactiveApproval,
    );
    const prompt = uniquePrompt("crash");
    const result = await handler(prompt);
    expect(interactiveApproval).toHaveBeenCalledOnce();
    expect(result.decision).toBe("deny");
  });
});
