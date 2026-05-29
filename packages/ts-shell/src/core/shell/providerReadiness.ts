import type { RuntimeProvider } from "../../config/runtimeConfig.js";
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
} from "../../config/runtimeConfig.js";
import { createProviderFetchFromEnv } from "../../model-adapters/providerFetch.js";
import type { ProviderRegistryProjection } from "../../provider/providerRegistry.js";
import type { QueryEvent } from "../query/events.js";
import { buildUnavailableResult } from "../tools/toolPolicyResult.js";
import { redactProviderFailureDetail } from "./providerFailureRedaction.js";
import { getProviderApiKeyEnvVarName } from "./providerCredentials.js";

const DEFAULT_PROVIDER_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PROVIDER_NETWORK_RECONNECT_ATTEMPTS = 5;

export type ProviderReadinessFailureKind =
  | "missing-key"
  | "missing-config"
  | "unsupported-provider"
  | "auth"
  | "network"
  | "unknown";

export interface ProviderReadinessFailure {
  readonly kind: ProviderReadinessFailureKind;
  readonly stopReason: string;
}

export type ProviderReadinessCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: ProviderReadinessFailure };

export interface ProviderReadinessCheckOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly provider?: RuntimeProvider;
  readonly apiKey?: string;
  readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  readonly baseUrl?: string;
  readonly model?: string;
}

export interface ProviderReadinessMetadataProjection {
  readonly providerId: string;
  readonly providerLabel: string;
  readonly registryMode: ProviderRegistryProjection["registryMode"];
  readonly providerDefaultEnablement: "disabled";
  readonly requiresExplicitOptIn: true;
  readonly compatibilityFlags: readonly string[];
  readonly authProjectionStatus: "present" | "missing";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectProviderReadinessMetadata(input: {
  readonly provider: RuntimeProvider | string;
  readonly registry: ProviderRegistryProjection;
}): ProviderReadinessMetadataProjection {
  const provider =
    input.registry.providers.find(
      (candidate) => candidate.providerId === input.provider,
    ) ?? input.registry.providers[0];
  const authProjection = input.registry.auth.find(
    (candidate) => candidate.providerId === provider?.providerId,
  );

  return {
    providerId: provider?.providerId ?? String(input.provider),
    providerLabel: provider?.safeLabel ?? String(input.provider),
    registryMode: input.registry.registryMode,
    providerDefaultEnablement: "disabled",
    requiresExplicitOptIn: true,
    compatibilityFlags: provider
      ? compatibilityFlagSummary(provider.compatibility)
      : [],
    authProjectionStatus: authProjection ? "present" : "missing",
    terminalSuccessClaim: false,
    notProvenClaims: [
      "provider-enabled",
      "provider-success",
      "auth-secret-available",
      "terminal-success",
      ...input.registry.notProvenClaims,
    ],
  };
}

export async function checkRealProviderReadiness(
  options: ProviderReadinessCheckOptions = {},
): Promise<ProviderReadinessCheckResult> {
  const provider = options.provider ?? "openai";
  if (!isRealProviderSupported(provider)) {
    return {
      ok: false,
      failure: providerUnavailableFailure(
        "unsupported-provider",
        `Provider readiness failed (provider-readiness:unsupported-provider): Provider ${provider} is configured but not yet supported by this build's real provider adapter. Switch provider to openai and retry.`,
        "unavailable",
      ),
    };
  }

  const envVarName = getProviderApiKeyEnvVarName(provider);
  const apiKey = (options.apiKey ?? process.env[envVarName] ?? "").trim();
  const accountAccess = options.accountAuth?.accessToken?.trim();
  if (!apiKey && !accountAccess) {
    return {
      ok: false,
      failure: providerUnavailableFailure(
        "missing-key",
        `Provider readiness failed (provider-readiness:missing-key): ${envVarName} is not set for real provider mode. Set ${envVarName}, configure /connect set ${provider} <api-key>${isOpenAICompatibleStyleProvider(provider) ? " <base-url> <model>" : ""}, or create an account-auth connection via /connect login openai --account.`,
        "not-configured",
      ),
    };
  }

  const accountAuthExpired =
    options.accountAuth && options.accountAuth.expiresAt <= Date.now();
  if (accountAuthExpired) {
    const refreshToken = options.accountAuth?.refreshToken?.trim();
    if (!refreshToken) {
      return {
        ok: false,
        failure: {
          kind: "auth",
          stopReason:
            "Provider readiness failed (provider-readiness:auth): account-auth token is expired and refresh token is missing. Re-run /connect login openai --account.",
        },
      };
    }

    // Let the model adapter perform refresh-token exchange; readiness preflight
    // must not block a recoverable account-auth session.
    return { ok: true };
  }

  if (provider === "openai" && accountAccess) {
    // OpenAI account-auth follows the codex backend auth path, not /v1/models.
    // Let runtime adapter do the real call.
    return { ok: true };
  }

  if (provider === "google" && accountAccess) {
    // Google account-auth tokens are consumed by the provider adapter and may
    // use non-/models readiness semantics depending on configured endpoint.
    return { ok: true };
  }

  const fetchImpl = options.fetchImpl ?? createProviderFetchFromEnv();
  const timeoutMs = options.timeoutMs ?? 5000;
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ?? DEFAULT_PROVIDER_BASE_URL,
  );
  const model = options.model?.trim();

