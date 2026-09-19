import { freezeDeep } from "../../core/values/freeze.js";

export type ExtensionLifecycleEventKind =
  | "session-started"
  | "session-continuation-observed"
  | "turn-started"
  | "turn-completed"
  | "resource-projection-observed"
  | "provider-request-prepared"
  | "provider-payload-projected"
  | "provider-response-observed"
  | "tool-call-prepared"
  | "tool-result-projected"
  | "execution-receipt-observed"
  | "save-point-observed"
  | "result-observed";

export type ExtensionHookEffect =
  | "observe-only"
  | "annotate-evidence"
  | "request-authority"
  | "block-action"
  | "redact-projection"
  | "suggest-next-action"
  | "unsupported";

export type ExtensionForbiddenHookEffect =
  | "force-terminal-success"
  | "rewrite-verification-success"
  | "rewrite-repair-success"
  | "bypass-authority"
  | "execute-provider-by-default"
  | "execute-tool-by-default"
  | "mutate-files"
  | "run-shell"
  | "alter-hidden-transcript"
  | "expose-secrets"
  | "execute-plugin-code";

export type ExtensionHookRiskLevel = "low" | "medium" | "high";

export interface ExtensionLifecycleEventContract {
  readonly kind: ExtensionLifecycleEventKind;
  readonly ownerDomain: string;
  readonly reportSafe: true;
  readonly execution: "not-supported";
  readonly notProvenClaims: readonly string[];
}

export interface ExtensionHookDescriptor {
  readonly hookId: string;
  readonly extensionId: string;
  readonly eventKind: ExtensionLifecycleEventKind;
  readonly ownerDomain: string;
  readonly allowedEffect: ExtensionHookEffect;
  readonly riskLevel: ExtensionHookRiskLevel;
  readonly requiresOptIn: boolean;
  readonly supported: false;
  readonly executable: false;
  readonly registrationMode: "static-internal";
  readonly notProvenClaims: readonly string[];
  readonly reportSafeMetadata?: Record<string, unknown>;
}

export type ExtensionHookDescriptorValidation =
  | {
      readonly ok: true;
      readonly descriptor: ExtensionHookDescriptor;
      readonly redaction: ExtensionHookRedaction;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly redaction: ExtensionHookRedaction;
    };

export interface ExtensionHookResultInput {
  readonly descriptor: ExtensionHookDescriptor;
  readonly requestedEffect: ExtensionHookEffect | ExtensionForbiddenHookEffect;
  readonly summary: string;
  readonly evidenceAnnotations?: readonly string[];
  readonly nextActionSuggestion?: string;
  readonly terminalSuccessClaim?: boolean;
  readonly verificationSuccessRewrite?: boolean;
  readonly repairSuccessRewrite?: boolean;
  readonly authorityBypass?: boolean;
  readonly providerDefaultExecution?: boolean;
  readonly toolDefaultExecution?: boolean;
  readonly fileMutation?: boolean;
  readonly shellExecution?: boolean;
  readonly hiddenTranscriptMutation?: boolean;
  readonly executablePluginCode?: unknown;
  readonly payload?: Record<string, unknown>;
}

export interface ExtensionHookPolicyOutcome {
  readonly hookId: string;
  readonly extensionId: string;
  readonly eventKind: ExtensionLifecycleEventKind;
  readonly requestedEffect: ExtensionHookEffect | ExtensionForbiddenHookEffect;
  readonly acceptedEffect: ExtensionHookEffect | "none";
  readonly status: "accepted" | "rejected";
  readonly reason: string;
  readonly reportSafeSummary: string;
  readonly evidenceAnnotations: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
  readonly redaction: ExtensionHookRedaction;
}

export interface ExtensionHookRedaction {
  readonly status: "report-safe" | "redacted";
  readonly excluded: readonly string[];
}

export function extensionLifecycleEventContract(
  kind: ExtensionLifecycleEventKind,
  ownerDomain: string,
): ExtensionLifecycleEventContract {
  return freezeDeep({
    kind,
    ownerDomain,
    reportSafe: true,
    execution: "not-supported",
    notProvenClaims: extensionNotProvenClaims(),
  });
}

export function isExtensionLifecycleEventKind(
  value: string,
): value is ExtensionLifecycleEventKind {
  return VALID_EVENT_KINDS.has(value as ExtensionLifecycleEventKind);
}

export function isExtensionHookEffect(value: string): value is ExtensionHookEffect {
  return VALID_ALLOWED_EFFECTS.has(value as ExtensionHookEffect);
}

