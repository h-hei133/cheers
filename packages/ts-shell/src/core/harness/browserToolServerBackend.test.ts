import { describe, expect, it } from "vitest";
import {
  createBrowserToolServerBackendContract,
  mapBrowserToolServerUnavailableEvidence,
} from "../context/browserToolServerBackend.js";
import { PW_STATIC_FIXTURE, pwRequest } from "./pwFixtures.js";

describe("browser tool-server optional backend contract", () => {
  it("defines tool-server as optional, shared-contract, and not launched", () => {
    const contract = createBrowserToolServerBackendContract();

    expect(contract.kind).toBe("browser-tool-server");
    expect(contract.defaultBackend).toBe(false);
    expect(contract.launched).toBe(false);
    expect(contract.evidenceModel).toBe("pw-report-entry/v1");
    expect(contract.supportedOperations).toEqual(["observe", "extract", "click", "type"]);
    expect(contract.evidence).toContain("browser-tool-server:optional-not-default");
    expect(contract.evidence).toContain("browser-tool-server:not-launched");
  });

  it("maps unavailable tool-server evidence into the same report entry shape", () => {
    const entry = mapBrowserToolServerUnavailableEvidence({
      scenarioId: "tool-server-observe-static",
      request: pwRequest("observe", "static", undefined, PW_STATIC_FIXTURE),
      reasonCode: "runtime-disabled",
      evidenceSummary: "tool-server backend is optional and was not launched.",
    });

    expect(entry.mode).toBe("skipped");
    expect(entry.outcome).toBe("skip");
    expect(entry.reasonCode).toBe("runtime-disabled");
    expect(entry.redactionStatus).toBe("safe-summary");
    expect(JSON.stringify(entry)).not.toContain("<main>");
  });
});
