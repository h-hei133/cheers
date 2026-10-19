import type { RuntimeProvider } from "../../config/runtimeConfig.js";
import type { AccountAuthConfig } from "../../config/runtimeConfig.js";
import { createProviderFetchFromEnv } from "../../provider/request/fetch.js";
import { DEFAULT_ENDPOINT_KIND, endpointShape, type EndpointKind } from "../../provider/endpoints/index.js";
import { providerAuthorization } from "../../provider/request/authorization.js";
import { BUILTIN_PROVIDERS, providerEndpoint } from "../models/catalog.js";
import type { ProviderRegistryProjection } from "../../provider/registry/provider.js";
import type { QueryEvent } from "../query/runtime/events.js";
import { buildUnavailableResult } from "../tools/toolPolicyResult.js";
import { redactProviderFailureDetail } from "./providerFailureRedaction.js";
import { getProviderApiKeyEnvVarName } from "./providerCredentials.js";
import { needsUserEndpoint, providerFacts } from "../providers/facts.js";
import { accountProtocol, assertAccountAddress } from '../auth/account/policy.js';

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
  readonly accountAuth?: AccountAuthConfig;
  readonly baseUrl?: string;
  readonly model?: string;
  /** The same catalog selection the subsequent model request will use. */
  readonly endpoint?: EndpointKind;
  readonly signal?: AbortSignal;
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
  options.signal?.throwIfAborted();
  let endpoint = options.endpoint ?? providerEndpoint(BUILTIN_PROVIDERS, provider);
  let nativeBaseUrl: string | undefined;
  try {
    assertAccountAddress(options.accountAuth, options.baseUrl);
    const native = accountProtocol(options.accountAuth);
    if (native) {
      if (options.endpoint && options.endpoint !== native.endpoint) throw new Error('Account protocol mismatch.');
      endpoint = native.endpoint;
      nativeBaseUrl = native.baseUrl;
    }
  } catch { return { ok: false, failure: { kind: 'missing-config', stopReason: 'Provider readiness failed: the account issuer endpoint or protocol conflicts with the selected request.' } }; }
  const shape = endpointShape(endpoint);

  const envVarName = getProviderApiKeyEnvVarName(provider);
  const apiKey = (options.apiKey ?? process.env[envVarName] ?? "").trim();
  const accountAccess = options.accountAuth?.accessToken?.trim();
  if (!apiKey && !accountAccess && !shape.signer) {
    return {
      ok: false,
      failure: providerUnavailableFailure(
        "missing-key",
        `Provider readiness failed (provider-readiness:missing-key): ${envVarName} is not set for real provider mode. Set ${envVarName}, configure /connect set ${provider} <api-key>${needsUserEndpoint(provider) ? " <base-url> <model>" : ""}, or create an account-auth connection via /connect login openai --account.`,
        "not-configured",
      ),
    };
  }

  const accountAuthExpired =
    options.accountAuth && options.accountAuth.expiresAt <= Date.now();
  if (accountAuthExpired) {
      return {
        ok: false,
        failure: {
          kind: "auth",
          stopReason:
            "Provider readiness failed (provider-readiness:auth): account-auth token is expired. Renew and confirm storage or reconnect before sending.",
        },
      };
  }

  if (provider === "openai" && accountAccess && (endpoint ?? DEFAULT_ENDPOINT_KIND) === DEFAULT_ENDPOINT_KIND) {
    // OpenAI account-auth follows the codex backend auth path, not /v1/models.
    // Let runtime adapter do the real call.
    return { ok: true };
  }

  if (provider === "google" && accountAccess && (endpoint ?? DEFAULT_ENDPOINT_KIND) === DEFAULT_ENDPOINT_KIND) {
    // Google account-auth tokens are consumed by the provider adapter and may
    // use non-/models readiness semantics depending on configured endpoint.
    return { ok: true };
  }

  const fetchImpl = options.fetchImpl ?? createProviderFetchFromEnv();
  const timeoutMs = options.timeoutMs ?? 5000;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? nativeBaseUrl ?? BUILTIN_PROVIDERS.find(entry => entry.id === provider)?.baseUrl ?? "");
  const model = options.model?.trim();

  if (!baseUrl || needsUserEndpoint(provider)) {
    if (!baseUrl) {
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

  // Regional/account-scoped generation hosts need not offer model listing.
  // A signer is resolved on the actual request, not by sending its credentials
  // to an invented resource. This is admission, not proof of authentication.
  if (!shape.modelsPath) return { ok: true };
  const headers = providerAuthorization({ apiKey, accountAuth: options.accountAuth, endpoint }).headers;

  const reconnectAttempts: string[] = [];
  for (
    let attempt = 1;
    attempt <= DEFAULT_PROVIDER_NETWORK_RECONNECT_ATTEMPTS;
    attempt += 1
  ) {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      options.signal?.throwIfAborted();
      const response = await fetchImpl(`${baseUrl}${shape.modelsPath}`, {
        ...(options.accountAuth ? { redirect: 'error' as const } : {}),
        method: "GET",
        headers,
        signal: controller.signal,
      });
      // Readiness needs the status only. Cleanup failure must not replace an
      // already received HTTP result; explicit caller cancellation still wins.
      await response.body?.cancel().catch(() => undefined);
      options.signal?.throwIfAborted();

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
      options.signal?.throwIfAborted();
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
      options.signal?.removeEventListener("abort", onAbort);
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
  return providerFacts(provider).label;
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
