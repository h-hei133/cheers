import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import { parseBrowserNetworkTarget } from "./browserNetworkAllowlist.js";

export interface BrowserControlledNetworkOrigin {
  readonly origin: string;
  readonly hostname: "127.0.0.1" | "localhost";
  readonly port: number;
  readonly runId: string;
  readonly evidence: readonly string[];
}

export type BrowserControlledNetworkOriginValidationResult =
  | {
      readonly ok: true;
      readonly origin: BrowserControlledNetworkOrigin;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly redactions: readonly string[];
    };

export function validateBrowserControlledNetworkOrigin(input: {
  readonly origin: string;
  readonly expectedOrigin?: string;
  readonly runId?: string;
}): BrowserControlledNetworkOriginValidationResult {
  const rawOrigin = input.origin;
  if (!rawOrigin || rawOrigin.includes("*")) {
    return invalid("Controlled-network origin cannot be empty or wildcard.");
  }
  const target = parseBrowserNetworkTarget(rawOrigin);
  if (target.hasCredentials) {
    return invalid("Controlled-network origin cannot include URL credentials.", ["url-credentials"]);
  }
  if (target.parseError || target.scheme !== "http" || !target.origin || !target.hostname) {
    return invalid("Controlled-network origin must be a valid http loopback origin.");
  }
  if (target.hostname !== "127.0.0.1" && target.hostname !== "localhost") {
    return invalid("Controlled-network origin must be loopback only.");
  }
  let parsed: URL;
  try {
    parsed = new URL(target.origin);
  } catch {
    return invalid("Controlled-network origin could not be parsed.");
  }
  const port = Number.parseInt(parsed.port, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return invalid("Controlled-network origin must include a valid dynamic port.");
  }
  const normalized = `${parsed.protocol}//${parsed.hostname}:${port}`;
  if (input.expectedOrigin && normalized !== input.expectedOrigin) {
    return invalid("Controlled-network origin does not match the harness-issued origin.");
  }
  const runId = sanitizeRunId(input.runId ?? "controlled-network-run");
  return {
    ok: true,
    origin: {
      origin: normalized,
      hostname: parsed.hostname as "127.0.0.1" | "localhost",
      port,
      runId,
      evidence: [
        "browser-controlled-network-origin:loopback",
        "browser-controlled-network-origin:no-public-internet",
        `browser-controlled-network-origin:run:${runId}`,
      ],
    },
    evidence: [
      "browser-controlled-network-origin:validated",
      "browser-controlled-network-origin:no-network-call",
    ],
  };
}

export function browserControlledNetworkTargetUrl(input: {
  readonly rawTarget?: string;
  readonly controlledOrigin: string;
}): URL | undefined {
  if (!input.rawTarget) {
    return new URL("/", input.controlledOrigin);
  }
  try {
    const parsed = new URL(input.rawTarget, input.controlledOrigin);
    if (parsed.origin !== input.controlledOrigin) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function invalid(
  reason: string,
  redactions: readonly string[] = [],
): BrowserControlledNetworkOriginValidationResult {
  return {
    ok: false,
    reason,
    evidence: [
      "browser-controlled-network-origin:blocked",
      "browser-controlled-network-origin:no-network-call",
    ],
    redactions,
  };
}

function sanitizeRunId(value: string): string {
  return sanitizeBrowserText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "controlled-network-run";
}
