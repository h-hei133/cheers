import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyEditProposalSelection } from "./editProposalApply.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { buildEditRepairProposalReview } from "./editProposalReview.js";
import { buildEditRepairContext } from "./editRepairContext.js";
import {
  planEditRepairHunkSetHandoff,
  planEditRepairProposal,
} from "./editRepairPlanner.js";
import { buildEditRepairResult } from "./editRepairResult.js";
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("editRepairResult", () => {
  it("projects repair review-required no-write state into Result Surface and Session evidence", async () => {
    const context = contextFixture();
    const plan = await planEditRepairProposal({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [{ hunkId: "h1", targetPath: "src/app.ts", oldText: "old", newText: "new" }],
      },
    });
    const review = "manifest" in plan && plan.manifest
      ? buildEditRepairProposalReview(plan.manifest)
      : undefined;

    const result = buildEditRepairResult({
      sessionId: "sess-repair-review",
      prompt: "repair verification failure",
      context,
      plan,
      review,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "edit-repair-result:state:repair-review-required",
        "edit-repair-result:no-automatic-repair",
        "edit-repair-result:raw-content-excluded",
      ]),
    );
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      "edit-repair-proposal id=",
    );
    expect(result.finalOutput).not.toContain("old");
    expect(result.finalOutput).not.toContain("new");
  });

  it("hands confirmed exact repair hunks to existing hunk-set apply only after confirmation", async () => {
    const fixture = createFixture({ "src/app.ts": "alpha\nmiddle\nomega\n" });
    const context = buildEditRepairContext({
      verification: { status: "failed", reason: "verification failed" },
      failedFiles: [{ path: "src/app.ts" }],
      changedFiles: ["src/app.ts"],
    });
    const plan = await planEditRepairProposal({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [
          { hunkId: "h1", targetPath: "src/app.ts", oldText: "alpha", newText: "ALPHA" },
          { hunkId: "h2", targetPath: "src/app.ts", oldText: "omega", newText: "OMEGA" },
        ],
      },
    });
    if (!("manifest" in plan) || !plan.manifest || !("mappingByHunkId" in plan)) {
      throw new Error("expected repair manifest");
    }
    const review = buildEditRepairProposalReview(plan.manifest);
    const unconfirmed = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: false,
    });
    const unconfirmedApply = await applyEditProposalSelection({
      selection: unconfirmed,
      mappingByHunkId: plan.mappingByHunkId,
      targetPathByLabel: new Map([["src/app.ts", "src/app.ts"]]),
      fencedOptions: fixture.options,
    });
    expect(unconfirmedApply.status).toBe("unconfirmed-no-write");
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe("alpha\nmiddle\nomega\n");

    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const handoff = planEditRepairHunkSetHandoff({ plan, selection });
    const applyResult = await applyEditProposalSelection({
      selection,
      mappingByHunkId: plan.mappingByHunkId,
      targetPathByLabel: new Map([["src/app.ts", "src/app.ts"]]),
      fencedOptions: fixture.options,
    });
    const unverifiedResult = buildEditRepairResult({
      sessionId: "sess-repair-applied",
      prompt: "apply confirmed repair",
      context,
      plan: handoff,
      review,
      selection,
      applyResult,
    });
    const result = buildEditRepairResult({
      sessionId: "sess-repair-verified",
      prompt: "apply confirmed repair",
      context,
      plan: handoff,
      review,
      selection,
      applyResult,
      postApplyVerification: {
        status: "passed",
        reason: "repair readback matched expected content",
        runtimeDerived: true,
        evidence: ["test-repair-readback:status:passed"],
      },
    });

    expect(applyResult.status).toBe("hunk-set-applied");
    expect(unverifiedResult.status).toBe("stopped_error");
    expect(unverifiedResult.codingResult?.evidence).toContain(
      "edit-repair-result:repair-apply-without-reverification",
    );
    expect(result.status).toBe("completed");
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe("ALPHA\nmiddle\nOMEGA\n");
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "edit-repair-result:repair-verified-through-hunk-set",
        "edit-repair-result:repair-applied-through-hunk-set",
        "edit-repair-result:post-apply-verification:passed",
        "edit-repair-result:post-apply-verification:runtime-derived",
        "test-repair-readback:status:passed",
        "proposal-hunk-set-route:multi-hunk-exact-apply",
        "edit-proposal-apply:no-provider-call",
      ]),
    );
  });
});

function contextFixture() {
  return buildEditRepairContext({
    verification: { status: "failed", reason: "verification failed" },
    failedFiles: [{ path: "src/app.ts" }],
    changedFiles: ["src/app.ts"],
  });
}

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "edit-repair-route-"));
  tempRoots.push(workspaceRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    workspaceRoot,
    options: {
      workspaceRoot,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved" as const,
      defaultProductionRejectionUnchanged: true as const,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
  };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
