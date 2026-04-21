import type { RuntimeProvider } from "../../config/runtimeConfig.js";
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
} from "../../config/runtimeConfig.js";
import type { QueryEvent } from "../query/events.js";
import { getProviderApiKeyEnvVarName } from "./providerCredentials.js";

const DEFAULT_PROVIDER_BASE_URL = "https://api.openai.com/v1";

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

export async function checkRealProviderReadiness(
  options: ProviderReadinessCheckOptions = {},
): Promise<ProviderReadinessCheckResult> {
  const provider = options.provider ?? "openai";
  if (!isRealProviderSupported(provider)) {
    return {
      ok: false,
      failure: {
        kind: "unsupported-provider",
        stopReason: `Provider readiness failed (provider-readiness:unsupported-provider): Provider ${provider} is configured but not yet supported by this build's real provider adapter. Switch provider to openai and retry.`,
      },
    };
  }

  const envVarName = getProviderApiKeyEnvVarName(provider);
  const apiKey = (options.apiKey ?? process.env[envVarName] ?? "").trim();
  const accountAccess = options.accountAuth?.accessToken?.trim();
  if (!apiKey && !accountAccess) {
    return {
      ok: false,
      failure: {
        kind: "missing-key",
        stopReason: `Provider readiness failed (provider-readiness:missing-key): ${envVarName} is not set for real provider mode. Set ${envVarName}, configure /connect set ${provider} <api-key>${isOpenAICompatibleStyleProvider(provider) ? " <base-url> <model>" : ""}, or create an account-auth connection via /connect login openai --account.`,
      },
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

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ?? DEFAULT_PROVIDER_BASE_URL,
  );
  const model = options.model?.trim();

  if (isOpenAICompatibleStyleProvider(provider)) {
    if (!options.baseUrl?.trim()) {
      return {
        ok: false,
        failure: {
          kind: "missing-config",
          stopReason:
            `Provider readiness failed (provider-readiness:missing-config): ${provider} requires a configured base URL. Set it via /connect set ${provider} <api-key> <base-url> <model>, then retry.`,
        },
      };
    }

    if (!model) {
      return {
        ok: false,
        failure: {
          kind: "missing-config",
          stopReason:
            `Provider readiness failed (provider-readiness:missing-config): ${provider} requires a configured model. Set it via /connect set ${provider} <api-key> <base-url> <model>, then retry.`,
        },
      };
    }
  }

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
      return {
        ok: false,
        failure: {
          kind: "network",
          stopReason: `Provider readiness failed (provider-readiness:network): Unable to reach the ${getProviderLabel(provider)} endpoint. Check network/proxy/firewall settings and retry.`,
        },
      };
    }

    return {
      ok: false,
      failure: {
        kind: "unknown",
        stopReason: `Provider readiness failed (provider-readiness:unknown): ${message}. Check provider status/config and retry.`,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
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
