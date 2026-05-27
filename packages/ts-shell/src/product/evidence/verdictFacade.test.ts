import { describe, expect, it } from "vitest";

import {
  assertNoProductVerdictSuccessUpgrade,
  projectHistoricalReportVerdict,
  projectProductVerdictFromClaims,
  projectRuntimeTerminalVerdict,
  toReportSafeProjection,
  type ProductClaimInput,
} from "./verdictFacade.js";

describe("product evidence verdict facade", () => {
  it("does not turn not-run or not-proven claims into success", () => {
    const verdict = projectProductVerdictFromClaims({
      claims: [
        claim("mutation", "not-run", "Apply was not run.", "apply-not-run"),
        claim(
          "verification",
          "not-proven",
          "Verification evidence is missing.",
          "verification-not-run",
        ),
      ],
      provenance: { source: "product-runtime" },
      redaction: "raw-content-excluded",
      cleanup: "clean",
      successClaim: true,
    });

    expect(verdict.status).toBe("NOT_PROVEN");
    expect(verdict.terminalClassification).toBe("stopped");
    expect(verdict.notProvenReasons).toEqual(
      expect.arrayContaining(["apply-not-run", "verification-not-run"]),
    );
  });

  it("keeps blocked claims blocked even when a caller passes a success claim", () => {
    const verdict = projectProductVerdictFromClaims({
      claims: [
        claim(
          "authority",
          "blocked",
          "Confirmation is required.",
          "confirmation-required",
        ),
      ],
      provenance: { source: "product-runtime" },
      redaction: "raw-content-excluded",
      cleanup: "not-run",
      successClaim: true,
    });

    expect(verdict.status).toBe("BLOCKED");
    expect(verdict.terminalClassification).toBe("stopped");
    expect(verdict.blockedReasons).toContain("confirmation-required");
  });

  it("projects COMPLETE only from proven claims and an explicit success claim", () => {
    const verdict = projectProductVerdictFromClaims({
      claims: [
        claim("provider", "proven", "Provider receipt exists."),
        claim("mutation", "proven", "Apply receipt exists."),
        claim("verification", "proven", "Verification receipt exists."),
      ],
      provenance: { source: "product-runtime" },
      redaction: "raw-content-excluded",
      cleanup: "clean",
      successClaim: true,
    });

    expect(verdict.status).toBe("COMPLETE");
    expect(verdict.terminalClassification).toBe("success");
    expect(toReportSafeProjection(verdict)).toMatchObject({
      facadeVersion: "v1",
      finalStatus: "COMPLETE",
      redactionStatus: "raw-content-excluded",
      cleanupStatus: "clean",
    });
  });

  it("preserves historical report PARTIAL when audit partial has no PASS rerun", () => {
    const verdict = projectHistoricalReportVerdict({
      routeId: "route227b",
      reportPath:
        "docs/implementation-context/route227b-context-planning-elite-upgrade-report.json",
      finalStatus: "COMPLETE",
      independentAuditResult: "PARTIAL",
    });

    expect(verdict.status).toBe("PARTIAL");
    expect(verdict.partialReasons).toEqual(
      expect.arrayContaining([
        "Audit PARTIAL cannot be projected as COMPLETE without independent PASS rerun.",
      ]),
    );
    expect(verdict.provenance).toMatchObject({
      source: "historical-report",
      routeId: "route227b",
    });
  });

  it("adapts runtime terminal verdicts without upgrading non-live evidence", () => {
    const verdict = projectRuntimeTerminalVerdict({
      terminalStatus: "verification-succeeded-not-live",
      resultStatus: "verification-succeeded",
      liveSuccess: false,
      reason: "Focused verification passed, but evidence is not live.",
      blocker: "not-live-provider-evidence",
      provenance: { source: "product-runtime", adapter: "claim-ledger" },
      redaction: "raw-content-excluded",
      cleanup: "clean",
    });

    expect(verdict.status).toBe("PARTIAL");
    expect(verdict.terminalClassification).toBe("stopped");
    expect(verdict.partialReasons).toContain("not-live-provider-evidence");
  });

  it("keeps Route227/228 PARTIAL and BLOCKED report distinctions", () => {
    expect(
      projectHistoricalReportVerdict({
        routeId: "route228",
        finalStatus: "PARTIAL",
      }).status,
    ).toBe("PARTIAL");
    expect(
      projectHistoricalReportVerdict({
        routeId: "route227a",
        finalStatus: "BLOCKED",
      }).status,
    ).toBe("BLOCKED");
  });

  it("throws if an adapter tries to upgrade legacy non-live success to COMPLETE", () => {
    const verdict = projectProductVerdictFromClaims({
      claims: [claim("verification", "proven", "Focused verification passed.")],
      provenance: { source: "focused-test" },
      redaction: "raw-content-excluded",
      cleanup: "clean",
      successClaim: true,
    });

    expect(() =>
      assertNoProductVerdictSuccessUpgrade({
        legacyLiveSuccess: false,
        verdict,
      }),
    ).toThrow(/non-live-success legacy result to COMPLETE/);
  });
});

function claim(
  group: ProductClaimInput["group"],
  status: ProductClaimInput["status"],
  reason: string,
  blocker?: string,
): ProductClaimInput {
  return {
    group,
    status,
    reason,
    ...(blocker ? { blocker } : {}),
  };
}