export function validateExtensionHookDescriptor(
  descriptor: ExtensionHookDescriptor,
): ExtensionHookDescriptorValidation {
  const sanitized = sanitizeDescriptor(descriptor);
  const invalidReason = findInvalidDescriptorReason(sanitized.descriptor);
  if (invalidReason) {
    return {
      ok: false,
      reason: invalidReason,
      redaction: sanitized.redaction,
    };
  }
  return {
    ok: true,
    descriptor: freezeDeep(sanitized.descriptor),
    redaction: sanitized.redaction,
  };
}

export function applyExtensionHookPolicy(
  input: ExtensionHookResultInput,
): ExtensionHookPolicyOutcome {
  const validation = validateExtensionHookDescriptor(input.descriptor);
  const sanitizedInput = sanitizeValue(input) as {
    readonly value: ExtensionHookResultInput;
    readonly redacted: boolean;
  };
  const redaction = mergeRedaction(validation.redaction, {
    status: sanitizedInput.redacted ? "redacted" : "report-safe",
    excluded: REDACTION_EXCLUSIONS,
  });
  const sanitized = sanitizedInput.value;
  let rejectionReason: string | undefined;
  if ("reason" in validation) {
    rejectionReason = validation.reason;
  } else {
    rejectionReason = findForbiddenOutcomeReason(sanitized);
  }
  const notProvenClaims = extensionNotProvenClaims([
    ...(validation.ok ? validation.descriptor.notProvenClaims : input.descriptor.notProvenClaims),
    "hook-success",
  ]);

  if (rejectionReason) {
    return freezeDeep({
      hookId: sanitized.descriptor.hookId,
      extensionId: sanitized.descriptor.extensionId,
      eventKind: sanitized.descriptor.eventKind,
      requestedEffect: sanitized.requestedEffect,
      acceptedEffect: "none",
      status: "rejected",
      reason: rejectionReason,
      reportSafeSummary: sanitized.summary,
      evidenceAnnotations: [],
      terminalSuccessClaim: false,
      notProvenClaims,
      redaction,
    });
  }

  return freezeDeep({
    hookId: sanitized.descriptor.hookId,
    extensionId: sanitized.descriptor.extensionId,
    eventKind: sanitized.descriptor.eventKind,
    requestedEffect: sanitized.requestedEffect,
    acceptedEffect: sanitized.requestedEffect as ExtensionHookEffect,
    status: "accepted",
    reason: "hook outcome accepted as evidence-only policy input",
    reportSafeSummary: sanitized.summary,
    evidenceAnnotations: sanitized.evidenceAnnotations ?? [],
    terminalSuccessClaim: false,
    notProvenClaims,
    redaction,
  });
}

function findInvalidDescriptorReason(
  descriptor: ExtensionHookDescriptor,
): string | undefined {
  if (!descriptor.hookId || !descriptor.extensionId || !descriptor.ownerDomain) {
    return "extension hook descriptors require hookId, extensionId, and ownerDomain";
  }
  if (!VALID_EVENT_KINDS.has(descriptor.eventKind)) {
    return "extension hook descriptor uses an unsupported lifecycle event";
  }
  if (!VALID_ALLOWED_EFFECTS.has(descriptor.allowedEffect)) {
    return "extension hook descriptor uses an unsupported allowed effect";
  }
  if (descriptor.supported !== false) {
    return "extension hooks are contract-only and cannot be marked supported";
  }
  if (descriptor.executable !== false) {
    return "extension hooks are metadata-only and cannot be executable";
  }
  if (descriptor.registrationMode !== "static-internal") {
    return "extension hooks must use static internal registration";
  }
  return undefined;
}

function findForbiddenOutcomeReason(input: ExtensionHookResultInput): string | undefined {
  if (FORBIDDEN_EFFECTS.has(input.requestedEffect as ExtensionForbiddenHookEffect)) {
    return `forbidden hook effect rejected: ${input.requestedEffect}`;
  }
  if (input.requestedEffect !== input.descriptor.allowedEffect) {
    return "hook outcome requested an effect outside the descriptor allowance";
  }
  if (input.terminalSuccessClaim === true) {
    return "hook outcomes cannot force terminal success";
  }
  if (input.verificationSuccessRewrite === true) {
    return "hook outcomes cannot rewrite verification success";
  }
  if (input.repairSuccessRewrite === true) {
    return "hook outcomes cannot rewrite repair success";
  }
  if (input.authorityBypass === true) {
    return "hook outcomes cannot bypass authority";
  }
  if (input.providerDefaultExecution === true) {
    return "hook outcomes cannot execute providers by default";
  }
  if (input.toolDefaultExecution === true) {
    return "hook outcomes cannot execute tools by default";
  }
  if (input.fileMutation === true) {
    return "hook outcomes cannot mutate files";
  }
  if (input.shellExecution === true) {
    return "hook outcomes cannot run shell commands";
  }
  if (input.hiddenTranscriptMutation === true) {
    return "hook outcomes cannot alter hidden transcript state";
  }
  if (input.executablePluginCode !== undefined) {
    return "hook outcomes cannot carry executable plugin code";
  }
  return undefined;
}

