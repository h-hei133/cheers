import { describe, expect, it, vi } from "vitest";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { EscalationPrompt } from "../core/shell/approval/contract.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { createCliEscalationPromptHandler } from "./cliApprovalModule.js";
import { createToolHooks } from "../turn/tools.js";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
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
      lines: ["- Trust boundary project: cheers"],
    });

    expect(renderer.lines).toEqual([
      "\nApproval",
      "- Mode: user confirmation required",
      "- Tool: shell",
      "- Action: execute",
      "- Target: npm test",
      "- Risk: high",
      "- Decision source: default-deny",
      "- Trust boundary project: cheers",
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
        projectRoot: "/tmp/cheers",
      }),
    ).toBe("Trust policy updated: shell:execute:npm-test @ cheers");
    expect(formatApprovalConflictResolutionLine()).toBe(
      "Resolve approval conflict explicitly with --non-interactive-approval deny|allow-once|allow-always.",
    );
    expect(
      createApprovalResponse({
        promptId: "approval_prompt_1",
        decision: "allow-once",
        respondedAt: 123,
        userComment: "CLI explicit approval: allow-once",
        selected: ["group-a"],
        selectionRevision: "subset-revision",
      }),
    ).toEqual({
      promptId: "approval_prompt_1",
      decision: "allow-once",
      respondedAt: 123,
      userComment: "CLI explicit approval: allow-once",
      selected: ["group-a"],
      selectionRevision: "subset-revision",
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
      projectRoot: "/tmp/cheers",
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
      "approval-audit:project-root=/tmp/cheers",
      "approval-audit:cache-key=cache-key",
      "approval-audit:scope=shell:execute:npm-test",
      "approval-audit:input-key=n",
      "approval-audit:stop-reason=Interactive approval denied by user input.",
    ]);
  });
});

