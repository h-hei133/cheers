import { describe, expect, it } from "vitest";
import {
  createPwMcpBackendContract,
  mapPwMcpUnavailableEvidence,
} from "../context/pwMcp.js";
import { PW_STATIC_FIXTURE, pwRequest } from "./pwFixtures.js";

describe("Route 127 Playwright MCP optional backend contract", () => {
  it("defines MCP as optional, shared-contract, and not launched", () => {
    const contract = createPwMcpBackendContract();

    expect(contract.kind).toBe("playwright-mcp");
    expect(contract.defaultBackend).toBe(false);
    expect(contract.launched).toBe(false);
    expect(contract.evidenceModel).toBe("pw-report-entry/v1");
    expect(contract.supportedOperations).toEqual(["observe", "extract", "click", "type"]);
    expect(contract.evidence).toContain("pw-mcp:optional-not-default");
    expect(contract.evidence).toContain("pw-mcp:not-launched");
  });

  it("maps unavailable MCP evidence into the same report entry shape", () => {
    const entry = mapPwMcpUnavailableEvidence({
      scenarioId: "mcp-observe-static",
      request: pwRequest("observe", "static", undefined, PW_STATIC_FIXTURE),
      reasonCode: "runtime-disabled",
      evidenceSummary: "MCP backend is optional and was not launched.",
    });

    expect(entry.mode).toBe("skipped");
    expect(entry.outcome).toBe("skip");
    expect(entry.reasonCode).toBe("runtime-disabled");
    expect(entry.redactionStatus).toBe("safe-summary");
    expect(JSON.stringify(entry)).not.toContain("<main>");
  });
});
