export type ResourceScope =
  | "built_in"
  | "workspace"
  | "project"
  | "user"
  | "session"
  | "test_fixture"
  | "unknown";

export type ResourceTrustLevel =
  | "trusted"
  | "user_approved"
  | "project_declared"
  | "untrusted"
  | "blocked"
  | "unknown";

export type ResourceSourceKind =
  | "built_in"
  | "workspace"
  | "project"
  | "user"
  | "session"
  | "test_fixture"
  | "external"
  | "unknown";

export interface ResourceTrustPolicyProjection {
  readonly sourceKind: ResourceSourceKind;
  readonly sourceLabel: string;
  readonly scope: ResourceScope;
  readonly trustLevel: ResourceTrustLevel;
  readonly trustProof: "declared" | "user-approved" | "built-in-policy" | "blocked" | "absent";
  readonly canLoadPackage: false;
  readonly canExecutePlugin: false;
  readonly canEnableProvider: false;
  readonly trustIsSafetyProof: false;
  readonly reportSafeSummary: string;
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
}

export function projectResourceTrustPolicy(input: {
  readonly sourceKind: ResourceSourceKind;
  readonly sourceLabel: string;
  readonly scope: ResourceScope;
  readonly trustLevel: ResourceTrustLevel;
  readonly trustProof?: ResourceTrustPolicyProjection["trustProof"];
  readonly notProvenClaims?: readonly string[];
}): ResourceTrustPolicyProjection {
  const redactions = new Set<string>();
  const sourceLabel = sanitizeWithTracking(input.sourceLabel, redactions, 140);
  const trustProof = input.trustProof ?? inferTrustProof(input.trustLevel);

  return deepFreeze({
    sourceKind: input.sourceKind,
    sourceLabel,
    scope: input.scope,
    trustLevel: input.trustLevel,
    trustProof,
    canLoadPackage: false,
    canExecutePlugin: false,
    canEnableProvider: false,
    trustIsSafetyProof: false,
    reportSafeSummary: `${input.scope}:${input.sourceKind}:${sourceLabel}:${input.trustLevel}`,
    redaction: {
      status: redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: unique([
      "package-install",
      "package-loading",
      "plugin-execution",
      "script-execution",
      "trust-verification",
      "provider-success",
      "tool-success",
      "verification-success",
      "terminal-success",
      ...(input.notProvenClaims ?? []),
    ]),
  });
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider-env",
  "auth-headers",
  "provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
  "install-scripts",
  "executable-plugin-code",
] as const;

function inferTrustProof(
  trustLevel: ResourceTrustLevel,
): ResourceTrustPolicyProjection["trustProof"] {
  switch (trustLevel) {
    case "trusted":
      return "built-in-policy";
    case "user_approved":
      return "user-approved";
    case "project_declared":
      return "declared";
    case "blocked":
      return "blocked";
    default:
      return "absent";
  }
}

function sanitizeWithTracking(
  value: string,
  redactions: Set<string>,
  maxLength: number,
): string {
  const sanitized = sanitizeText(value).value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  if (sanitizeText(value).redacted) {
    redactions.add("unsafe-content-redacted");
  }
  if (value.length > maxLength) {
    redactions.add("output-truncated");
  }
  return sanitized;
}

function sanitizeText(input: string): {
  readonly value: string;
  readonly redacted: boolean;
} {
  let value = input;
  const before = value;
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]");
  value = value.replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]");
  value = value.replace(/\bauthorization[:=][^\s;,)]+/gi, "authorization=[secret-redacted]");
  value = value.replace(/\bapi[_-]?key[:=][^\s;,)]+/gi, "apiKey=[secret-redacted]");
  value = value.replace(/\bauth(?:orization)?[_-]?header[:=][^\n\r]*/gi, "authHeader=[secret-redacted]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider-env=[redacted]");
  value = value.replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output[:=][^\n\r]*/gi, "provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/\b(?:install script|postinstall|preinstall)[:=]?[^\n\r]*/gi, "install-script=[raw-content-excluded]");
  value = value.replace(/\bnpm\s+install\b[^\n\r]*/gi, "install-script=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value, redacted: value !== before };
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
