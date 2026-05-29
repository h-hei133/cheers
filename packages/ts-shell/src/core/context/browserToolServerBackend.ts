import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { PwFailureCode } from "./pwEvidence.js";
import {
  type PwReportEntry,
  skippedPwReportEntry,
} from "./pwReport.js";

export interface BrowserToolServerBackendContract {
  readonly kind: "browser-tool-server";
  readonly readiness: "optional" | "unavailable" | "not-launched";
  readonly defaultBackend: false;
  readonly launched: false;
  readonly supportedOperations: readonly ["observe", "extract", "click", "type"];
  readonly evidenceModel: "pw-report-entry/v1";
  readonly lifecycleExpectations: readonly string[];
  readonly directControlTradeoffs: readonly string[];
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly evidence: readonly string[];
}

export interface BrowserToolServerEvidenceInput {
  readonly scenarioId: string;
  readonly request: BrowserExecutionRequest;
  readonly reasonCode?: PwFailureCode;
  readonly evidenceSummary?: string;
}

export function createBrowserToolServerBackendContract(input: {
  readonly readiness?: BrowserToolServerBackendContract["readiness"];
} = {}): BrowserToolServerBackendContract {
  const readiness = input.readiness ?? "not-launched";
  return {
    kind: "browser-tool-server",
    readiness,
    defaultBackend: false,
    launched: false,
    supportedOperations: ["observe", "extract", "click", "type"],
    evidenceModel: "pw-report-entry/v1",
    lifecycleExpectations: [
      "tool server lifecycle is explicit and external to Direct Playwright core runtime.",
      "Tool evidence must map into the same safe summary and reason-code report model.",
      "tool-server backend must not become default browser execution.",
    ],
    directControlTradeoffs: [
      "tool server adds server lifecycle and tool-schema mapping.",
      "Direct Playwright keeps browser/context/page cleanup inside the local control plane.",
    ],
    providerCall: "none",
    modelCall: "none",
    evidence: [
      `browser-tool-server:readiness:${readiness}`,
      "browser-tool-server:optional-not-default",
      "browser-tool-server:not-launched",
      "browser-tool-server:shared-report-contract",
      "browser-tool-server:no-provider-or-model-call",
    ],
  };
}

export function mapBrowserToolServerUnavailableEvidence(input: BrowserToolServerEvidenceInput): PwReportEntry {
  return skippedPwReportEntry({
    scenarioId: input.scenarioId,
    operation: input.request.actionKind,
    mode: "skipped",
    reasonCode: input.reasonCode ?? "runtime-disabled",
    evidenceSummary: input.evidenceSummary ?? "browser tool-server optional backend was not launched.",
  });
}
