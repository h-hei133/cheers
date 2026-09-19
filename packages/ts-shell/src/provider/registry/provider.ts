import { freezeDeep } from "../../core/values/freeze.js";
import type { StaticResourceDescriptor } from "../../runtime/resources/descriptor.js";

export type ProviderCapabilityState = "supported" | "unsupported" | "unknown";

export type ProviderFailureClass =
  | "provider_config"
  | "provider_config_invalid"
  | "provider_config_unsafe"
  | "provider_auth"
  | "provider_network"
  | "provider_endpoint"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_cancelled"
  | "provider_response_malformed"
  | "provider_safety_block"
  | "provider_stream_protocol_error"
  | "provider_stream_event_malformed"
  | "provider_output_invalid"
  | "provider_output_insufficient"
  | "provider_redaction_failure"
  | "provider_route_error"
  | "provider_fallback_eligible"
  | "provider_fallback_ineligible"
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

export type ProviderSupportedMode =
  | "synthetic"
  | "injected"
  | "live-opt-in"
  | "streaming"
  | "tool-calls"
  | "structured-output";

export type ProviderCompatibilityState =
  | "supported"
  | "unsupported"
  | "not-proven";

export interface ProviderCompatibilityMatrixEntry {
  readonly providerId: string;
  readonly modelId?: string;
  readonly providerSafeLabel: string;
  readonly modelSafeLabel?: string;
  readonly state: ProviderCompatibilityState;
  readonly supportedModes: readonly ProviderSupportedMode[];
  readonly streamingSupport: ProviderCapabilityState;
  readonly toolCallSupport: ProviderCapabilityState;
  readonly structuredOutputSupport: ProviderCapabilityState;
  readonly authRequirement: ProviderDescriptor["authMode"];
  readonly optInRequirement: "required";
  readonly fallbackEligibility: ProviderCapabilityState;
  readonly knownUnsupportedStates: readonly string[];
  readonly redaction: ProviderRegistryRedaction;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export type ProviderConfigReadinessState =
  | "ready"
  | "missing-config"
  | "invalid-config"
  | "missing-auth"
  | "auth-redacted-present"
  | "unsafe-config"
  | "unsupported-provider"
  | "unsupported-model"
  | "unsupported-mode"
  | "opt-in-required"
  | "unknown";

export interface ProviderReadinessMatrixEntry {
  readonly providerId: string;
  readonly modelId?: string;
  readonly configState: ProviderConfigReadinessState;
  readonly authState: ProviderRequestAuthProjection["resolutionStatus"] | "redacted-present";
  readonly blockers: readonly string[];
  readonly redaction: ProviderRegistryRedaction;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface ProviderFallbackPolicyMetadata {
  readonly fallbackProviderId?: string;
  readonly eligibleFailureClasses: readonly ProviderFailureClass[];
  readonly ineligibleFailureClasses: readonly ProviderFailureClass[];
  readonly maxAttempts: number;
  readonly retryRelation: "none" | "same-request" | "new-request";
  readonly requiresExplicitOptIn: true;
  readonly executesFallback: boolean;
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
  readonly compatibilityMatrix: readonly ProviderCompatibilityMatrixEntry[];
  readonly readinessMatrix: readonly ProviderReadinessMatrixEntry[];
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
  "provider_config_invalid",
  "provider_config_unsafe",
  "provider_auth",
  "provider_network",
  "provider_endpoint",
  "provider_rate_limited",
  "provider_timeout",
  "provider_cancelled",
  "provider_response_malformed",
  "provider_safety_block",
  "provider_stream_protocol_error",
  "provider_stream_event_malformed",
  "provider_output_invalid",
  "provider_output_insufficient",
  "provider_redaction_failure",
  "provider_route_error",
  "provider_fallback_eligible",
  "provider_fallback_ineligible",
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
  return freezeDeep({
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
  readonly cancelled?: boolean;
  readonly streamProtocolError?: boolean;
  readonly malformedStreamEvent?: boolean;
  readonly fallbackEligible?: boolean;
  readonly fallbackIneligible?: boolean;
}): ProviderFailureClass {
  if (input.routeBug) return "provider_route_error";
  if (input.redactionFailed) return "provider_redaction_failure";
  if (/safety|content filter|content_filter/i.test(input.message ?? "")) {
    return "provider_safety_block";
  }
  if (/malformed response|invalid response json|response schema/i.test(input.message ?? "")) {
    return "provider_response_malformed";
  }
  if (input.malformedStreamEvent) return "provider_stream_event_malformed";
  if (input.streamProtocolError) return "provider_stream_protocol_error";
  if (input.cancelled) return "provider_cancelled";
  if (input.fallbackEligible) return "provider_fallback_eligible";
  if (input.fallbackIneligible) return "provider_fallback_ineligible";
  if (input.missingAuth) return "provider_auth";
  if (input.missingConfig) return "provider_config";
  if (input.invalidOutput) return "provider_output_invalid";
  if (input.insufficientOutput) return "provider_output_insufficient";
  if (input.status === 401 || input.status === 403) return "provider_auth";
  if (input.status === 408) return "provider_timeout";
  if (input.status === 429) return "provider_rate_limited";
  if (input.status && input.status >= 400) return "provider_endpoint";
  const text = `${input.errorName ?? ""} ${input.message ?? ""}`;
  if (/cancelled|canceled|user abort|provider abort/i.test(text)) return "provider_cancelled";
  if (/stream protocol|sse protocol|invalid frame|unexpected eof/i.test(text)) {
    return "provider_stream_protocol_error";
  }
  if (/malformed stream|malformed event|invalid stream event/i.test(text)) {
    return "provider_stream_event_malformed";
  }
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
  const compatibilityMatrix = createCompatibilityMatrix({ providers, models, redactions });
  const readinessMatrix = createReadinessMatrix({ providers, models, auth, redactions });
  const fallbackPolicies = providers.flatMap((provider) =>
    provider.fallbackPolicy ? [provider.fallbackPolicy] : [],
  );
  const resourceDescriptors = [
    ...providers.map(providerToStaticResource),
    ...models.map(modelToStaticResource),
  ];

  return freezeDeep({
    registryMode: "explicit-metadata",
    dynamicProviderLoading: "disabled",
    externalPackageLoading: "disabled",
    providerDefaultEnablement: "disabled",
    providers,
    models,
    auth,
    compatibilityMatrix,
    readinessMatrix,
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
  return freezeDeep({
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
  return freezeDeep({
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
  return freezeDeep({
    ...(input.fallbackProviderId
      ? { fallbackProviderId: sanitizeText(input.fallbackProviderId, redactions) }
      : {}),
    eligibleFailureClasses: input.eligibleFailureClasses,
    ineligibleFailureClasses: input.ineligibleFailureClasses,
    maxAttempts: Math.max(0, input.maxAttempts),
    retryRelation: input.retryRelation,
    requiresExplicitOptIn: true,
    executesFallback: input.executesFallback === true,
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
  return freezeDeep({
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

function createCompatibilityMatrix(input: {
  readonly providers: readonly ProviderDescriptor[];
  readonly models: readonly ModelDescriptor[];
  readonly redactions: Set<string>;
}): readonly ProviderCompatibilityMatrixEntry[] {
  const entries: ProviderCompatibilityMatrixEntry[] = [];
  for (const provider of input.providers) {
    const providerModels = input.models.filter((model) => model.providerId === provider.providerId);
    if (providerModels.length === 0) {
      entries.push(compatibilityEntry({ provider, redactions: input.redactions }));
    }
    for (const model of providerModels) {
      entries.push(compatibilityEntry({ provider, model, redactions: input.redactions }));
    }
  }
  return Object.freeze(entries);
}

function compatibilityEntry(input: {
  readonly provider: ProviderDescriptor;
  readonly model?: ModelDescriptor;
  readonly redactions: Set<string>;
}): ProviderCompatibilityMatrixEntry {
  const flags = input.model?.compatibility ?? input.provider.compatibility;
  const knownUnsupportedStates = [
    ...(flags.streaming === "unsupported" ? ["unsupported-mode:streaming"] : []),
    ...(flags.toolCalls === "unsupported" ? ["unsupported-mode:tool-calls"] : []),
    ...(flags.structuredJsonOutput === "unsupported" ? ["unsupported-mode:structured-output"] : []),
    ...(flags.strictMessageRoles === "unsupported" ? ["unsupported-mode:message-roles"] : []),
  ].map((value) => sanitizeText(value, input.redactions));
  const supportedModes: ProviderSupportedMode[] = [
    "synthetic",
    "injected",
    "live-opt-in",
    ...(flags.streaming === "supported" ? ["streaming"] as ProviderSupportedMode[] : []),
    ...(flags.toolCalls === "supported" ? ["tool-calls"] as ProviderSupportedMode[] : []),
    ...(flags.structuredJsonOutput === "supported" ? ["structured-output"] as ProviderSupportedMode[] : []),
  ];
  const unknown = [
    flags.streaming,
    flags.toolCalls,
    flags.structuredJsonOutput,
    flags.strictMessageRoles,
  ].includes("unknown");
  return freezeDeep({
    providerId: input.provider.providerId,
    ...(input.model ? { modelId: input.model.modelId } : {}),
    providerSafeLabel: input.provider.safeLabel,
    ...(input.model ? { modelSafeLabel: input.model.safeLabel } : {}),
    state: knownUnsupportedStates.length > 0 ? "unsupported" : unknown ? "not-proven" : "supported",
    supportedModes: Object.freeze(supportedModes),
    streamingSupport: flags.streaming,
    toolCallSupport: flags.toolCalls,
    structuredOutputSupport: flags.structuredJsonOutput,
    authRequirement: input.provider.authMode,
    optInRequirement: "required",
    fallbackEligibility: input.provider.supportsFallback,
    knownUnsupportedStates: Object.freeze(knownUnsupportedStates),
    redaction: {
      status: input.redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    terminalSuccessClaim: false,
    notProvenClaims: uniqueSorted([
      "provider-compatibility-is-not-provider-success",
      "model-compatibility-is-not-task-success",
      "live-opt-in-eligibility-is-not-live-execution",
      "terminal-success",
      ...input.provider.notProvenClaims,
      ...(input.model?.notProvenClaims ?? []),
    ]),
  });
}

function createReadinessMatrix(input: {
  readonly providers: readonly ProviderDescriptor[];
  readonly models: readonly ModelDescriptor[];
  readonly auth: readonly ProviderRequestAuthProjection[];
  readonly redactions: Set<string>;
}): readonly ProviderReadinessMatrixEntry[] {
  const entries: ProviderReadinessMatrixEntry[] = [];
  for (const provider of input.providers) {
    const providerModels = input.models.filter((model) => model.providerId === provider.providerId);
    if (providerModels.length === 0) {
      entries.push(readinessEntry({ provider, auth: input.auth, redactions: input.redactions }));
    }
    for (const model of providerModels) {
      entries.push(readinessEntry({ provider, model, auth: input.auth, redactions: input.redactions }));
    }
  }
  return Object.freeze(entries);
}

function readinessEntry(input: {
  readonly provider: ProviderDescriptor;
  readonly model?: ModelDescriptor;
  readonly auth: readonly ProviderRequestAuthProjection[];
  readonly redactions: Set<string>;
}): ProviderReadinessMatrixEntry {
  const auth = input.auth.find((item) => item.providerId === input.provider.providerId);
  const compatibility = input.model?.compatibility ?? input.provider.compatibility;
  const unsupportedModes = [
    ...(compatibility.streaming === "unsupported" ? ["streaming"] : []),
    ...(compatibility.toolCalls === "unsupported" ? ["tool-calls"] : []),
    ...(compatibility.structuredJsonOutput === "unsupported" ? ["structured-output"] : []),
  ];
  const unsafe = input.provider.redaction.status === "redacted" ||
    input.model?.redaction.status === "redacted" ||
    auth?.redaction.status === "redacted";
  const authState = auth?.resolutionStatus === "resolved" && auth.redaction.status === "redacted"
    ? "redacted-present"
    : auth?.resolutionStatus ?? "unknown";
  const configState: ProviderConfigReadinessState =
    unsafe ? "unsafe-config"
      : !input.provider ? "unsupported-provider"
      : !input.model ? "unsupported-model"
      : unsupportedModes.length > 0 ? "unsupported-mode"
      : authState === "missing" ? "missing-auth"
      : authState === "redacted-present" ? "auth-redacted-present"
      : authState === "resolved" ? "opt-in-required"
      : authState === "unsupported" ? "invalid-config"
      : "unknown";
  const blockers = [
    ...(input.model ? [] : ["unsupported-model"]),
    ...unsupportedModes.map((mode) => `unsupported-mode:${mode}`),
    ...(auth ? [] : ["missing-config:auth-projection"]),
    ...(auth?.resolutionStatus === "missing" ? ["missing-auth"] : []),
    ...(auth?.resolutionStatus === "unsupported" ? ["invalid-config:auth-unsupported"] : []),
    ...(unsafe ? ["unsafe-config:redaction-applied"] : []),
    "opt-in-required",
  ].map((value) => sanitizeText(value, input.redactions));

  return freezeDeep({
    providerId: input.provider.providerId,
    ...(input.model ? { modelId: input.model.modelId } : {}),
    configState,
    authState,
    blockers: Object.freeze(blockers),
    redaction: {
      status: input.redactions.size > 0 || unsafe ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    terminalSuccessClaim: false,
    notProvenClaims: uniqueSorted([
      "config-readiness-is-not-provider-success",
      "auth-readiness-is-not-provider-success",
      "opt-in-required-is-not-provider-execution",
      "terminal-success",
      ...input.provider.notProvenClaims,
      ...(input.model?.notProvenClaims ?? []),
      ...(auth?.notProvenClaims ?? []),
    ]),
  });
}

function sanitizeCompatibility(
  input: ProviderCompatibilityFlags,
  redactions: Set<string>,
): ProviderCompatibilityFlags {
  return freezeDeep({
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
