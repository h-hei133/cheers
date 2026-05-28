import { describe, expect, it } from "vitest";

import { projectHistoricalReportVerdict } from "./historicalReportVerdict.js";

describe("historical report verdict compatibility", () => {
  it("does not project audited PARTIAL historical evidence as COMPLETE without a PASS rerun", () => {
    const verdict = projectHistoricalReportVerdict({
      routeId: "Route227",
      reportPath: "docs/evidence/history/route-reports/route227.json",
      finalStatus: "COMPLETE",
      independentAuditResult: "PARTIAL",
      independentPassRerunResult: "FAIL",
      redaction: "redacted",
      cleanup: "clean",
    });

    expect(verdict).toMatchObject({
      status: "PARTIAL",
      terminalClassification: "stopped",
      redaction: "redacted",
      cleanup: "clean",
      provenance: {
        source: "historical-report",
        routeId: "Route227",
        adapter: "historical-report-verdict",
      },
    });
    expect(verdict.partialReasons).toContain(
      "Audit PARTIAL cannot be projected as COMPLETE without independent PASS rerun.",
    );
  });

  it("keeps missing historical finalStatus not proven", () => {
    const verdict = projectHistoricalReportVerdict({
      routeId: "Route228",
    });

    expect(verdict.status).toBe("NOT_PROVEN");
    expect(verdict.terminalClassification).toBe("stopped");
    expect(verdict.notProvenReasons).toContain(
      "Historical report finalStatus is missing or unknown.",
    );
  });
});
