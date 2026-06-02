import type { HostCommandResponse } from "../api/host/contract.js";
import { createHostRuntime } from "../api/host/runtime.js";
import {
  projectHostJsonResponse,
  type HostJsonResponse,
} from "../api/host/io.js";

export type DistributionReadinessStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "skipped"
  | "unsupported"
  | "not-proven";

export interface DistributionReadinessCheck {
  readonly id: string;
  readonly status: DistributionReadinessStatus;
  readonly detail: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface DistributionReadinessResult {
  readonly schemaVersion: "host-distribution-readiness.v1";
  readonly status: DistributionReadinessStatus;
  readonly checks: readonly DistributionReadinessCheck[];
  readonly smoke: {
    readonly importable: DistributionReadinessStatus;
    readonly cliEntrypoint: DistributionReadinessStatus;
    readonly hostCommand: DistributionReadinessStatus;
    readonly jsonOutput: DistributionReadinessStatus;
    readonly defaultProviderOff: DistributionReadinessStatus;
    readonly redaction: DistributionReadinessStatus;
  };
  readonly hostResponse: HostJsonResponse;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export async function assessHostDistributionReadiness(input: {
  readonly packageMetadata: {
    readonly main?: string;
    readonly bin?: Record<string, string>;
  };
  readonly cliEntrypointAvailable: boolean;
}): Promise<DistributionReadinessResult> {
  const host = createHostRuntime();
  const hostResponse = await host.dispatch({
    action: "start-turn",
    inputText: "read a safe file through the package host command",
    mode: "read-only",
    providerMode: "synthetic",
    correlationId: "package-host-smoke",
  });
  const providerBlocked = await host.dispatch({
    action: "start-turn",
    inputText: "live provider must stay blocked",
    mode: "read-only",
    providerMode: "real",
    correlationId: "package-host-provider-block",
  });
  const json = projectHostJsonResponse({ response: hostResponse });
  const checks: DistributionReadinessCheck[] = [
    check(
      "package-import",
      input.packageMetadata.main ? "passed" : "failed",
      input.packageMetadata.main
        ? "package main entry is declared"
        : "package main entry is missing",
    ),
    check(
      "cli-entrypoint",
      input.cliEntrypointAvailable ? "passed" : "failed",
      input.cliEntrypointAvailable
        ? "cli entrypoint is declared"
        : "cli entrypoint is missing",
    ),
    check(
      "host-command",
      hostResponse.accepted ? "passed" : "blocked",
      hostResponse.accepted
        ? "host command dispatch accepted deterministic input"
        : "host command dispatch was blocked",
    ),
    check(
      "json-output",
      isStableJsonShape(json) ? "passed" : "failed",
      isStableJsonShape(json)
        ? "json output carries stable host metadata"
        : "json output shape is incomplete",
    ),
    check(
      "default-provider-off",
      providerBlocked.blockers.some((blocker) => blocker.kind === "provider-blocked")
        ? "passed"
        : "failed",
      "live provider request is blocked by the host surface",
    ),
    check(
      "redaction",
      reportSafe(json) ? "passed" : "failed",
      reportSafe(json)
        ? "report-safe output excludes unsafe raw content"
        : "report-safe output leaked unsafe content",
    ),
    check(
      "truth-boundary",
      hostResponse.terminalSuccessClaim === false &&
        hostResponse.result.terminalSuccessClaim === false &&
        json.terminalSuccessClaim === false
        ? "not-proven"
        : "failed",
      "host, json, and smoke facts do not own terminal success",
    ),
  ];
  const status = summarize(checks);
  return Object.freeze({
    schemaVersion: "host-distribution-readiness.v1",
    status,
    checks,
    smoke: {
      importable: checks[0]?.status ?? "failed",
      cliEntrypoint: checks[1]?.status ?? "failed",
      hostCommand: checks[2]?.status ?? "failed",
      jsonOutput: checks[3]?.status ?? "failed",
      defaultProviderOff: checks[4]?.status ?? "failed",
      redaction: checks[5]?.status ?? "failed",
    },
    hostResponse: json,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "distribution-readiness-is-not-success",
      "package-smoke-is-not-success",
      ...checks.flatMap((item) => item.notProvenClaims),
    ]),
  });
}

export function classifyDistributionReadiness(
  checks: readonly DistributionReadinessCheck[],
): DistributionReadinessStatus {
  return summarize(checks);
}

function check(
  id: string,
  status: DistributionReadinessStatus,
  detail: string,
): DistributionReadinessCheck {
  return Object.freeze({
    id,
    status,
    detail,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      `${id}-is-not-success`,
    ]),
  });
}

function summarize(
  checks: readonly DistributionReadinessCheck[],
): DistributionReadinessStatus {
  if (checks.some((item) => item.status === "failed")) {
    return "failed";
  }
  if (checks.some((item) => item.status === "blocked")) {
    return "blocked";
  }
  if (checks.some((item) => item.status === "unsupported")) {
    return "unsupported";
  }
  if (checks.some((item) => item.status === "not-proven")) {
    return "not-proven";
  }
  if (checks.some((item) => item.status === "skipped")) {
    return "skipped";
  }
  return "passed";
}

function isStableJsonShape(output: HostJsonResponse): boolean {
  return output.schemaVersion === "host-json-response.v1" &&
    Boolean(output.commandId) &&
    output.ordering.eventCount === output.events.length &&
    output.status.terminalSuccessClaim === false &&
    output.resultSummary.terminalSuccessClaim === false &&
    output.exit.terminalSuccessClaim === false;
}

function reportSafe(output: HostJsonResponse): boolean {
  return !/private-agents-real|RAW_OLD_TEXT_SHOULD_NOT_LEAK|RAW_NEW_TEXT_SHOULD_NOT_LEAK|oldText:RAW|newText:RAW|hidden reasoning/i
    .test(JSON.stringify(output));
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