  if (isOpenAICompatibleStyleProvider(provider)) {
    if (!options.baseUrl?.trim()) {
      return {
        ok: false,
        failure: providerUnavailableFailure(
          "missing-config",
          `Provider readiness failed (provider-readiness:missing-config): ${provider} requires a configured base URL. Set it via /connect set ${provider} <api-key> <base-url> <model>, then retry.`,
          "not-configured",
        ),
      };
    }

    if (!model) {
      return {
        ok: false,
        failure: providerUnavailableFailure(
          "missing-config",
          `Provider readiness failed (provider-readiness:missing-config): ${provider} requires a configured model. Set it via /connect set ${provider} <api-key> <base-url> <model>, then retry.`,
          "not-configured",
        ),
      };
    }
  }

  const reconnectAttempts: string[] = [];
  for (
    let attempt = 1;
    attempt <= DEFAULT_PROVIDER_NETWORK_RECONNECT_ATTEMPTS;
    attempt += 1
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${accountAccess || apiKey}`,
        },
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          failure: {
            kind: "auth",
            stopReason: `Provider readiness failed (provider-readiness:auth): ${getProviderLabel(provider)} authentication was rejected (401/403). Verify ${provider === "openai" ? "account-auth session or OPENAI_API_KEY" : envVarName} validity and access scope, then retry.`,
          },
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          failure: {
            kind: "unknown",
            stopReason: `Provider readiness failed (provider-readiness:unknown): ${getProviderLabel(provider)} endpoint returned HTTP ${response.status}. Check provider status/config and retry.`,
          },
        };
      }

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isAbortError =
        error instanceof Error && error.name.toLowerCase().includes("abort");
      const isNetworkError =
        isAbortError ||
        /network|fetch|timeout|econn|enotfound|unreachable/i.test(message);

      if (isNetworkError) {
        reconnectAttempts.push(
          `reconnecting ${attempt}/${DEFAULT_PROVIDER_NETWORK_RECONNECT_ATTEMPTS}`,
        );
        if (attempt < DEFAULT_PROVIDER_NETWORK_RECONNECT_ATTEMPTS) {
          continue;
        }

        return {
          ok: false,
          failure: {
            kind: "network",
            stopReason: `Provider readiness failed (provider-readiness:network): Unable to reach the ${getProviderLabel(provider)} endpoint after ${DEFAULT_PROVIDER_NETWORK_RECONNECT_ATTEMPTS} reconnect attempts (${reconnectAttempts.join("; ")}). Check network/proxy/firewall settings and retry.`,
          },
        };
      }

      return {
        ok: false,
        failure: {
          kind: "unknown",
          stopReason: `Provider readiness failed (provider-readiness:unknown): ${redactProviderFailureDetail(message)}. Check provider status/config and retry.`,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    failure: {
      kind: "network",
      stopReason: `Provider readiness failed (provider-readiness:network): Unable to reach the ${getProviderLabel(provider)} endpoint after ${DEFAULT_PROVIDER_NETWORK_RECONNECT_ATTEMPTS} reconnect attempts (${reconnectAttempts.join("; ")}). Check network/proxy/firewall settings and retry.`,
    },
  };
}

function getProviderLabel(provider: RuntimeProvider): string {
  switch (provider) {
    case "openai-compatible":
      return "OpenAI-compatible";
    case "google":
      return "Google (OpenAI-compatible)";
    case "antigravity":
      return "Antigravity (OpenAI-compatible)";
    case "claudecode":
      return "ClaudeCode (OpenAI-compatible)";
    default:
      return "OpenAI";
  }
}

function providerUnavailableFailure(
  kind: Extract<
    ProviderReadinessFailureKind,
    "missing-key" | "missing-config" | "unsupported-provider"
  >,
  stopReason: string,
  availability: "not-configured" | "unavailable",
): ProviderReadinessFailure {
  const receipt = buildUnavailableResult({
    capability: "provider",
    availability,
    reasonCode: `provider-readiness:${kind}`,
    reason: stopReason,
    doNext: stopReason,
    evidence: [`provider-readiness:${kind}`],
  });
  return {
    kind,
    stopReason: receipt.reason,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isOpenAICompatibleStyleProvider(provider: RuntimeProvider): boolean {
  return (
    provider === "openai-compatible" ||
    provider === "google" ||
    provider === "antigravity" ||
    provider === "claudecode"
  );
}

function isRealProviderSupported(provider: RuntimeProvider): boolean {
  return provider !== "anthropic";
}

function compatibilityFlagSummary(
  flags: ProviderRegistryProjection["providers"][number]["compatibility"],
): readonly string[] {
  return [
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
  ].sort();
}

export function createProviderReadinessTerminalEvent(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly stopReason: string;
}): QueryEvent {
  return {
    type: "query.completed",
    result: {
      status: "stopped_error",
      terminalReason: "stopped_error",
      terminalClassification: "error",
      stopReason: input.stopReason,
      transcript: [],
      sharedContext: {
        sessionId: input.sessionId,
        initialPrompt: input.prompt,
        notes: [
          "provider-readiness: pre-query gate blocked real provider entry",
        ],
        handoffs: [],
      },
      finalOutput: "",
    },
  };
}
