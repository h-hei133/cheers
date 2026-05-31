import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserRuntimeManifest } from "./browser/runtime/core/manifest.js";
import {
  browserRuntimeActionAllowed,
  browserRuntimeOriginAllowed,
  normalizeOriginLike,
} from "./browser/runtime/core/manifest.js";
import type { PwRuntimeStatus } from "./pwRuntime.js";

export type BrowserToolName =
  | "browser.observe"
  | "browser.extract"
  | "browser.click"
  | "browser.type";

export interface BrowserToolPolicyDecision {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function browserToolAvailability(
  status: PwRuntimeStatus,
): BrowserToolPolicyDecision {
  if (status.status === "ready") {
    return decision(true, {
      reasonCode: "ready",
      reason: "Direct Playwright runtime is ready for controlled local browser tools.",
      nextAction: "Run browser tools only through controlled local/test targets.",
      evidence: status.evidence,
    });
  }

  return decision(false, {
    reasonCode: status.reasonCode,
    reason: status.reason,
    nextAction: status.nextAction,
    evidence: status.evidence,
  });
}

export function decideBrowserToolPolicy(input: {
  readonly toolName: BrowserToolName;
  readonly args: Record<string, unknown>;
  readonly runtimeStatus: PwRuntimeStatus;
  readonly manifest: BrowserRuntimeManifest;
}): BrowserToolPolicyDecision {
  const availability = browserToolAvailability(input.runtimeStatus);
  if (!availability.allowed) {
    return availability;
  }

  const actionKind = browserActionKindForTool(input.toolName);
  if (!browserRuntimeActionAllowed(input.manifest, actionKind)) {
    return decision(false, {
      reasonCode: "policy-blocked",
      reason: `Browser action ${actionKind} is not allowed by the controlled runtime manifest.`,
      nextAction: "Use observe/extract/click/type only when the manifest allows that action.",
      evidence: ["browser-tool-policy:manifest-action-blocked"],
    });
  }

  const target = stringArg(input.args, "page") ?? stringArg(input.args, "target");
  const origin = normalizeOriginLike(target ?? input.manifest.allowedOrigins[0] ?? "");
  if (!browserRuntimeOriginAllowed(input.manifest, origin)) {
    return decision(false, {
      reasonCode: "policy-blocked",
      reason: "Browser tool target is outside the controlled local fixture/loopback boundary.",
      nextAction: "Use a local-fixture:// target or an explicitly approved loopback origin.",
      evidence: ["browser-tool-policy:target-origin-blocked"],
    });
  }

  if (isPublicWebTarget(target)) {
    return decision(false, {
      reasonCode: "policy-blocked",
      reason: "Public web automation is blocked for browser agent-loop tools.",
      nextAction: "Use controlled local fixtures only; public browsing requires a separate opt-in route.",
      evidence: ["browser-tool-policy:public-web-blocked"],
    });
  }

  const lowerTarget = `${target ?? ""} ${stringArg(input.args, "selector") ?? ""}`.toLowerCase();
  if (/login|auth|cookie|session|payment|credit|card|upload|download|delete|destroy/.test(lowerTarget)) {
    return decision(false, {
      reasonCode: "policy-blocked",
      reason: "Browser tool target looks like auth, session, payment, upload/download, or destructive flow.",
      nextAction: "Stay within safe local fixture observe/extract/click/type actions.",
      evidence: ["browser-tool-policy:sensitive-target-blocked"],
    });
  }

  if (input.toolName === "browser.type") {
    const valueClassification = stringArg(input.args, "valueClassification");
    const value = stringArg(input.args, "text") ?? "";
    if (valueClassification !== "safe-test-text") {
      return decision(false, {
        reasonCode: "policy-blocked",
        reason: "Typing requires valueClassification=safe-test-text.",
        nextAction: "Classify only non-secret local fixture text as safe-test-text before typing.",
        evidence: ["browser-tool-policy:type-classification-blocked"],
      });
    }
    if (looksSecret(value)) {
      return decision(false, {
        reasonCode: "policy-blocked",
        reason: "Raw secret-looking values cannot be typed by browser tools.",
        nextAction: "Do not send secrets, tokens, passwords, or auth material through browser.type.",
        evidence: ["browser-tool-policy:secret-typing-blocked"],
      });
    }
  }

  return decision(true, {
    reasonCode: "ready",
    reason: "Browser tool policy allowed the controlled local action.",
    nextAction: "Execute through Direct Playwright and return sanitized observation evidence.",
    evidence: ["browser-tool-policy:allowed"],
  });
}

export function browserActionKindForTool(
  toolName: BrowserToolName,
): "observe" | "extract" | "click" | "type" {
  return toolName.slice("browser.".length) as "observe" | "extract" | "click" | "type";
}

export function isBrowserToolName(value: string): value is BrowserToolName {
  return (
    value === "browser.observe" ||
    value === "browser.extract" ||
    value === "browser.click" ||
    value === "browser.type"
  );
}

function decision(
  allowed: boolean,
  input: {
    readonly reasonCode: string;
    readonly reason: string;
    readonly nextAction: string;
    readonly evidence: readonly string[];
  },
): BrowserToolPolicyDecision {
  return {
    allowed,
    reasonCode: sanitizeBrowserText(input.reasonCode, 80),
    reason: sanitizeBrowserText(input.reason, 240),
    nextAction: sanitizeBrowserText(input.nextAction, 240),
    evidence: [
      ...input.evidence,
      `browser-tool-policy:${allowed ? "allowed" : "blocked"}`,
      `browser-tool-policy:reason:${sanitizeBrowserText(input.reasonCode, 80)}`,
      "browser-tool-policy:no-public-web-default",
      "browser-tool-policy:no-auth-session-persistence",
    ],
  };
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0
    ? sanitizeBrowserText(value, 240)
    : undefined;
}

function isPublicWebTarget(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1" &&
        parsed.hostname !== "::1");
  } catch {
    return false;
  }
}

function looksSecret(value: string): boolean {
  return /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|password|token|api[_ -]?key|authorization|cookie|session)\b/i.test(value);
}
