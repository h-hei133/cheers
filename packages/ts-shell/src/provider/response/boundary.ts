export type ModelResponseSource =
  | "fake_default_safe"
  | "product_fixture"
  | "existing_safe_projection"
  | "unavailable";

export type ModelResponseStatus =
  | "observed"
  | "empty"
  | "failed"
  | "aborted"
  | "unavailable";

export interface ModelResponseBoundaryInput {
  readonly responseId: string;
  readonly turnId?: string;
  readonly providerMode?: "synthetic" | "real" | "default";
  readonly providerSafeLabel?: string;
  readonly modelSafeLabel?: string;
  readonly source: ModelResponseSource;
  readonly status?: ModelResponseStatus;
  readonly assistantContent?: string;
  readonly toolCallCount?: number;
  readonly notProvenClaims?: readonly string[];
}

export interface ModelResponseBoundary {
  readonly responseId: string;
  readonly turnId?: string;
  readonly providerMode: "synthetic" | "real" | "default";
  readonly providerSafeLabel?: string;
  readonly modelSafeLabel?: string;
  readonly source: ModelResponseSource;
  readonly status: ModelResponseStatus;
  readonly assistantContentSummary: string;
  readonly toolCallCount: number;
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider-config",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "reasoning-private",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function createModelResponseBoundary(
  input: ModelResponseBoundaryInput,
): ModelResponseBoundary {
  const responseId = sanitizeText(input.responseId || "response-unavailable");
  const turnId = input.turnId ? sanitizeText(input.turnId) : undefined;
  const providerSafeLabel = input.providerSafeLabel
    ? sanitizeText(input.providerSafeLabel)
    : undefined;
  const modelSafeLabel = input.modelSafeLabel
    ? sanitizeText(input.modelSafeLabel)
    : undefined;
  const summary = summarizeText(input.assistantContent ?? "");
  const redacted = responseId.redacted ||
    (turnId?.redacted ?? false) ||
    (providerSafeLabel?.redacted ?? false) ||
    (modelSafeLabel?.redacted ?? false) ||
    summary.redacted;

  return deepFreeze({
    responseId: responseId.value,
    ...(turnId ? { turnId: turnId.value } : {}),
    providerMode: input.providerMode ?? "default",
    ...(providerSafeLabel ? { providerSafeLabel: providerSafeLabel.value } : {}),
    ...(modelSafeLabel ? { modelSafeLabel: modelSafeLabel.value } : {}),
    source: input.source,
    status: input.status ?? (summary.value === "empty" ? "empty" : "observed"),
    assistantContentSummary: summary.value,
    toolCallCount: Math.max(0, input.toolCallCount ?? 0),
    redaction: {
      status: redacted ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: Object.freeze([
      ...new Set([
        "provider-success",
        "task-success",
        "tool-success",
        "verification-success",
        "terminal-success",
        ...(input.source === "unavailable" ? ["provider-response-unavailable"] : []),
        ...(input.providerMode === "real" ? ["real-provider-response-not-observed"] : []),
        ...(input.notProvenClaims ?? []),
      ]),
    ]),
    terminalSuccessClaim: false,
  });
}

function summarizeText(value: string): { readonly value: string; readonly redacted: boolean } {
  const sanitized = sanitizeText(value);
  if (!sanitized.value.trim()) {
    return { value: "empty", redacted: sanitized.redacted };
  }
  const normalized = sanitized.value.replace(/\s+/g, " ").trim();
  const valueSummary = normalized.length > 160
    ? `${normalized.slice(0, 157)}...`
    : normalized;
  return {
    value: valueSummary,
    redacted: sanitized.redacted,
  };
}

function sanitizeText(value: string): { readonly value: string; readonly redacted: boolean } {
  let redacted = /\[(?:redacted|secret-redacted|raw-content-excluded)/i.test(value);
  let sanitized = value;
  const replacements: readonly [RegExp, string][] = [
    [/\/home\/wang\/\.private-agents-real(?:\/[^\s"'`)]*)?/gi, "[redacted-real-provider-home]"],
    [/\bprovider\.env\b/gi, "provider-config=[redacted]"],
    [/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Authorization: Bearer [secret-redacted]"],
    [/\bBearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [secret-redacted]"],
    [/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]"],
    [/\b(?:token|api[_-]?key|secret)\s*[:=]\s*[^\s"'`]+/gi, "[secret-redacted]"],
    [/\boldText\s*=\s*[^\s"'`]+/gi, "oldText=[raw-content-excluded]"],
    [/\bnewText\s*=\s*[^\s"'`]+/gi, "newText=[raw-content-excluded]"],
    [/raw provider output\s*:\s*[^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]"],
    [/hidden reasoning[^\n\r]*/gi, "reasoning-private=[raw-content-excluded]"],
    [/<[^>]+>/g, "[raw-content-excluded]"],
  ];
  for (const [pattern, replacement] of replacements) {
    const next = sanitized.replace(pattern, replacement);
    redacted ||= next !== sanitized;
    sanitized = next;
  }
  return { value: sanitized, redacted };
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
