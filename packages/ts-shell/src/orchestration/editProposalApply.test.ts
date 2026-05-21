import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGeneratedEditProposalManifest } from "./generatedEditProposal.js";
import { buildProviderEditProposalManifest } from "./providerEditProposal.js";
import {
  buildGeneratedEditProposalReview,
  buildProviderEditProposalReview,
} from "./editProposalReview.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { applyEditProposalSelection } from "./editProposalApply.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("editProposalApply", () => {
  it("does not mutate from unconfirmed proposal selection", async () => {
    const fixture = createFixture({ "src/app.ts": "status: draft\n" });
    const selection = selectEditProposalHunks({
      review: exactReview(["src/app.ts"]),
      action: "select-all-exact",
    });
    const result = await applyEditProposalSelection({
      selection,
      mappingByHunkId: mappingFor(selection.selectedHunks.map((hunk) => hunk.hunkId)),
      targetPathByLabel: new Map([["src/app.ts", "src/app.ts"]]),
      fencedOptions: fixture.options,
    });

    expect(result.status).toBe("unconfirmed-no-write");
    expect(result.changedFiles).toEqual([]);
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe("status: draft\n");
    expect(result.evidence).toContain("edit-proposal-apply:mutation:not-run");
  });

  it("applies confirmed exact single-target proposals through fenced route", async () => {
    const fixture = createFixture({ "src/app.ts": "status: draft\n" });
    const selection = selectEditProposalHunks({
      review: exactReview(["src/app.ts"]),
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const result = await applyEditProposalSelection({
      selection,
      mappingByHunkId: mappingFor(selection.selectedHunks.map((hunk) => hunk.hunkId)),
      targetPathByLabel: new Map([["src/app.ts", "src/app.ts"]]),
      fencedOptions: fixture.options,
    });

    expect(result.status).toBe("single-target-applied");
    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe("status: ready\n");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "edit-proposal-apply:existing-fenced-route",
        "fenced-edit-route:exact-replacement-written",
        "edit-proposal-apply:no-provider-call",
      ]),
    );
  });

  it("applies confirmed exact target-set proposals through target-set transaction route", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "status: draft\n",
    });
    const selection = selectEditProposalHunks({
      review: exactReview(["src/a.ts", "src/b.ts"]),
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const result = await applyEditProposalSelection({
      selection,
      mappingByHunkId: mappingFor(selection.selectedHunks.map((hunk) => hunk.hunkId)),
      targetPathByLabel: new Map([
        ["src/a.ts", "src/a.ts"],
        ["src/b.ts", "src/b.ts"],
      ]),
      fencedOptions: fixture.options,
      targetSetOptions: fixture.options,
    });

    expect(result.status).toBe("target-set-applied");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "edit-proposal-apply:transaction-route",
        "target-set-edit-outcome:target-set-edit-written",
      ]),
    );
  });

  it("preserves proposal and transaction evidence on partial failure", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "status: draft\n",
    });
    const selection = selectEditProposalHunks({
      review: exactReview(["src/a.ts", "src/b.ts"]),
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const result = await applyEditProposalSelection({
      selection,
      mappingByHunkId: mappingFor(selection.selectedHunks.map((hunk) => hunk.hunkId)),
      targetPathByLabel: new Map([
        ["src/a.ts", "src/a.ts"],
        ["src/b.ts", "src/b.ts"],
      ]),
      fencedOptions: fixture.options,
      targetSetOptions: {
        ...fixture.options,
        writeFile: (relativePath, content) => {
          if (relativePath === "src/b.ts") {
            throw new Error("simulated write failure");
          }
          return fixture.options.writeFile(relativePath, content);
        },
      },
    });

    expect(result.status).toBe("target-set-partial-failure");
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "edit-proposal-selection:confirmed-exact-target-set",
        "target-set-edit-outcome:target-set-edit-partial-failure",
      ]),
    );
  });

  it("applies confirmed target-set proposals with per-target distinct exact mappings through hunk-set route", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
    });
    const selection = selectEditProposalHunks({
      review: exactReview(["src/a.ts", "src/b.ts"]),
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const result = await applyEditProposalSelection({
      selection,
      mappingByHunkId: new Map([
        [selection.selectedHunks[0]!.hunkId, mapping("status: draft", "status: ready")],
        [selection.selectedHunks[1]!.hunkId, mapping("state: draft", "state: ready")],
      ]),
      targetPathByLabel: new Map([
        ["src/a.ts", "src/a.ts"],
        ["src/b.ts", "src/b.ts"],
      ]),
      fencedOptions: fixture.options,
      targetSetOptions: fixture.options,
    });

    expect(result.status).toBe("hunk-set-applied");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: ready\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("state: ready\n");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "edit-proposal-apply:hunk-set-route",
        "edit-proposal-apply:per-target-distinct-mapping",
        "proposal-hunk-set-route:reuse-existing-fenced-lane",
        "proposal-hunk-set-route:no-new-writer",
        "proposal-hunk-set-route:no-provider-call",
      ]),
    );
  });

  it("applies generated proposal target sets with per-target distinct exact mappings", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
    });
    const review = buildGeneratedEditProposalReview(
      buildGeneratedEditProposalManifest({
        targets: ["src/a.ts", "src/b.ts"],
        requestedOperationKind: "exact-fenced-replacement",
        proposedContentStatus: "explicit-new-content",
        exactMappingStatus: "exact-target-set",
      }),
    );
    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const result = await applyEditProposalSelection({
      selection,
      mappingByHunkId: new Map([
        [selection.selectedHunks[0]!.hunkId, mapping("status: draft", "status: ready")],
        [selection.selectedHunks[1]!.hunkId, mapping("state: draft", "state: ready")],
      ]),
      targetPathByLabel: new Map([
        ["src/a.ts", "src/a.ts"],
        ["src/b.ts", "src/b.ts"],
      ]),
      fencedOptions: fixture.options,
      targetSetOptions: fixture.options,
    });

    expect(result.status).toBe("hunk-set-applied");
    expect(result.source).toBe("generated");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.evidence).toContain("edit-proposal-apply:no-provider-call");
  });
});

function exactReview(targetLabels: readonly string[]) {
  return buildProviderEditProposalReview(
    buildProviderEditProposalManifest({
      providerKindLabel: "fake-provider",
      targetLabels,
      proposedOperationKind: "exact-fenced-replacement",
      targetSummaries: targetLabels.map((label) => `exact edit for ${label}`),
      exactReadiness:
        targetLabels.length === 1 ? "exact-single-target" : "exact-target-set",
    }),
  );
}

function mappingFor(hunkIds: readonly string[]) {
  return new Map(hunkIds.map((hunkId) => [hunkId, mapping("status: draft", "status: ready")]));
}

function mapping(oldText: string, newText: string) {
  return {
    oldText,
    newText,
    source: "old-new-fenced-blocks" as const,
  };
}

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-apply-"));
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
