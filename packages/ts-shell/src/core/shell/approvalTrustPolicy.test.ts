import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EscalationPrompt } from "./approval/contract.js";
import { ApprovalTrustPolicy } from "./approvalTrustPolicy.js";

function normalizeExpectedProjectRoot(root: string): string {
  const resolved = path.resolve(root);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

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

describe("ApprovalTrustPolicy", () => {
  let tempDir = "";
  let policyPath = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "approval-policy-test-"));
    policyPath = path.join(tempDir, "approval-policy.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists allow-always by project-scoped command signature", () => {
    const policy = new ApprovalTrustPolicy(policyPath);
    const projectA = path.join(tempDir, "project-a");
    const projectB = path.join(tempDir, "project-b");
    fs.mkdirSync(projectA, { recursive: true });
    fs.mkdirSync(projectB, { recursive: true });

    policy.rememberAllowAlways(buildPrompt("node --version"), projectA);

    // The scope is the exact command signature: `node -v` is a different
    // command from `node --version`, so it must not reuse that grant.
    const matchSameCommand = policy.evaluate(
      buildPrompt("node --version"),
      projectA,
    );
    expect(matchSameCommand.matchedGrant).toBeDefined();
    expect(matchSameCommand.scopeLabel).toBe("bash/spawn(node --version)");

    const missDifferentCommand = policy.evaluate(buildPrompt("node -v"), projectA);
    expect(missDifferentCommand.matchedGrant).toBeUndefined();

    const missDifferentProcess = policy.evaluate(
      buildPrompt("python --version"),
      projectA,
    );
    expect(missDifferentProcess.matchedGrant).toBeUndefined();
    expect(missDifferentProcess.sameOperationCandidates.length).toBe(1);

    const missDifferentProject = policy.evaluate(
      buildPrompt("node --version"),
      projectB,
    );
    expect(missDifferentProject.matchedGrant).toBeUndefined();
  });

  it.each(["rm Foo", "node --eval Process", "write CaseSensitive.txt"])("keeps case-distinct commands separate after reload: %s", target => {
    const policy = new ApprovalTrustPolicy(policyPath);
    policy.rememberAllowAlways(buildPrompt(target), tempDir);
    const reopened = new ApprovalTrustPolicy(policyPath);
    expect(reopened.evaluate(buildPrompt(target), tempDir).matchedGrant).toBeDefined();
    expect(reopened.evaluate(buildPrompt(target.toLowerCase()), tempDir).matchedGrant).toBeUndefined();
    const exact = policy.evaluate(buildPrompt(target), tempDir);
    const other = policy.evaluate(buildPrompt(target.toLowerCase()), tempDir);
    policy.rememberAllowOnce(exact.cacheKey);
    expect(policy.consumeAllowOnce(other.cacheKey)).toBe(false);
    expect(policy.consumeAllowOnce(exact.cacheKey)).toBe(true);
  });

  it("does not reinterpret a lossy legacy command key as exact approval", () => {
    const legacy = { projectRoot: normalizeExpectedProjectRoot(tempDir), toolName: "bash", operation: "spawn",
      scopeKey: "bash:spawn:cmd:rm foo", scopeLabel: "bash/spawn(rm Foo)", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
    fs.writeFileSync(policyPath, JSON.stringify({ grants: [legacy] }));
    const policy = new ApprovalTrustPolicy(policyPath);
    expect(policy.evaluate(buildPrompt("rm foo"), tempDir).matchedGrant).toBeUndefined();
    expect(policy.evaluate(buildPrompt("rm Foo"), tempDir).matchedGrant).toBeUndefined();
    expect(policy.listGrants()).toHaveLength(1);
    expect(policy.revokeGrant(tempDir, "1").removed).toBe(1);
  });

  it("preserves exact file target bytes for write grants", () => {
    const policy = new ApprovalTrustPolicy(policyPath);
    const prompt = { ...buildPrompt("unused"), context: { toolName: "write", operation: "write", target: "File.txt " } };
    policy.rememberAllowAlways(prompt, tempDir);
    for (const target of ["File.txt", "file.txt "]) {
      expect(policy.evaluate({ ...prompt, context: { ...prompt.context, target } }, tempDir).matchedGrant).toBeUndefined();
    }
    expect(policy.evaluate(prompt, tempDir).matchedGrant).toBeDefined();
  });

  it("provides user-facing explanation for repeated prompts", () => {
    const policy = new ApprovalTrustPolicy(policyPath);
    const project = path.join(tempDir, "project-x");
    fs.mkdirSync(project, { recursive: true });

    policy.rememberAllowAlways(buildPrompt("node --version"), project);
    const evaluation = policy.evaluate(buildPrompt("python --version"), project);
    const lines = policy.explain(evaluation, project, "verbose");

    expect(lines.some((line) => line.includes("Trust boundary project"))).toBe(
      true,
    );
    expect(
      lines.some((line) =>
        line.includes("stored allow-always exists for this tool/operation"),
      ),
    ).toBe(true);
    expect(lines.some((line) => line.includes("Known scopes in this project"))).toBe(
      true,
    );
  });

  it("supports list/revoke/reset management operations", () => {
    const policy = new ApprovalTrustPolicy(policyPath);
    const project = path.join(tempDir, "project-manage");
    fs.mkdirSync(project, { recursive: true });

    policy.rememberAllowAlways(buildPrompt("node --version"), project);
    policy.rememberAllowAlways(buildPrompt("python --version"), project);
    const listed = policy.listGrants(project);
    expect(listed.length).toBe(2);

    const removedByIndex = policy.revokeGrant(project, "1");
    expect(removedByIndex.removed).toBe(1);
    expect(policy.listGrants(project).length).toBe(1);

    const remainingScopeKey = policy.listGrants(project)[0]?.scopeKey;
    expect(remainingScopeKey).toBeDefined();
    if (remainingScopeKey) {
      const removedByScope = policy.revokeGrant(project, remainingScopeKey);
      expect(removedByScope.removed).toBe(1);
    }
    expect(policy.listGrants(project).length).toBe(0);

    policy.rememberAllowAlways(buildPrompt("node --version"), project);
    const resetProject = policy.resetProject(project);
    expect(resetProject.removed).toBe(1);
    expect(policy.listGrants(project).length).toBe(0);
  });

  it("records and exposes last-hit explain context", () => {
    const policy = new ApprovalTrustPolicy(policyPath);
    const project = path.join(tempDir, "project-last-hit");
    fs.mkdirSync(project, { recursive: true });

    policy.recordLastHit({
      source: "allow-always-policy",
      projectRoot: project,
      scopeLabel: "bash/spawn/process(node)",
      cacheKey: `${project}|bash:spawn:process:node`,
    });
    const lastHit = policy.getLastHit();
    expect(lastHit?.source).toBe("allow-always-policy");
    expect(lastHit?.projectRoot).toBe(normalizeExpectedProjectRoot(project));
    expect(lastHit?.scopeLabel).toContain("process(node)");
  });

  it("supports one-shot allow-once cache consumption", () => {
    const policy = new ApprovalTrustPolicy(policyPath);
    const cacheKey = "project|bash:spawn:process:node";
    policy.rememberAllowOnce(cacheKey);

    expect(policy.hasAllowOnce(cacheKey)).toBe(true);
    expect(policy.consumeAllowOnce(cacheKey)).toBe(true);
    expect(policy.hasAllowOnce(cacheKey)).toBe(false);
    expect(policy.consumeAllowOnce(cacheKey)).toBe(false);
  });
});
