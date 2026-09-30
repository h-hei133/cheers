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
  if (/throttl|rate.?exceed|resource.?exhausted/i.test(input.message ?? "")) {
    return "provider_rate_limited";
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

