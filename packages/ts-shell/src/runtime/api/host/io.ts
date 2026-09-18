import type {
  HostCommandBlocker,
  HostCommandResponse,
  HostExitClassification,
  HostExitSummary,
} from "./contract.js";
import { hostBlocker, hostDiagnostic, sanitizeHostText } from "./contract.js";
import {
  projectHostEventEnvelopes,
  type HostEventEnvelope,
} from "../../events/host/envelope.js";

export interface HostJsonResponse {
  readonly schemaVersion: "host-json-response.v1";
  readonly commandId: string;
  readonly action: HostCommandResponse["action"];
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly accepted: boolean;
  readonly ordering: {
    readonly eventCount: number;
    readonly firstEventOrder?: number;
    readonly lastEventOrder?: number;
  };
  readonly events: readonly HostEventEnvelope[];
  readonly status: HostCommandResponse["status"];
  readonly finalResponse: {
    readonly status: HostCommandResponse["result"]["status"];
    readonly nextAction: string;
    readonly terminalSuccessClaim: false;
    readonly notProvenClaims: readonly string[];
  };
  readonly resultSummary: HostCommandResponse["result"];
  readonly diagnostics: HostCommandResponse["diagnostics"];
  readonly blockers: HostCommandResponse["blockers"];
  readonly redactedDetails: HostCommandResponse["details"]["redaction"];
  readonly replayFacts?: HostCommandResponse["details"]["replayFacts"];
  readonly truthFacts?: HostCommandResponse["details"]["truth"];
  readonly evaluation?: HostCommandResponse["details"]["evaluation"];
  readonly exit: HostExitSummary;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function parseHostJsonInput(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }
  return JSON.parse(trimmed) as unknown;
}

export function projectHostJsonResponse(input: {
  readonly response: HostCommandResponse;
  readonly commandId?: string;
}): HostJsonResponse {
  const response = input.response;
  const commandId = sanitizeHostText(
    input.commandId ?? response.correlationId,
  );
  const turnId = response.status.activeTurnId;
  const events = projectHostEventEnvelopes({
    events: response.events,
    correlationId: response.correlationId,
    ...(response.sessionId ? { sessionId: response.sessionId } : {}),
    ...(turnId ? { turnId } : {}),
  });
  const firstEventOrder = events.at(0)?.order;
  const lastEventOrder = events.at(-1)?.order;
  const exit = classifyHostExit(response);

  return Object.freeze<HostJsonResponse>({
    schemaVersion: "host-json-response.v1",
    commandId,
    action: response.action,
    ...(response.sessionId ? { sessionId: response.sessionId } : {}),
    ...(turnId ? { turnId } : {}),
    accepted: response.accepted,
    ordering: {
      eventCount: events.length,
      ...(firstEventOrder !== undefined ? { firstEventOrder } : {}),
      ...(lastEventOrder !== undefined ? { lastEventOrder } : {}),
    },
    events,
    status: response.status,
    finalResponse: {
      status: response.result.status,
      nextAction: response.status.nextAction,
      terminalSuccessClaim: false,
      notProvenClaims: response.result.notProvenClaims,
    },
    resultSummary: response.result,
    diagnostics: response.diagnostics,
    blockers: response.blockers,
    redactedDetails: response.details.redaction,
    ...(response.details.replayFacts
      ? { replayFacts: response.details.replayFacts }
      : {}),
    ...(response.details.truth ? { truthFacts: response.details.truth } : {}),
    ...(response.details.evaluation ? { evaluation: response.details.evaluation } : {}),
    exit,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "json-output-is-not-success",
      "cli-exit-zero-is-not-success",
      ...response.notProvenClaims,
      ...exit.notProvenClaims,
    ]),
  });
}

export function projectHostJsonError(input: {
  readonly error: unknown;
  readonly commandId?: string;
}): HostJsonResponse {
  const detail = sanitizeHostText(
    input.error instanceof Error ? input.error.message : String(input.error),
  );
  const response: HostCommandResponse = {
    schemaVersion: "host-command-response.v1",
    action: "get-status",
    correlationId: sanitizeHostText(input.commandId ?? "host-json-error"),
    accepted: false,
    events: [],
    status: {
      statusId: "host-status:internal-error",
      lifecycle: "blocked",
      eventCount: 0,
      blockerCount: 1,
      nextAction: "inspect host command input",
      terminalSuccessClaim: false,
      notProvenClaims: [
        "terminal-success",
        "host-internal-error-is-not-success",
      ],
    },
    result: {
      status: "blocked",
      terminalClassification: "error",
      evidenceVerdictStatus: "not-proven",
      resultVerdictStatus: "not_proven",
      terminalSuccessClaim: false,
      notProvenClaims: [
        "terminal-success",
        "host-internal-error-is-not-success",
      ],
    },
    diagnostics: [
      hostDiagnostic("host.input.parse-error", "error", detail),
    ],
    blockers: [
      hostBlocker("invalid-envelope", "host.input.parse-error", detail),
    ],
    details: {
      redaction: {
        status: "report-safe",
        excluded: redactionExclusions(),
      },
    },
    terminalSuccessClaim: false,
    notProvenClaims: [
      "terminal-success",
      "host-internal-error-is-not-success",
    ],
  };
  return projectHostJsonResponse({
    response,
    commandId: input.commandId ?? "host-json-error",
  });
}

export function classifyHostExit(response: HostCommandResponse): HostExitSummary {
  const classification = hostExitClassification(response);
  return Object.freeze({
    classification,
    code: codeFor(classification),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "exit-classification-is-not-success",
      ...(classification === "success-proof"
        ? []
        : ["missing-complete-evidence-result-verdict"]),
    ]),
  });
}

function hostExitClassification(
  response: HostCommandResponse,
): HostExitClassification {
  if (response.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "internal-error";
  }
  if (hasBlocker(response.blockers, "invalid-envelope")) {
    return "invalid-input";
  }
  if (hasBlocker(response.blockers, "unsupported-command")) {
    return "unsupported";
  }
  if (hasBlocker(response.blockers, "cancel-requested")) {
    return "cancelled";
  }
  if (hasBlocker(response.blockers, "stop-requested")) {
    return "stopped";
  }
  if (response.status.lifecycle === "cancelled") {
    return "cancelled";
  }
  if (response.status.lifecycle === "stopped") {
    return "stopped";
  }
  if (response.result.terminalClassification === "error") {
    return "failed";
  }
  if (response.blockers.length > 0 || response.status.lifecycle === "blocked") {
    return "blocked";
  }
  if (
    response.result.terminalClassification === "success" &&
    response.details.truth?.completeProof === true
  ) {
    return "success-proof";
  }
  return "completed-without-proof";
}

function hasBlocker(
  blockers: readonly HostCommandBlocker[],
  kind: HostCommandBlocker["kind"],
): boolean {
  return blockers.some((blocker) => blocker.kind === kind);
}

function codeFor(classification: HostExitClassification): HostExitSummary["code"] {
  switch (classification) {
    case "success-proof":
    case "completed-without-proof":
      return 0;
    case "blocked":
      return 1;
    case "failed":
      return 2;
    case "invalid-input":
      return 3;
    case "unsupported":
      return 4;
    case "cancelled":
      return 5;
    case "stopped":
      return 6;
    case "internal-error":
      return 70;
  }
}

function redactionExclusions(): readonly string[] {
  return [
    "raw-transcript",
    "provider-output",
    "command-output",
    "edit-text",
    "patch-body",
    "hidden-reasoning",
    "secret",
    "token",
    "header",
    "private-path",
  ];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
