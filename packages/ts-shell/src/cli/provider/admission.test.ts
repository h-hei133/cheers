import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as catalogStore from "../../core/models/catalogStore.js";
import * as authorization from "../../provider/request/authorization.js";
import * as authRuntime from "../../core/auth/providerAuthRuntime.js";
import { HookDispatcher } from "../../core/hooks/hookDispatcher.js";
import { checkRealProviderReadiness } from "../../core/shell/providerReadiness.js";
import { createProviderReadinessCliTerminalEvent } from "../../entrypoints/providerReadinessCliSurface.js";
import { runCliRuntimeInvocation, type CliRuntimeInvocationInput } from "../../entrypoints/cliRuntimeInvocation.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";

afterEach(() => vi.restoreAllMocks());

function input(): CliRuntimeInvocationInput {
  return {
    sessionId: "provider-admission", prompt: "hello", workspaceRoot: process.cwd(),
    signal: new AbortController().signal, maxTurns: 1, agentMode: "plan", skillOptions: { noSkills: true },
    providerModeEnv: "real",
    providerCredentialResolution: {
      provider: "openai", expectedEnvVarName: "OPENAI_API_KEY", model: "probe",
      credential: { provider: "openai", authMode: "api-key", apiKey: "test-key", source: "cli", envVarName: "OPENAI_API_KEY" },
    },
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: "deny", respondedAt: 1 }),
  };
}

async function collect(events: AsyncIterable<QueryEvent>): Promise<QueryEvent[]> {
  const result: QueryEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("provider admission", () => {
  it("uses one catalog protocol and address for readiness and the actual model request", async () => {
    const seen: { url?: string; method?: string; key?: string; version?: string; bearer?: string; model?: string }[] = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      seen.push({ url: request.url, method: request.method, key: request.headers["x-api-key"] as string,
        version: request.headers["anthropic-version"] as string, bearer: request.headers.authorization,
        ...(body ? { model: JSON.parse(body).model } : {}),
      });
      response.setHeader("content-type", "application/json");
      if (request.url === "/v1/models") response.end(JSON.stringify({ data: [{ id: "probe" }] }));
      else if (request.url === "/v1/messages") response.end(JSON.stringify({
        id: "message", type: "message", role: "assistant", model: "probe",
        content: [{ type: "text", text: "ready" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
      }));
      else { response.statusCode = 400; response.end(JSON.stringify({ error: { message: "wrong protocol" } })); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test HTTP port");
      const catalog = [{ id: "openai", label: "Configured service", runtime: "openai" as const, auth: "api-key" as const,
        endpoint: "anthropic-messages", baseUrl: `http://127.0.0.1:${address.port}/v1`, models: [{ id: "probe", contextWindow: 8192 }],
      }];
      const snapshot = vi.spyOn(catalogStore, "loadCatalog").mockReturnValue(catalog);
      const run = await runCliRuntimeInvocation(input(), {
        checkProviderReadiness: async options => {
          const result = await checkRealProviderReadiness(options);
          // A catalog edit while readiness waits must affect the next invocation,
          // not change the protocol halfway through this one.
          snapshot.mockReturnValue([{ ...catalog[0], endpoint: "openai-compatible", baseUrl: "https://unused.invalid" }]);
          return result;
        },
        createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent,
        tools: () => new Map(), hooks: new HookDispatcher(),
      });
      const events = await collect(run.events);
      expect(events.at(-1)).toMatchObject({ type: "query.completed", result: { status: "completed", finalOutput: "ready" } });
      expect(snapshot).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([
        { url: "/v1/models", method: "GET", key: "test-key", version: "2023-06-01", bearer: undefined },
        { url: "/v1/messages", method: "POST", key: "test-key", version: "2023-06-01", bearer: undefined, model: "probe" },
      ]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it("hands the renewed account credential to readiness and the step factory", async () => {
    const old = { type: "openai-chatgpt-account" as const, accessToken: "old-test-token", refreshToken: "test-refresh", expiresAt: 1 };
    const fresh = { ...old, accessToken: "renewed-test-token", expiresAt: Date.now() + 60_000 };
    vi.spyOn(authorization, "renewAccountAuthIfExpiring").mockResolvedValue({ renewed: true, accountAuth: fresh });
    const persist = vi.spyOn(authRuntime, "persistRenewedAccountAuth").mockImplementation(() => {});
    const request = input();
    const run = await runCliRuntimeInvocation({
      ...request, providerCredentialResolution: { ...request.providerCredentialResolution,
        credential: { provider: "openai", authMode: "account-auth", accountAuth: old, source: "config", envVarName: "OPENAI_API_KEY" },
      },
    }, {
      checkProviderReadiness: async options => {
        expect(options?.accountAuth).toBe(fresh);
        expect(options?.apiKey).toBe("");
        return { ok: true };
      },
      createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent,
      createStep: resolved => {
        expect(resolved.providerCredentialResolution.credential?.accountAuth).toBe(fresh);
        return async () => ({ text: "ready", toolCalls: [], stopReason: "stop" });
      },
      tools: () => new Map(), hooks: new HookDispatcher(),
    });
    expect((await collect(run.events)).at(-1)).toMatchObject({ type: "query.completed", result: { status: "completed" } });
    expect(persist).toHaveBeenCalledWith({ provider: "openai", accountAuth: fresh });
  });
});
