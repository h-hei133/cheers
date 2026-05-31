import type { StaticResourceDescriptor } from "../../runtime/resources/descriptor.js";

export type ProviderCapabilityState = "supported" | "unsupported" | "unknown";

export type ProviderFailureClass =
  | "provider_config"
  | "provider_auth"
  | "provider_network"
  | "provider_endpoint"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_output_invalid"
  | "provider_output_insufficient"
  | "provider_redaction_failure"
  | "provider_route_error"
  | "provider_unknown";

export interface ProviderCompatibilityFlags {
  readonly developerRole: ProviderCapabilityState;
  readonly systemRole: ProviderCapabilityState;
  readonly toolCalls: ProviderCapabilityState;
  readonly parallelToolCalls: ProviderCapabilityState;
  readonly structuredJsonOutput: ProviderCapabilityState;
  readonly streaming: ProviderCapabilityState;
  readonly reasoningEffort: ProviderCapabilityState;
  readonly strictMessageRoles: ProviderCapabilityState;
  readonly openAICompatibleShape: ProviderCapabilityState;
  readonly customHeaders: ProviderCapabilityState;
  readonly providerSpecificQuirks: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface ProviderFallbackPolicyMetadata {
  readonly fallbackProviderId?: string;
  readonly eligibleFailureClasses: readonly ProviderFailureClass[];
  readonly ineligibleFailureClasses: readonly ProviderFailureClass[];
  readonly maxAttempts: number;
  readonly retryRelation: "none" | "same-request" | "new-request";
  readonly requiresExplicitOptIn: true;
  readonly executesFallback: false;
  readonly redaction: ProviderRegistryRedaction;
  readonly notProvenClaims: readonly string[];
}

export interface ProviderDescriptor {
  readonly providerId: string;
  readonly safeLabel: string;
  readonly providerKind: "openai" | "openai-compatible" | "anthropic" | "google" | "custom" | "unknown";
  readonly endpointClass: "default" | "openai-compatible" | "custom" | "unknown";
  readonly authMode: "api-key" | "account-auth" | "custom-header" | "none" | "unknown";
  readonly defaultEnabled: false;
  readonly requiresExplicitOptIn: true;
  readonly supportsFallback: ProviderCapabilityState;
  readonly compatibility: ProviderCompatibilityFlags;
  readonly fallbackPolicy?: ProviderFallbackPolicyMetadata;
  readonly riskLevel: "low" | "medium" | "high";
  readonly redaction: ProviderRegistryRedaction;
  readonly notProvenClaims: readonly string[];
}

export interface ModelDescriptor {
  readonly modelId: string;
  readonly safeLabel: string;
  readonly providerId: string;
  readonly family: string;
  readonly contextWindow?: number;
  readonly compatibility: ProviderCompatibilityFlags;
  readonly knownLimitations: readonly string[];
  readonly redaction: ProviderRegistryRedaction;
  readonly notProvenClaims: readonly string[];
}

export interface ProviderRequestAuthProjection {
  readonly providerId: string;
  readonly authSourceKind: "cli" | "env" | "connection" | "config" | "none" | "unknown";
  readonly authMode: ProviderDescriptor["authMode"];
  readonly resolutionStatus: "resolved" | "missing" | "expired" | "unsupported" | "unknown";
  readonly missingAuthClass?: Extract<ProviderFailureClass, "provider_config" | "provider_auth">;
  readonly requestCorrelationId?: string;
  readonly redaction: ProviderRegistryRedaction;
  readonly notProvenClaims: readonly string[];
}

export interface ProviderRegistryProjection {
  readonly registryMode: "explicit-metadata";
  readonly dynamicProviderLoading: "disabled";
  readonly externalPackageLoading: "disabled";
  readonly providerDefaultEnablement: "disabled";
  readonly providers: readonly ProviderDescriptor[];
  readonly models: readonly ModelDescriptor[];
  readonly auth: readonly ProviderRequestAuthProjection[];
  readonly fallbackPolicies: readonly ProviderFallbackPolicyMetadata[];
  readonly failureTaxonomy: readonly ProviderFailureClass[];
  readonly resourceDescriptors: readonly StaticResourceDescriptor[];
  readonly redaction: ProviderRegistryRedaction;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface ProviderRegistryRedaction {
  readonly status: "report-safe" | "redacted";
  readonly excluded: readonly string[];
}

export interface ProviderRegistryInput {
  readonly providers: readonly Omit<ProviderDescriptor, "redaction" | "notProvenClaims">[];
  readonly models?: readonly Omit<ModelDescriptor, "redaction" | "notProvenClaims">[];
  readonly auth?: readonly Omit<ProviderRequestAuthProjection, "redaction" | "notProvenClaims">[];
}

export const PROVIDER_FAILURE_TAXONOMY: readonly ProviderFailureClass[] = Object.freeze([
  "provider_config",
  "provider_auth",
  "provider_network",
  "provider_endpoint",
  "provider_rate_limited",
  "provider_timeout",
  "provider_output_invalid",
  "provider_output_insufficient",
  "provider_redaction_failure",
  "provider_route_error",
  "provider_unknown",
]);

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-base-url",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
] as const;

export function unknownProviderCompatibilityFlags(
  claims: readonly string[] = [],
): ProviderCompatibilityFlags {
  return deepFreeze({
    developerRole: "unknown",
    systemRole: "unknown",
    toolCalls: "unknown",
    parallelToolCalls: "unknown",
    structuredJsonOutput: "unknown",
    streaming: "unknown",
    reasoningEffort: "unknown",
    strictMessageRoles: "unknown",
    openAICompatibleShape: "unknown",
    customHeaders: "unknown",
    providerSpecificQuirks: [],
    notProvenClaims: uniqueSorted([
      "provider-compatibility",
      "provider-success",
      "terminal-success",
      ...claims,
    ]),
  });
}

export function classifyProviderFailure(input: {
  readonly status?: number;
  readonly errorName?: string;
  readonly message?: string;
  readonly routeBug?: boolean;
  readonly redactionFailed?: boolean;
  readonly invalidOutput?: boolean;
  readonly insufficientOutput?: boolean;
  readonly missingConfig?: boolean;
  readonly missingAuth?: boolean;
}): ProviderFailureClass {
  if (input.routeBug) return "provider_route_error";
  if (input.redactionFailed) return "provider_redaction_failure";
  if (input.missingAuth) return "provider_auth";
  if (input.missingConfig) return "provider_config";
  if (input.invalidOutput) return "provider_output_invalid";
  if (input.insufficientOutput) return "provider_output_insufficient";
  if (input.status === 401 || input.status === 403) return "provider_auth";
  if (input.status === 408) return "provider_timeout";
  if (input.status === 429) return "provider_rate_limited";
  if (input.status && input.status >= 400) return "provider_endpoint";
  const text = `${input.errorName ?? ""} ${input.message ?? ""}`;
  if (/abort|timeout|timed out/i.test(text)) return "provider_timeout";
  if (/network|fetch|econn|enotfound|unreachable|socket/i.test(text)) {
    return "provider_network";
  }
  return "provider_unknown";
}

export function projectProviderRegistry(
  input: ProviderRegistryInput,
): ProviderRegistryProjection {
  const redactions = new Set<string>();
  const providers = input.providers.map((provider) =>
    sanitizeProviderDescriptor(provider, redactions),
  );
  const models = (input.models ?? []).map((model) =>
    sanitizeModelDescriptor(model, redactions),
  );
  const auth = (input.auth ?? []).map((authProjection) =>
    sanitizeAuthProjection(authProjection, redactions),
  );
  const fallbackPolicies = providers.flatMap((provider) =>
    provider.fallbackPolicy ? [provider.fallbackPolicy] : [],
  );
  const resourceDescriptors = [
    ...providers.map(providerToStaticResource),
    ...models.map(modelToStaticResource),
  ];

  return deepFreeze({
    registryMode: "explicit-metadata",
    dynamicProviderLoading: "disabled",
    externalPackageLoading: "disabled",
    providerDefaultEnablement: "disabled",
    providers,
    models,
    auth,
    fallbackPolicies,
    failureTaxonomy: PROVIDER_FAILURE_TAXONOMY,
    resourceDescriptors,
    redaction: {
      status: redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    terminalSuccessClaim: false,
    notProvenClaims: uniqueSorted([
      "provider-enabled",
      "provider-success",
      "model-compatibility-proven",
      "fallback-executed",
      "auth-secret-available",
      "terminal-success",
    ]),
  });
}

function sanitizeProviderDescriptor(
  input: Omit<ProviderDescriptor, "redaction" | "notProvenClaims">,
  redactions: Set<string>,
): ProviderDescriptor {
  const fallbackPolicy = input.fallbackPolicy
    ? sanitizeFallbackPolicy(input.fallbackPolicy, redactions)
    : undefined;
  return deepFreeze({
    providerId: sanitizeText(input.providerId, redactions),
    safeLabel: sanitizeText(input.safeLabel, redactions),
    providerKind: input.providerKind,
    endpointClass: input.endpointClass,
    authMode: input.authMode,
    defaultEnabled: false,
    requiresExplicitOptIn: true,
    supportsFallback: input.supportsFallback,
    compatibility: sanitizeCompatibility(input.compatibility, redactions),
    ...(fallbackPolicy ? { fallbackPolicy } : {}),
    riskLevel: input.riskLevel,
    redaction: {
      status: redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: uniqueSorted([
      "provider-enabled",
      "provider-success",
      "terminal-success",
      ...input.compatibility.notProvenClaims,
    ]),
  });
}

function sanitizeModelDescriptor(
  input: Omit<ModelDescriptor, "redaction" | "notProvenClaims">,
  redactions: Set<string>,
): ModelDescriptor {
  return deepFreeze({
    modelId: sanitizeText(input.modelId, redactions),
    safeLabel: sanitizeText(input.safeLabel, redactions),
    providerId: sanitizeText(input.providerId, redactions),
    family: sanitizeText(input.family, redactions),
    ...(input.contextWindow ? { contextWindow: input.contextWindow } : {}),
    compatibility: sanitizeCompatibility(input.compatibility, redactions),
    knownLimitations: input.knownLimitations.map((item) =>
      sanitizeText(item, redactions),
    ),
    redaction: {
      status: redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: uniqueSorted([
      "model-compatibility-proven",
      "provider-success",
      "terminal-success",
      ...input.compatibility.notProvenClaims,
    ]),
  });
}

function sanitizeFallbackPolicy(
  input: ProviderFallbackPolicyMetadata,
  redactions: Set<string>,
): ProviderFallbackPolicyMetadata {
  return deepFreeze({
    ...(input.fallbackProviderId
      ? { fallbackProviderId: sanitizeText(input.fallbackProviderId, redactions) }
      : {}),
    eligibleFailureClasses: input.eligibleFailureClasses,
    ineligibleFailureClasses: input.ineligibleFailureClasses,
    maxAttempts: Math.max(0, input.maxAttempts),
    retryRelation: input.retryRelation,
    requiresExplicitOptIn: true,
    executesFallback: false,
    redaction: {
      status: redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: uniqueSorted([
      "fallback-executed",
      "provider-success",
      "terminal-success",
      ...input.notProvenClaims,
    ]),
  });
}

function sanitizeAuthProjection(
  input: Omit<ProviderRequestAuthProjection, "redaction" | "notProvenClaims">,
  redactions: Set<string>,
): ProviderRequestAuthProjection {
  return deepFreeze({
    providerId: sanitizeText(input.providerId, redactions),
    authSourceKind: input.authSourceKind,
    authMode: input.authMode,
    resolutionStatus: input.resolutionStatus,
    ...(input.missingAuthClass ? { missingAuthClass: input.missingAuthClass } : {}),
    ...(input.requestCorrelationId
      ? { requestCorrelationId: sanitizeText(input.requestCorrelationId, redactions) }
      : {}),
    redaction: {
      status: redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: uniqueSorted([
      "auth-secret-available",
      "provider-success",
      "terminal-success",
    ]),
  });
}

function sanitizeCompatibility(
  input: ProviderCompatibilityFlags,
  redactions: Set<string>,
): ProviderCompatibilityFlags {
  return deepFreeze({
    developerRole: input.developerRole,
    systemRole: input.systemRole,
    toolCalls: input.toolCalls,
    parallelToolCalls: input.parallelToolCalls,
    structuredJsonOutput: input.structuredJsonOutput,
    streaming: input.streaming,
    reasoningEffort: input.reasoningEffort,
    strictMessageRoles: input.strictMessageRoles,
    openAICompatibleShape: input.openAICompatibleShape,
    customHeaders: input.customHeaders,
    providerSpecificQuirks: input.providerSpecificQuirks.map((quirk) =>
      sanitizeText(quirk, redactions),
    ),
    notProvenClaims: uniqueSorted([
      "provider-compatibility",
      "terminal-success",
      ...input.notProvenClaims,
    ]),
  });
}

function providerToStaticResource(provider: ProviderDescriptor): StaticResourceDescriptor {
  return {
    id: `provider.${provider.providerId}`,
    kind: "provider-metadata",
    name: provider.safeLabel,
    description: `${provider.safeLabel} provider metadata. Execution disabled by default.`,
    sourceType: "static",
    ownerDomain: "provider",
    visibility: "runtime",
    enabledByDefault: false,
    requiresOptIn: true,
    capabilitiesSummary: compatibilitySummary(provider.compatibility),
    riskLevel: provider.riskLevel,
    providerMetadata: {
      providerLabel: provider.safeLabel,
      endpointClass: provider.endpointClass,
      capabilityFlags: compatibilitySummary(provider.compatibility),
      defaultEnabled: false,
      requiresOptIn: true,
    },
    reportSafeMetadata: {
      providerId: provider.providerId,
      authMode: provider.authMode,
      supportsFallback: provider.supportsFallback,
      fallbackExecutes: false,
    },
    notProvenClaims: provider.notProvenClaims,
  };
}

function modelToStaticResource(model: ModelDescriptor): StaticResourceDescriptor {
  return {
    id: `provider.${model.providerId}.model.${model.modelId}`,
    kind: "provider-metadata",
    name: model.safeLabel,
    description: `${model.safeLabel} model metadata. Compatibility is observational.`,
    sourceType: "static",
    ownerDomain: "provider",
    visibility: "runtime",
    enabledByDefault: false,
    requiresOptIn: true,
    capabilitiesSummary: compatibilitySummary(model.compatibility),
    riskLevel: "medium",
    providerMetadata: {
      providerLabel: model.providerId,
      modelLabel: model.safeLabel,
      endpointClass: "unknown",
      capabilityFlags: compatibilitySummary(model.compatibility),
      defaultEnabled: false,
      requiresOptIn: true,
    },
    reportSafeMetadata: {
      providerId: model.providerId,
      family: model.family,
      contextWindow: model.contextWindow ?? 0,
    },
    notProvenClaims: model.notProvenClaims,
  };
}

function compatibilitySummary(flags: ProviderCompatibilityFlags): readonly string[] {
  return Object.freeze(
    [
      `developer-role:${flags.developerRole}`,
      `system-role:${flags.systemRole}`,
      `tool-calls:${flags.toolCalls}`,
      `parallel-tool-calls:${flags.parallelToolCalls}`,
      `json-output:${flags.structuredJsonOutput}`,
      `streaming:${flags.streaming}`,
      `reasoning-effort:${flags.reasoningEffort}`,
      `strict-roles:${flags.strictMessageRoles}`,
      `openai-compatible:${flags.openAICompatibleShape}`,
      `custom-headers:${flags.customHeaders}`,
      ...flags.providerSpecificQuirks.map((quirk) => `quirk:${quirk}`),
    ].sort(),
  );
}

function sanitizeText(input: string, redactions: Set<string>): string {
  let value = input.trim();
  const before = value;
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]");
  value = value.replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]");
  value = value.replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]");
  value = value.replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]");
  value = value.replace(/\bhttps?:\/\/[^\s]+/gi, "[redacted-endpoint]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]");
  value = value.replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  if (value !== before) {
    redactions.add("unsafe-provider-metadata");
  }
  return value.length > 0 ? value.slice(0, 180) : "redacted-empty";
}

function uniqueSorted(input: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(input)].sort());
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