function sanitizeDescriptor(descriptor: ExtensionHookDescriptor): {
  readonly descriptor: ExtensionHookDescriptor;
  readonly redaction: ExtensionHookRedaction;
} {
  const sanitized = sanitizeValue(descriptor) as {
    readonly value: ExtensionHookDescriptor;
    readonly redacted: boolean;
  };
  return {
    descriptor: {
      ...sanitized.value,
      notProvenClaims: extensionNotProvenClaims(sanitized.value.notProvenClaims),
    },
    redaction: {
      status: sanitized.redacted ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
  };
}

function sanitizeValue(input: unknown): { readonly value: unknown; readonly redacted: boolean } {
  if (typeof input === "function") {
    return { value: "[executable-plugin-code-excluded]", redacted: true };
  }
  if (typeof input === "string") {
    return sanitizeText(input);
  }
  if (Array.isArray(input)) {
    let redacted = false;
    const value = input.map((entry) => {
      const sanitized = sanitizeValue(entry);
      redacted = redacted || sanitized.redacted;
      return sanitized.value;
    });
    return { value, redacted };
  }
  if (input && typeof input === "object") {
    let redacted = false;
    const value: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      const sanitized = sanitizeValue(entry);
      value[key] = sanitized.value;
      redacted = redacted || sanitized.redacted;
    }
    return { value, redacted };
  }
  return { value: input, redacted: false };
}

function sanitizeText(input: string): { readonly value: string; readonly redacted: boolean } {
  let value = input;
  const before = value;
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]");
  value = value.replace(/\bapi[_-]?key[:=][^\s;,)]+/gi, "apiKey=[secret-redacted]");
  value = value.replace(/\bauth(?:orization)?[_-]?header[:=][^\n\r]*/gi, "authHeader=[secret-redacted]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]");
  value = value.replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]");
  value = value.replace(/\bunredacted command output[:=]?[^\n\r]*/gi, "unredacted-command-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/\bfull transcript[:=]?[^\n\r]*/gi, "full-transcript=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value, redacted: value !== before };
}

function mergeRedaction(
  left: ExtensionHookRedaction,
  right: ExtensionHookRedaction,
): ExtensionHookRedaction {
  return {
    status: left.status === "redacted" || right.status === "redacted" ? "redacted" : "report-safe",
    excluded: uniqueSorted([...left.excluded, ...right.excluded]),
  };
}

function extensionNotProvenClaims(extra: readonly string[] = []): readonly string[] {
  return uniqueSorted([
    ...extra,
    "extension-execution",
    "dynamic-discovery",
    "package-loading",
    "plugin-execution",
    "provider-enabled",
    "provider-success",
    "tool-success",
    "verification-success",
    "terminal-success",
  ]);
}

function uniqueSorted(input: readonly string[]): readonly string[] {
  return [...new Set(input)].sort();
}
const VALID_EVENT_KINDS = new Set<ExtensionLifecycleEventKind>([
  "session-started",
  "session-continuation-observed",
  "turn-started",
  "turn-completed",
  "resource-projection-observed",
  "provider-request-prepared",
  "provider-payload-projected",
  "provider-response-observed",
  "tool-call-prepared",
  "tool-result-projected",
  "execution-receipt-observed",
  "save-point-observed",
  "result-observed",
]);

const VALID_ALLOWED_EFFECTS = new Set<ExtensionHookEffect>([
  "observe-only",
  "annotate-evidence",
  "request-authority",
  "block-action",
  "redact-projection",
  "suggest-next-action",
  "unsupported",
]);

const FORBIDDEN_EFFECTS = new Set<ExtensionForbiddenHookEffect>([
  "force-terminal-success",
  "rewrite-verification-success",
  "rewrite-repair-success",
  "bypass-authority",
  "execute-provider-by-default",
  "execute-tool-by-default",
  "mutate-files",
  "run-shell",
  "alter-hidden-transcript",
  "expose-secrets",
  "execute-plugin-code",
]);

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
  "executable-plugin-code",
] as const;
