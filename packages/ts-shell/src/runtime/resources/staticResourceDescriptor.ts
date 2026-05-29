import type {
  ExtensionHookEffect,
  ExtensionLifecycleEventKind,
} from "../extensions/lifecycle.js";
import {
  isExtensionHookEffect,
  isExtensionLifecycleEventKind,
} from "../extensions/lifecycle.js";

export type StaticResourceKind =
  | "skill"
  | "prompt-template"
  | "provider-metadata"
  | "extension-manifest"
  | "package-metadata";

export type StaticResourceRiskLevel = "low" | "medium" | "high";

export interface StaticProviderMetadata {
  readonly providerLabel: string;
  readonly modelLabel?: string;
  readonly endpointClass?: "default" | "openai-compatible" | "custom" | "unknown";
  readonly capabilityFlags: readonly string[];
  readonly defaultEnabled: false;
  readonly requiresOptIn: true;
}

export interface StaticExtensionManifest {
  readonly extensionId: string;
  readonly safeName: string;
  readonly capabilities: readonly string[];
  readonly lifecycleEvents?: readonly ExtensionLifecycleEventKind[];
  readonly hookEffects?: readonly ExtensionHookEffect[];
  readonly toolKinds: readonly string[];
  readonly requiredPermissions: readonly string[];
  readonly executable: false;
  readonly supported: false;
}

export interface StaticResourceDescriptor {
  readonly id: string;
  readonly kind: StaticResourceKind;
  readonly name: string;
  readonly description: string;
  readonly sourceType: "static" | "fixture" | "manual";
  readonly version?: string;
  readonly ownerDomain: string;
  readonly visibility: "runtime" | "planning" | "cli" | "internal";
  readonly enabledByDefault: false;
  readonly requiresOptIn: boolean;
  readonly capabilitiesSummary: readonly string[];
  readonly riskLevel: StaticResourceRiskLevel;
  readonly reportSafeMetadata?: Record<string, string | readonly string[] | boolean | number>;
  readonly providerMetadata?: StaticProviderMetadata;
  readonly extensionManifest?: StaticExtensionManifest;
  readonly notProvenClaims: readonly string[];
}

export type StaticResourceValidationResult =
  | {
      readonly ok: true;
      readonly descriptor: StaticResourceDescriptor;
      readonly redaction: StaticResourceRedaction;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly redaction: StaticResourceRedaction;
    };

export interface StaticResourceRedaction {
  readonly status: "report-safe" | "redacted";
  readonly excluded: readonly string[];
}

export function validateStaticResourceDescriptor(
  descriptor: StaticResourceDescriptor,
): StaticResourceValidationResult {
  const invalidReason = findInvalidDescriptorReason(descriptor);
  const sanitized = sanitizeDescriptor(descriptor);
  if (invalidReason) {
    return {
      ok: false,
      reason: invalidReason,
      redaction: sanitized.redaction,
    };
  }

  return {
    ok: true,
    descriptor: deepFreeze(sanitized.descriptor),
    redaction: sanitized.redaction,
  };
}

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

function findInvalidDescriptorReason(
  descriptor: StaticResourceDescriptor,
): string | undefined {
  if (!descriptor.id || !descriptor.name || !descriptor.description) {
    return "static resource descriptors require id, name, and description";
  }
  if (descriptor.enabledByDefault !== false) {
    return "static resources cannot be enabled by default";
  }
  if (descriptor.providerMetadata) {
    if (descriptor.providerMetadata.defaultEnabled !== false) {
      return "provider metadata cannot enable providers by default";
    }
    if (descriptor.providerMetadata.requiresOptIn !== true) {
      return "provider metadata must require explicit opt-in";
    }
  }
  if (descriptor.extensionManifest) {
    if (descriptor.extensionManifest.executable !== false) {
      return "extension manifests are metadata-only and cannot be executable";
    }
    if (descriptor.extensionManifest.supported !== false) {
      return "extension manifests are not supported for execution";
    }
    for (const eventKind of descriptor.extensionManifest.lifecycleEvents ?? []) {
      if (!isExtensionLifecycleEventKind(eventKind)) {
        return "extension manifest references an unsupported lifecycle event";
      }
    }
    for (const hookEffect of descriptor.extensionManifest.hookEffects ?? []) {
      if (!isExtensionHookEffect(hookEffect)) {
        return "extension manifest references an unsupported hook effect";
      }
    }
  }
  return undefined;
}

function sanitizeDescriptor(descriptor: StaticResourceDescriptor): {
  readonly descriptor: StaticResourceDescriptor;
  readonly redaction: StaticResourceRedaction;
} {
  const sanitized = sanitizeValue(descriptor) as {
    readonly value: StaticResourceDescriptor;
    readonly redacted: boolean;
  };
  return {
    descriptor: {
      ...sanitized.value,
      notProvenClaims: uniqueSorted([
        ...sanitized.value.notProvenClaims,
        "resource-execution",
        "dynamic-discovery",
        "provider-enabled",
        "tool-success",
        "verification-success",
        "terminal-success",
      ]),
    },
    redaction: {
      status: sanitized.redacted ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
  };
}

function sanitizeValue(input: unknown): { readonly value: unknown; readonly redacted: boolean } {
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
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value, redacted: value !== before };
}

function uniqueSorted(input: readonly string[]): readonly string[] {
  return [...new Set(input)].sort();
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
