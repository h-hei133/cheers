import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "../planning/handoff/mutation.js";
import { buildPlanningMutationProposalBridge } from "../planning/handoff/bridge.js";
import { runPlanningMutationProofHandoff } from "./planningMutationProofHandoff.js";
import { verifyPlanningMutationProofHandoff } from "./planningMutationProofVerification.js";
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";

const tempRoots: string[] = [];
const targetPath = "src/contextEngine.ts";
const sourceContent = [
  "export function run(task: string) {",
  "  return rankTarget(task);",
  "}",
  "",
].join("\n");
const expectedContent = [
  "export function run(task: string) {",
  "  return rankTarget(task.trim());",
  "}",
  "",
].join("\n");

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("verifyPlanningMutationProofHandoff", () => {
  it("keeps proposal-only exact bridges at confirmation-required without success", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));
    const proofHandoff = await runPlanningMutationProofHandoff({
      bridge,
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
    });

    const verification = verifyPlanningMutationProofHandoff({
      bridge,
      proofHandoff,
      verificationIntent: readyHandoff().verificationIntent,
      readVerifiedFile: fixture.options.readVerifiedFile,
    });

    expect(verification.state).toBe("confirmation-required");
    expect(verification.applyState).toBe("not-run");
    expect(verification.verificationState).toBe("not-run");
    expect(verification.terminalState).toBe("confirmation-required");
    expect(verification.terminalResult).toBe("confirmation-required");
    expect(verification.liveSuccess).toBe(false);
    expect(verification.changedFiles).toEqual([]);
    expect(verification.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-verification:state:confirmation-required",
        "claim-ledger:terminal:confirmation-required",
        "claim-ledger:not-proven:authority:confirmation-required",
      ]),
    );
  });

  it("does not turn an applied handoff into success before readback verification", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));
    const proofHandoff = await trustedProofHandoff({ bridge, fixture });

    const verification = verifyPlanningMutationProofHandoff({
      bridge,
      proofHandoff,
      verificationIntent: readyHandoff().verificationIntent,
    });

    expect(verification.state).toBe("not-run");
    expect(verification.applyState).toBe("single-target-applied");
    expect(verification.verificationState).toBe("not-run");
    expect(verification.terminalState).toBe("apply-succeeded");
    expect(verification.terminalResult).toBe("apply-succeeded");
    expect(verification.liveSuccess).toBe(false);
    expect(verification.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-verification:verification:not-run",
        "claim-ledger:not-proven:verification:verification-not-run",
      ]),
    );
  });

  it("derives a non-live verified Claim Ledger verdict only after readback passes", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));
    const proofHandoff = await trustedProofHandoff({ bridge, fixture });

    const verification = verifyPlanningMutationProofHandoff({
      bridge,
      proofHandoff,
      verificationIntent: readyHandoff().verificationIntent,
      readVerifiedFile: fixture.options.readVerifiedFile,
      expectedContentByTargetPath: new Map([[targetPath, expectedContent]]),
      providerCalled: true,
    });

    expect(readFile(fixture.workspaceRoot, targetPath)).toBe(expectedContent);
    expect(verification.state).toBe("verified");
    expect(verification.verificationState).toBe("succeeded");
    expect(verification.verifiedFiles).toEqual([targetPath]);
    expect(verification.unverifiedFiles).toEqual([]);
    expect(verification.terminalState).toBe("verification-succeeded-not-live");
    expect(verification.terminalResult).toBe("verification-succeeded");
    expect(verification.liveSuccess).toBe(false);
    expect(verification.verificationIntent.summary).toContain("verificationPlan=verification_plan_123");
    expect(verification.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-verification:state:verified",
        "planning-mutation-proof-verification:intent:available",
        "planning-mutation-proof-verification:intent-evidence:verification_plan_123",
        `planning-mutation-proof-verification:file:${targetPath}:readback:passed`,
        `planning-mutation-proof-verification:file:${targetPath}:expected-content:matched`,
        "claim-ledger:terminal:verification-succeeded-not-live",
        "claim-ledger:terminal-result:verification-succeeded",
        "claim-ledger:live-success:false",
      ]),
    );
  });

  it("does not infer provider provenance from a focused deterministic proposal", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));
    const proofHandoff = await trustedProofHandoff({ bridge, fixture });

    const verification = verifyPlanningMutationProofHandoff({
      bridge,
      proofHandoff,
      verificationIntent: readyHandoff().verificationIntent,
      readVerifiedFile: fixture.options.readVerifiedFile,
      expectedContentByTargetPath: new Map([[targetPath, expectedContent]]),
    });

    expect(verification.state).toBe("verified");
    expect(verification.verificationState).toBe("succeeded");
    expect(verification.terminalState).toBe("verification-succeeded-not-live");
    expect(verification.terminalResult).toBe("verification-succeeded");
    expect(verification.liveSuccess).toBe(false);
    expect(verification.claimLedger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:provider:not-proven",
        "claim-ledger:not-proven:provider:provider-not-called",
        "claim-ledger:not-proven:provider:not-live-provider-evidence",
      ]),
    );
  });

  it("turns readback mismatch into repair-ready without success", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));
    const proofHandoff = await trustedProofHandoff({ bridge, fixture });

    const verification = verifyPlanningMutationProofHandoff({
      bridge,
      proofHandoff,
      verificationIntent: readyHandoff().verificationIntent,
      readVerifiedFile: () => sourceContent,
      expectedContentByTargetPath: new Map([[targetPath, expectedContent]]),
    });

    expect(verification.state).toBe("repair-ready");
    expect(verification.verificationState).toBe("failed");
    expect(verification.verifiedFiles).toEqual([]);
    expect(verification.unverifiedFiles).toEqual([targetPath]);
    expect(verification.repairState).toBe("repair-available");
    expect(verification.terminalState).toBe("repair-eligible");
    expect(verification.liveSuccess).toBe(false);
    expect(verification.evidence).toEqual(
      expect.arrayContaining([
        `planning-mutation-proof-verification:file:${targetPath}:readback:failed`,
        `planning-mutation-proof-verification:file:${targetPath}:expected-content:mismatch`,
        "claim-ledger:verification:failed",
        "claim-ledger:repair:repair-available",
        "claim-ledger:terminal:repair-eligible",
      ]),
    );
  });

  it("rejects backend changed files that were not in the anchored handoff targets", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));
    const proofHandoff = await trustedProofHandoff({ bridge, fixture });
    const unexpectedPath = "src/unexpected.ts";

    const verification = verifyPlanningMutationProofHandoff({
      bridge,
      proofHandoff: {
        ...proofHandoff,
        changedFiles: [...proofHandoff.changedFiles, unexpectedPath],
        evidence: [
          ...proofHandoff.evidence,
          `test-fixture:unexpected-changed-file:${unexpectedPath}`,
        ],
      },
      verificationIntent: readyHandoff().verificationIntent,
      readVerifiedFile: fixture.options.readVerifiedFile,
      expectedContentByTargetPath: new Map([[targetPath, expectedContent]]),
      providerCalled: true,
    });

    expect(verification.state).toBe("repair-ready");
    expect(verification.verificationState).toBe("failed");
    expect(verification.unexpectedChangedFiles).toEqual([unexpectedPath]);
    expect(verification.failedFiles).toEqual([unexpectedPath]);
    expect(verification.verifiedFiles).toEqual([targetPath]);
    expect(verification.unverifiedFiles).toEqual([unexpectedPath]);
    expect(verification.terminalState).toBe("repair-eligible");
    expect(verification.liveSuccess).toBe(false);
    expect(verification.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-verification:unexpected-changed-count:1",
        `planning-mutation-proof-verification:unexpected-changed-file:${unexpectedPath}`,
        `claim-ledger:file:${unexpectedPath}:proposal:not-proven`,
        `claim-ledger:file:${unexpectedPath}:authority:invalid`,
        `claim-ledger:file:${unexpectedPath}:verification:failed`,
      ]),
    );
  });

  it("keeps multi-file readback tied to every changed handoff target", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
    });
    const bridge = exactBridgeFor({
      targets: ["src/a.ts", "src/b.ts"],
      currentContentByTargetPath: new Map([
        ["src/a.ts", "status: draft\n"],
        ["src/b.ts", "state: draft\n"],
      ]),
      replacements: [
        { path: "src/a.ts", oldText: "status: draft", newText: "status: ready" },
        { path: "src/b.ts", oldText: "state: draft", newText: "state: ready" },
      ],
    });
    const proofHandoff = await trustedProofHandoff({ bridge, fixture });

    const verification = verifyPlanningMutationProofHandoff({
      bridge,
      proofHandoff,
      verificationIntent: readyHandoffForTargets(["src/a.ts", "src/b.ts"]).verificationIntent,
      readVerifiedFile: fixture.options.readVerifiedFile,
      expectedContentByTargetPath: new Map([
        ["src/a.ts", "status: ready\n"],
        ["src/b.ts", "state: ready\n"],
      ]),
      providerCalled: true,
    });

    expect(proofHandoff.applyState).toBe("hunk-set-applied");
    expect(verification.state).toBe("verified");
    expect(verification.verifiedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(verification.claimLedger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:required-file:src/a.ts",
        "claim-ledger:required-file:src/b.ts",
        "claim-ledger:file:src/a.ts:verification:succeeded",
        "claim-ledger:file:src/b.ts:verification:succeeded",
      ]),
    );
  });
});

