import { describe, expect, it } from "vitest";
import {
  buildEditPatchModuleState,
  buildMutationManifest,
  classifyEditRequest,
  describeUnsupportedFutureEdit,
} from "./editPatchModule.js";

describe("editPatchModule", () => {
  it("keeps current bounded write delegated to the existing route", () => {
    const state = buildEditPatchModuleState({
      request: {
        prompt: "Create file notes.txt with content: hello",
        targetPath: "notes.txt",
        hasCreateIntent: true,
        hasConcreteContent: true,
      },
    });

    expect(state.futureContract).toMatchObject({
      mode: "current-bounded-write",
      supportStatus: "current-supported",
      mutationAllowedNow: true,
    });
    expect(state.manifest).toMatchObject({
      authorization: "not-authorization",
      mutationAllowedNow: true,
      contentSummary: "concrete",
      workspaceAuthorityRequirement: "delegated-to-current-route",
      staleReadRequirement: "delegated-to-current-route",
      verificationRequirement: "delegated-to-current-route",
    });
    expect(state.preconditions.overall).toBe("ready-current-route");
    expect(state.result).toMatchObject({
      moduleStatus: "current-route-delegated",
      writerInvoked: false,
      changedFiles: [],
      receipt: { result: "completed" },
    });
  });

  it("keeps current bounded edit delegated to the existing route", () => {
    const state = buildEditPatchModuleState({
      request: {
        prompt: "Edit src/app.ts and replace old with new",
        targetPath: "src/app.ts",
        hasEditIntent: true,
        hasReplaceDirective: true,
        hasExactOldNewMapping: true,
      },
    });

    expect(state.futureContract.mode).toBe("current-bounded-edit");
    expect(state.manifest.operations[0]).toMatchObject({
      targetPath: "src/app.ts",
      operationKind: "replace",
      writeIntent: "current-route-only",
    });
    expect(state.result.receipt.policy).toBe("allowed");
  });

  it("stops missing target and missing content actionably", () => {
    const missingTarget = buildEditPatchModuleState({
      request: {
        prompt: "Write a python script in the current directory",
        hasCreateIntent: true,
      },
    });
    expect(missingTarget.futureContract.reasonCode).toBe("unsupported-vague-edit");
    expect(missingTarget.preconditions.missing).toContain("explicit-target");
    expect(missingTarget.result.receipt.result).toBe("stopped");

    const missingContent = buildEditPatchModuleState({
      request: {
        prompt: "Write src/new-widget.test.tsx",
        targetPath: "src/new-widget.test.tsx",
        hasCreateIntent: true,
      },
    });
    expect(missingContent.futureContract.reasonCode).toBe(
      "unsupported-generated-content",
    );
    expect(missingContent.preconditions.missing).toContain(
      "content-or-transform",
    );
    expect(missingContent.result.terminalSummary).toContain("stopped");
  });

  it("represents broad refactor as preview-only with rollback preconditions", () => {
    const state = buildEditPatchModuleState({
      request: {
        prompt: "Refactor logging across the repo and keep usages working",
        hasEditIntent: true,
      },
    });

    expect(state.futureContract.mode).toBe("future-broad-refactor-planning");
    expect(state.manifest).toMatchObject({
      supportStatus: "future-only",
      rollbackSnapshotRequirement: "required",
      mutationAllowedNow: false,
    });
    expect(state.preconditions.overall).toBe("blocked-preview-only");
    expect(state.preconditions.missing).toEqual(
      expect.arrayContaining([
        "content-or-transform",
        "workspace-authority",
        "stale-read",
        "verification",
        "rollback-snapshot",
        "user-confirmation",
      ]),
    );
    expect(state.preview.evidenceId).toContain("future-broad-refactor-planning");
    expect(state.result).toMatchObject({
      moduleStatus: "preview-only-stopped",
      writerInvoked: false,
    });
  });

  it("requires confirmation for future multi-file discovery edit", () => {
    const state = buildEditPatchModuleState({
      request: {
        prompt: "Edit this repository and replace v1 with v2",
        hasEditIntent: true,
      },
      candidateTargets: ["src/a.ts", "src/b.ts"],
    });

    expect(state.futureContract.mode).toBe("future-multi-file-discovery-edit");
    expect(state.manifest.candidateTargets).toEqual(["src/a.ts", "src/b.ts"]);
    expect(state.preconditions.missing).toContain("candidate-confirmation");
    expect(state.manifest.confirmationRequirement).toBe("required");
    expect(state.result.receipt.execution).toBe("not-run");
  });

  it("requires exact target and mapping for future fenced replacement", () => {
    const state = buildEditPatchModuleState({
      request: {
        prompt: ["Use this fenced replacement in src/app.ts:", "```", "new", "```"].join(
          "\n",
        ),
        targetPath: "src/app.ts",
        hasEditIntent: true,
        hasFencedContent: true,
      },
    });

    expect(state.futureContract.mode).toBe("future-fenced-replacement");
    expect(state.manifest.explicitTargets).toEqual(["src/app.ts"]);
    expect(state.preconditions.missing).toContain("content-or-transform");
    expect(state.preconditions.delegated).not.toContain("stale-read");
    expect(state.result.receipt.result).toBe("stopped");
  });

  it("keeps manifest separate from write authorization", () => {
    const contract = classifyEditRequest({
      prompt: "Create file notes.txt with content: hello",
      targetPath: "notes.txt",
      hasCreateIntent: true,
      hasConcreteContent: true,
    });
    const manifest = buildMutationManifest({
      request: {
        prompt: "Create file notes.txt with content: hello",
        targetPath: "notes.txt",
        hasCreateIntent: true,
        hasConcreteContent: true,
      },
      contract,
    });

    expect(manifest.authorization).toBe("not-authorization");
    expect(manifest.operations[0]?.writeIntent).toBe("current-route-only");
  });

  it("projects replay-safe stopped results without raw secrets", () => {
    const state = buildEditPatchModuleState({
      request: {
        prompt:
          "Edit this repository with token=secret and /home/wang/.private-agents-real/config",
        hasEditIntent: true,
      },
      candidateTargets: ["/home/wang/.private-agents-real/config"],
    });

    expect(state.result.transcriptSummary).not.toContain(
      "/home/wang/.private-agents-real",
    );
    expect(state.result.transcriptSummary).not.toContain("token=secret");
    expect(state.result.evidence).toContain("mutation:not-run-in-module");
    expect(state.preview.targetSummary).toContain("[redacted-real-provider-home]");
  });

  it("describes unsupported future edits through the module facade", () => {
    const state = buildEditPatchModuleState({
      request: {
        prompt: "Refactor all modules",
        hasEditIntent: true,
      },
    });

    expect(describeUnsupportedFutureEdit({ contract: state.futureContract })).toContain(
      "target/constraint manifest",
    );
  });
});
