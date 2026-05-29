import { describe, expect, it } from "vitest";

import { projectProviderReadinessMetadata } from "../core/shell/providerReadiness.js";
import { projectRuntimeEvents } from "../runtime/events/runtimeEventProjection.js";
import { projectStaticResourceRegistry } from "../runtime/resources/staticResourceProjection.js";
import {
  classifyProviderFailure,
  projectProviderRegistry,
  unknownProviderCompatibilityFlags,
  type ProviderFallbackPolicyMetadata,
} from "./providerRegistry.js";

describe("provider registry metadata", () => {
  it("redacts provider descriptors without enabling execution", () => {
    const projection = projectProviderRegistry({
      providers: [
        {
          providerId: "openai-compatible",
          safeLabel:
            "OpenAI compatible provider.env=/fixture/provider.env Authorization: Bearer fixture-token",
          providerKind: "openai-compatible",
          endpointClass: "openai-compatible",
          authMode: "api-key",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "unknown",
          compatibility: {
            ...unknownProviderCompatibilityFlags(),
            openAICompatibleShape: "supported",
            streaming: "unknown",
            providerSpecificQuirks: [
              "raw provider output: hidden reasoning token=secret oldText=before newText=after",
              "https://fixture.invalid/v1",
            ],
          },
          fallbackPolicy: fallbackPolicy(),
          riskLevel: "high",
        },
      ],
      auth: [
        {
          providerId: "openai-compatible",
          authSourceKind: "env",
          authMode: "api-key",
          resolutionStatus: "resolved",
          requestCorrelationId: "request-apiKey=secret-value",
        },
      ],
    });
    const serialized = JSON.stringify(projection);

    expect(projection.providerDefaultEnablement).toBe("disabled");
    expect(projection.dynamicProviderLoading).toBe("disabled");
    expect(projection.providers[0]?.defaultEnabled).toBe(false);
    expect(projection.providers[0]?.requiresExplicitOptIn).toBe(true);
    expect(projection.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(
      /provider\.env=\/fixture|Bearer fixture-token|token=secret|oldText=before|newText=after|hidden reasoning|fixture\.invalid|apiKey=secret-value/i,
    );
  });

  it("keeps unknown compatibility flags explicit and not proven", () => {
    const flags = unknownProviderCompatibilityFlags(["custom-claim"]);
    const projection = projectProviderRegistry({
      providers: [
        {
          providerId: "openai",
          safeLabel: "OpenAI",
          providerKind: "openai",
          endpointClass: "default",
          authMode: "api-key",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "unknown",
          compatibility: flags,
          riskLevel: "medium",
        },
      ],
      models: [
        {
          modelId: "gpt-safe",
          safeLabel: "GPT Safe",
          providerId: "openai",
          family: "openai",
          compatibility: flags,
          knownLimitations: ["streaming unknown"],
        },
      ],
    });

    expect(projection.models[0]?.compatibility.toolCalls).toBe("unknown");
    expect(projection.models[0]?.compatibility.structuredJsonOutput).toBe("unknown");
    expect(projection.models[0]?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "model-compatibility-proven",
        "provider-success",
        "terminal-success",
      ]),
    );
  });

  it("classifies provider failures distinctly", () => {
    expect(classifyProviderFailure({ missingConfig: true })).toBe("provider_config");
    expect(classifyProviderFailure({ missingAuth: true })).toBe("provider_auth");
    expect(classifyProviderFailure({ message: "network unreachable" })).toBe("provider_network");
    expect(classifyProviderFailure({ status: 500 })).toBe("provider_endpoint");
    expect(classifyProviderFailure({ status: 429 })).toBe("provider_rate_limited");
    expect(classifyProviderFailure({ errorName: "AbortError" })).toBe("provider_timeout");
    expect(classifyProviderFailure({ invalidOutput: true })).toBe("provider_output_invalid");
    expect(classifyProviderFailure({ insufficientOutput: true })).toBe("provider_output_insufficient");
    expect(classifyProviderFailure({ redactionFailed: true })).toBe("provider_redaction_failure");
    expect(classifyProviderFailure({ routeBug: true })).toBe("provider_route_error");
  });

  it("represents fallback policy metadata without executing fallback", () => {
    const projection = projectProviderRegistry({
      providers: [
        {
          providerId: "primary",
          safeLabel: "Primary Provider",
          providerKind: "custom",
          endpointClass: "custom",
          authMode: "api-key",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "supported",
          compatibility: unknownProviderCompatibilityFlags(),
          fallbackPolicy: fallbackPolicy(),
          riskLevel: "high",
        },
      ],
    });

    expect(projection.fallbackPolicies).toHaveLength(1);
    expect(projection.fallbackPolicies[0]).toMatchObject({
      fallbackProviderId: "fallback-provider",
      eligibleFailureClasses: ["provider_network", "provider_timeout"],
      ineligibleFailureClasses: ["provider_auth", "provider_config"],
      maxAttempts: 1,
      retryRelation: "new-request",
      requiresExplicitOptIn: true,
      executesFallback: false,
    });
    expect(projection.notProvenClaims).toContain("fallback-executed");
  });

  it("projects per-request auth without exposing secret material", () => {
    const projection = projectProviderRegistry({
      providers: [
        {
          providerId: "openai",
          safeLabel: "OpenAI",
          providerKind: "openai",
          endpointClass: "default",
          authMode: "account-auth",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "unknown",
          compatibility: unknownProviderCompatibilityFlags(),
          riskLevel: "medium",
        },
      ],
      auth: [
        {
          providerId: "openai",
          authSourceKind: "connection",
          authMode: "account-auth",
          resolutionStatus: "missing",
          missingAuthClass: "provider_auth",
          requestCorrelationId: "request-token=secret",
        },
      ],
    });
    const auth = projection.auth[0];

    expect(auth).toMatchObject({
      providerId: "openai",
      authSourceKind: "connection",
      authMode: "account-auth",
      resolutionStatus: "missing",
      missingAuthClass: "provider_auth",
    });
    expect(JSON.stringify(auth)).not.toMatch(/token=secret/i);
    expect(auth?.notProvenClaims).toContain("auth-secret-available");
  });

  it("integrates provider and model metadata through resource and runtime events", () => {
    const registry = projectProviderRegistry({
      providers: [
        {
          providerId: "openai",
          safeLabel: "OpenAI",
          providerKind: "openai",
          endpointClass: "default",
          authMode: "api-key",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "unknown",
          compatibility: {
            ...unknownProviderCompatibilityFlags(),
            developerRole: "supported",
            streaming: "supported",
          },
          riskLevel: "medium",
        },
      ],
      models: [
        {
          modelId: "gpt-safe",
          safeLabel: "GPT Safe",
          providerId: "openai",
          family: "openai",
          contextWindow: 128000,
          compatibility: unknownProviderCompatibilityFlags(),
          knownLimitations: ["tool calls unknown"],
        },
      ],
    });
    const resources = projectStaticResourceRegistry({
      descriptors: registry.resourceDescriptors,
    });
    const events = projectRuntimeEvents({ resourceProjection: resources });

    expect(resources.resources).toHaveLength(2);
    expect(resources.resources.every((resource) => resource.enabledByDefault === false)).toBe(true);
    expect(resources.providerDefaultEnablement).toBe("disabled");
    expect(events[0]?.type).toBe("resource-projection-observed");
    expect(events[0]?.facts).toMatchObject({
      providerResourceCount: 2,
      terminalSuccessClaim: false,
    });
    expect(events[0]?.notProvenClaims).toEqual(
      expect.arrayContaining(["provider-success", "terminal-success"]),
    );
  });

  it("exposes a provider readiness metadata seam without changing readiness execution", () => {
    const registry = projectProviderRegistry({
      providers: [
        {
          providerId: "openai",
          safeLabel: "OpenAI",
          providerKind: "openai",
          endpointClass: "default",
          authMode: "api-key",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "unknown",
          compatibility: {
            ...unknownProviderCompatibilityFlags(),
            toolCalls: "supported",
            streaming: "unknown",
          },
          riskLevel: "medium",
        },
      ],
    });

    const metadata = projectProviderReadinessMetadata({
      provider: "openai",
      registry,
    });

    expect(metadata).toMatchObject({
      providerId: "openai",
      providerDefaultEnablement: "disabled",
      requiresExplicitOptIn: true,
      authProjectionStatus: "missing",
      terminalSuccessClaim: false,
    });
    expect(metadata.compatibilityFlags).toContain("tool-calls:supported");
    expect(metadata.notProvenClaims).toEqual(
      expect.arrayContaining(["provider-success", "terminal-success"]),
    );
  });
});

function fallbackPolicy(): ProviderFallbackPolicyMetadata {
  return {
    fallbackProviderId: "fallback-provider",
    eligibleFailureClasses: ["provider_network", "provider_timeout"],
    ineligibleFailureClasses: ["provider_auth", "provider_config"],
    maxAttempts: 1,
    retryRelation: "new-request",
    requiresExplicitOptIn: true,
    executesFallback: false,
    redaction: {
      status: "report-safe",
      excluded: [],
    },
    notProvenClaims: ["fallback-executed"],
  };
}
