import { describe, expect, it } from "vitest";

import { runControlledMultifileProofChain } from "./controlledMultifileProofChain.js";

describe("controlledMultifileProofChain", () => {
  it("derives two-file exact success from per-file claims and the claim ledger", async () => {
    const result = await runControlledMultifileProofChain({
      scenario: "success",
    });

    expect(result.providerCalled).toBe(true);
    expect(result.providerCallDuringApply).toBe(false);
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.verifiedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.unattemptedFiles).toEqual([]);
    expect(result.claimLedger.terminal.status).toBe("verification-succeeded-not-live");
    expect(result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(result.claimLedger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:required-file:src/a.ts",
        "claim-ledger:required-file:src/b.ts",
        "claim-ledger:file:src/a.ts:status:changed",
        "claim-ledger:file:src/b.ts:status:changed",
        "claim-ledger:file:src/a.ts:verification:succeeded",
        "claim-ledger:file:src/b.ts:verification:succeeded",
        "claim-ledger:terminal:verification-succeeded-not-live",
      ]),
    );
  });

  it("prevents a partial apply failure from becoming success", async () => {
    const result = await runControlledMultifileProofChain({
      scenario: "partial-apply-failure",
    });

    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles).toEqual(["src/b.ts"]);
    expect(result.unattemptedFiles).toEqual([]);
    expect(result.claimLedger.terminal.status).not.toBe("verified-success");
    expect(result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(result.claimLedger.evidence.join("\n")).toContain("file-apply-src/b.ts");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "route206:provider-call-during-apply:false",
        "route206:no-production-workspace-mutation",
        "route206:no-new-writer",
      ]),
    );
  });

  it("prevents mixed readback verification from becoming success", async () => {
    const result = await runControlledMultifileProofChain({
      scenario: "mixed-verification",
    });

    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.unverifiedFiles).toEqual(["src/b.ts"]);
    expect(result.claimLedger.terminal.status).not.toBe("verified-success");
    expect(result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(result.claimLedger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:file:src/b.ts:verification:failed",
        "claim-ledger:not-proven:terminal:file-failed-src/b.ts",
      ]),
    );
  });

  it("keeps missing readback verification visible and blocks success", async () => {
    const result = await runControlledMultifileProofChain({
      scenario: "verification-missing",
    });

    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.unverifiedFiles).toEqual(["src/b.ts"]);
    expect(result.claimLedger.terminal.status).not.toBe("verified-success");
    expect(result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(result.claimLedger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:file:src/b.ts:verification:not-run",
        "claim-ledger:not-proven:terminal:file-unverified-src/b.ts",
      ]),
    );
  });

  it("keeps unattempted files visible and blocks success after an early failure", async () => {
    const result = await runControlledMultifileProofChain({
      scenario: "unattempted-file",
    });

    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual(["src/a.ts"]);
    expect(result.unattemptedFiles).toEqual(["src/b.ts"]);
    expect(result.claimLedger.terminal.status).not.toBe("verified-success");
    expect(result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(result.claimLedger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:file:src/a.ts:status:failed",
        "claim-ledger:file:src/b.ts:status:unattempted",
        "claim-ledger:not-proven:terminal:file-unattempted-src/b.ts",
      ]),
    );
  });

  it("keeps repair handoff review-only and preserves original failed file evidence", async () => {
    const result = await runControlledMultifileProofChain({
      scenario: "repair-handoff",
    });

    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.unverifiedFiles).toEqual(["src/b.ts"]);
    expect(result.claimLedger.repair.status).toBe("repair-confirmation-required");
    expect(result.claimLedger.terminal.status).toBe("repair-confirmation-required");
    expect(result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(result.claimLedger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:file:src/b.ts:repair:repair-confirmation-required",
        "claim-ledger:verification:failed",
        "claim-ledger:repair:repair-confirmation-required",
      ]),
    );
  });
});