async function trustedProofHandoff(input: {
  readonly bridge: ReturnType<typeof buildPlanningMutationProposalBridge>;
  readonly fixture: ReturnType<typeof createFixture>;
}) {
  return runPlanningMutationProofHandoff({
    bridge: input.bridge,
    confirmation: { state: "trusted-confirmed" },
    workspace: {
      scope: "controlled-temp-workspace",
      fencedOptions: input.fixture.options,
      targetSetOptions: input.fixture.options,
    },
  });
}

function exactBridge(currentContent: string) {
  return exactBridgeFor({
    targets: [targetPath],
    currentContentByTargetPath: new Map([[targetPath, currentContent]]),
    replacements: [
      {
        path: targetPath,
        oldText: "  return rankTarget(task);",
        newText: "  return rankTarget(task.trim());",
      },
    ],
  });
}

function exactBridgeFor(input: {
  readonly targets: readonly string[];
  readonly currentContentByTargetPath: ReadonlyMap<string, string>;
  readonly replacements: readonly {
    readonly path: string;
    readonly oldText: string;
    readonly newText: string;
  }[];
}) {
  return buildPlanningMutationProposalBridge({
    requestId: `route209-verification-${input.targets.join("-")}`,
    handoff: readyHandoffForTargets(input.targets),
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: input.replacements,
      verificationPlan: ["readback verifies the controlled fixture"],
    },
    currentContentByTargetPath: input.currentContentByTargetPath,
  });
}

function readyHandoff() {
  return readyHandoffForTargets([targetPath]);
}

function readyHandoffForTargets(targets: readonly string[]) {
  return buildPlanningMutationHandoffProjection({
    editTargets: targets.map((target) => ({
      path: target,
      rationale: "repo score 99; primary-source-name-match",
      handoffRoute: "existing-proof-carrying-mutation-runtime",
      readiness: "ready-for-review",
    })),
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    contextReceipts: targets.map((target, index) => ({
      id: `context-receipt:ctx_mem_${index}:1`,
      path: target,
      summary: "context engine source summary",
      relevance: "target file",
    })),
    readEvidence: targets.map((target, index) => ({
      id: `read-evidence:context_engine_${index}:1`,
      path: target,
      reason: "target file",
      source: "repo-intelligence",
    })),
    expectedChangeSummary: `Prepare a review-only proposal for ${targets.join(", ")}.`,
    verificationIntentSummary: "verificationPlan=verification_plan_123; command=npm test -- --help; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_123"],
  });
}

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route209-verify-"));
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