describe("createCliEscalationPromptHandler with promptInteractiveApproval", () => {
  it("consumes a staged grant only when it authorizes the noninteractive request", async () => {
    const policy = new ApprovalTrustPolicy();
    const prompt = createPrompt();
    const key = policy.evaluate(prompt, "/noninteractive-once").cacheKey;
    policy.rememberAllowOnce(key);
    let explicit: "deny" | undefined = "deny";
    const handler = createCliEscalationPromptHandler(createRenderer(), null, () => "compact", policy,
      () => "/noninteractive-once", () => explicit);
    expect((await handler(prompt)).decision).toBe("deny");
    expect(policy.hasAllowOnce(key)).toBe(true);
    explicit = undefined;
    expect((await handler(prompt)).decision).toBe("allow-once");
    expect(policy.hasAllowOnce(key)).toBe(false);
    expect((await handler({ ...prompt, id: "second" })).decision).toBe("deny");
  });

  it("applies allow-once only to the current tool call, then asks for the next payload", async () => {
    const policy = new ApprovalTrustPolicy();
    const interactive = vi.fn().mockResolvedValueOnce("allow-once").mockResolvedValueOnce("deny");
    const handler = createCliEscalationPromptHandler(createRenderer(), null, () => "compact", policy,
      () => "/once-boundary", undefined, undefined, undefined, () => "ask", interactive);
    const hooks = createToolHooks({ sessionId: "once", workspaceRoot: "/once-boundary", permissionScope: "ask",
      hooks: { dispatch: async () => ({ decision: "allow" }) } as unknown as HookDispatcher,
      escalationPromptHandler: handler, emit() {},
    });
    const first = { id: "write-one", name: "write", args: { path: "target.txt", content: "first" } };
    const second = { id: "write-two", name: "write", args: { path: "target.txt", content: "second" } };
    expect(await hooks.beforeToolCall!({ assistantMessage: { role: "assistant", content: "" }, call: first, args: first.args })).toBeUndefined();
    expect((await hooks.beforeToolCall!({ assistantMessage: { role: "assistant", content: "" }, call: second, args: second.args }))?.block).toBe(true);
    expect(interactive).toHaveBeenCalledTimes(2);
  });

  it("does not retain a one-shot grant after the session scope becomes ask", async () => {
    const policy = new ApprovalTrustPolicy();
    let scope: "allow-all" | "ask" = "allow-all";
    const interactive = vi.fn().mockResolvedValue("deny");
    const handler = createCliEscalationPromptHandler(createRenderer(), null, () => "compact", policy,
      () => "/scope-boundary", undefined, undefined, undefined, () => scope, interactive);
    const prompt = createPrompt();
    expect((await handler(prompt)).decision).toBe("allow-once");
    scope = "ask";
    expect((await handler({ ...prompt, id: "next-request" })).decision).toBe("deny");
    expect(interactive).toHaveBeenCalledOnce();
  });

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

  it("preserves the exact group selection and revision returned by the interactive host", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const interactiveApproval = vi.fn().mockResolvedValue({
      decision: "allow-once",
      selected: ["group-a"],
      selectionRevision: "subset-revision",
    });
    const approvalModeObject = vi.fn(() => ({
      mode: "allow-once" as const,
      persistent: false,
      verifyLineage: "selection-test",
    }));
    const handler = createCliEscalationPromptHandler(
      renderer,
      null,
      () => "compact",
      trustPolicy,
      () => "/project",
      undefined,
      approvalModeObject,
      undefined,
      () => "ask",
      interactiveApproval,
    );
    const prompt: EscalationPrompt = {
      ...uniquePrompt("selected"),
      context: {
        toolName: "apply_patch",
        operation: "write",
        target: "a.txt",
        selections: [{ id: "group-a", label: "Update a.txt (1 hunk)" }],
        selectionRevision: "full-revision",
      },
    };
    const result = await handler(prompt);
    expect(result).toMatchObject({
      decision: "allow-once",
      selected: ["group-a"],
      selectionRevision: "subset-revision",
    });
    expect(result.userComment).not.toContain("approval-mode-object");
    expect(approvalModeObject).not.toHaveBeenCalled();
  });

  it("refuses to persist allow-always for an exact patch selection", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const rememberAllowAlways = vi.spyOn(trustPolicy, "rememberAllowAlways");
    const interactiveApproval = vi.fn().mockResolvedValue({
      decision: "allow-always",
      selected: ["group-a"],
      selectionRevision: "subset-revision",
    });
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
    const prompt: EscalationPrompt = {
      ...uniquePrompt("patch_always"),
      context: {
        toolName: "apply_patch",
        operation: "write",
        target: "a.txt",
        selections: [{ id: "group-a", label: "Update a.txt (1 hunk)" }],
        selectionRevision: "full-revision",
      },
    };
    const result = await handler(prompt);
    expect(result).toMatchObject({
      decision: "deny",
      userComment: expect.stringContaining("allow-always is not available"),
    });
    expect(rememberAllowAlways).not.toHaveBeenCalled();
  });

  it("refuses a selection prompt without a picker before scopes, policy or cached approval can answer", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const audited: ApprovalAuditRecord[] = [];
    const nonInteractiveDecision = vi.fn(() => "allow-once" as const);
    const approvalModeObject = vi.fn(() => ({ mode: "allow-once" as const, persistent: false, verifyLineage: "selection-test" }));
    const permissionScope = vi.fn(() => "allow-all" as const);
    const prompt: EscalationPrompt = {
      ...uniquePrompt("selection_without_host"),
      context: {
        toolName: "apply_patch",
        operation: "write",
        target: "a.txt",
        selections: [{ id: "group-a", label: "Update a.txt (1 hunk)" }],
        selectionRevision: "full-revision",
      },
    };
    const cacheKey = trustPolicy.evaluate(prompt, "/project").cacheKey;
    trustPolicy.rememberAllowOnce(cacheKey);
    const handler = createCliEscalationPromptHandler(
      renderer,
      null,
      () => "compact",
      trustPolicy,
      () => "/project",
      nonInteractiveDecision,
      approvalModeObject,
      record => audited.push(record),
      permissionScope,
    );
    await expect(handler(prompt)).resolves.toMatchObject({
      decision: "deny",
      userComment: expect.stringContaining("no interactive group-selection host"),
    });
    expect(audited.at(-1)).toMatchObject({
      decision: "deny",
      decisionSource: "selection-host-unavailable",
    });
    expect(nonInteractiveDecision).not.toHaveBeenCalled();
    expect(approvalModeObject).not.toHaveBeenCalled();
    expect(permissionScope).not.toHaveBeenCalled();
    expect(trustPolicy.hasAllowOnce(cacheKey)).toBe(true);
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

  it("passes denial reason from promptInteractiveApproval into userComment and audit record", async () => {
    const renderer = createRenderer();
    const trustPolicy = new ApprovalTrustPolicy();
    const audited: ApprovalAuditRecord[] = [];
    const interactiveApproval = vi.fn().mockResolvedValue({
      decision: "deny",
      reason: "command is destructive",
    });
    const handler = createCliEscalationPromptHandler(
      renderer,
      null,
      () => "compact",
      trustPolicy,
      () => "/project",
      undefined,
      undefined,
      (record) => audited.push(record),
      () => "ask",
      interactiveApproval,
    );
    const prompt = uniquePrompt("deny_reason");
    const result = await handler(prompt);
    expect(interactiveApproval).toHaveBeenCalledOnce();
    expect(result.decision).toBe("deny");
    expect(result.userComment).toContain("command is destructive");
    expect(audited[0]?.stopReason).toContain("command is destructive");
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
