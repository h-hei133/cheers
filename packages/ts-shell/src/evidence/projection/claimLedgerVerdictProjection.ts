import type {
  ClaimLedgerNotProvenClaim,
  ClaimLedgerTerminalClaim,
} from "../../orchestration/claimLedgerProjection.js";
import {
  assertNoProductVerdictSuccessUpgrade,
  projectRuntimeTerminalVerdict,
  type ProductCleanupStatus,
  type ProductVerdict,
} from "../verdictFacade.js";

export function projectClaimLedgerProductVerdict(input: {
  readonly terminal: ClaimLedgerTerminalClaim;
  readonly notProvenClaims: readonly ClaimLedgerNotProvenClaim[];
  readonly snapshotStatus: "not-run" | "created" | "blocked";
  readonly recoveryStatus: "not-run" | "available" | "blocked";
}): ProductVerdict {
  return projectRuntimeTerminalVerdict({
    terminalStatus: input.terminal.status,
    resultStatus: input.terminal.resultStatus,
    liveSuccess: input.terminal.liveSuccess,
    reason: input.terminal.reason,
    ...(input.terminal.blocker ? { blocker: input.terminal.blocker } : {}),
    provenance: {
      source: "product-runtime",
      adapter: "claim-ledger",
    },
    redaction: "raw-content-excluded",
    cleanup: cleanupStatusFromClaims({
      snapshotStatus: input.snapshotStatus,
      recoveryStatus: input.recoveryStatus,
    }),
    notProvenReasons: input.notProvenClaims.map((claim) => claim.blocker),
  });
}

export function assertClaimLedgerVerdictNoSuccessUpgrade(input: {
  readonly terminal: ClaimLedgerTerminalClaim;
  readonly notProvenClaims: readonly ClaimLedgerNotProvenClaim[];
  readonly snapshotStatus: "not-run" | "created" | "blocked";
  readonly recoveryStatus: "not-run" | "available" | "blocked";
}): void {
  const verdict = projectClaimLedgerProductVerdict(input);
  assertNoProductVerdictSuccessUpgrade({
    legacyLiveSuccess: input.terminal.liveSuccess,
    legacyTerminalClassification: input.terminal.liveSuccess
      ? "success"
      : "stopped",
    verdict,
  });
}

function cleanupStatusFromClaims(input: {
  readonly snapshotStatus: "not-run" | "created" | "blocked";
  readonly recoveryStatus: "not-run" | "available" | "blocked";
}): ProductCleanupStatus {
  if (input.snapshotStatus === "created" && input.recoveryStatus === "available") {
    return "clean";
  }
  if (input.snapshotStatus === "not-run" && input.recoveryStatus === "not-run") {
    return "not-run";
  }
  return "unknown";
}
