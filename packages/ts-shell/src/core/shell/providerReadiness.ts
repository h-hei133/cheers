import type { QueryEvent } from "../query/events.js";

const DEFAULT_PROVIDER_BASE_URL = "https://api.openai.com/v1";

export type ProviderReadinessFailureKind =
  | "missing-key"
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
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export async function checkRealProviderReadiness(
  options: ProviderReadinessCheckOptions = {},
): Promise<ProviderReadinessCheckResult> {
  const apiKey = (options.apiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      failure: {
        kind: "missing-key",
        stopReason:
          "Provider readiness failed (provider-readiness:missing-key): OPENAI_API_KEY is not set for real provider mode. Set OPENAI_API_KEY and retry.",
      },
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const baseUrl = options.baseUrl ?? DEFAULT_PROVIDER_BASE_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/models`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        failure: {
          kind: "auth",
          stopReason:
            "Provider readiness failed (provider-readiness:auth): OpenAI authentication was rejected (401/403). Verify OPENAI_API_KEY validity and access scope, then retry.",
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        failure: {
          kind: "unknown",
          stopReason: `Provider readiness failed (provider-readiness:unknown): OpenAI endpoint returned HTTP ${response.status}. Check provider status/config and retry.`,
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
          stopReason:
            "Provider readiness failed (provider-readiness:network): Unable to reach the OpenAI endpoint. Check network/proxy/firewall settings and retry.",
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
