import type { SchemaVersion } from "../../../../../contracts/typescript/types.js";
import type { ResolvedProviderCredential } from "../shell/providerCredentials.js";
import { redactProviderFailureDetail } from "../shell/providerFailureRedaction.js";
import { OpenAIModelAdapter } from "../../model-adapters/providers/openai/OpenAIModelAdapter.js";
import type { NormalizedProviderError } from "../../model-adapters/types.js";
import type { QueryEvent } from "./events.js";
import type { TaskMode } from "./routeDecision.js";
import type { AgentExecutionOutput, OrchestrationResult } from "../../orchestration/types.js";

const CONTRACT_VERSION: SchemaVersion = "1.0.0";

export interface LightweightChatOptions {
  readonly sessionId: string;
  readonly prompt: string;
  readonly mode: Extract<TaskMode, "chat" | "analysis" | "plan">;
  readonly providerMode: "synthetic" | "real";
  readonly providerCredential?: ResolvedProviderCredential;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

export interface LightweightChatResult {
  readonly output: string;
  readonly providerCallCount: number;
}

export async function runLightweightChat(
  options: LightweightChatOptions,
): Promise<LightweightChatResult> {
  if (options.providerMode === "synthetic") {
    return {
      output: syntheticResponse(options.mode, options.prompt),
      providerCallCount: 1,
    };
  }

  const adapter = createAdapter(options.providerCredential, options.fetchImpl);
  let output = "";
  let providerCallCount = 1;
  for await (const event of adapter.streamResponse(
    {
      schemaVersion: CONTRACT_VERSION,
      model: resolveRequestModel(options.providerCredential),
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(options.mode),
        },
        {
          role: "user",
          content: options.prompt,
        },
      ],
      maxOutputTokens: 1200,
    },
    options.signal,
  )) {
    if (event.type === "content.delta") {
      output += event.delta;
    }
  }

  return { output: output.trim(), providerCallCount };
}

export async function* streamLightweightChat(
  options: LightweightChatOptions,
): AsyncIterable<QueryEvent> {
  yield { type: "query.started", sessionId: options.sessionId, prompt: options.prompt };
  yield { type: "turn.started", role: "coder", turn: 1 };

  let result: LightweightChatResult;
  try {
    result = await runLightweightChat(options);
  } catch (error) {
    yield {
      type: "query.completed",
      result: buildStoppedErrorResult({
        sessionId: options.sessionId,
        prompt: options.prompt,
        mode: options.mode,
        error,
        providerCallCount: options.providerMode === "real" ? 1 : 0,
      }),
    };
    return;
  }

  const output: AgentExecutionOutput = {
    role: "coder",
    content: result.output,
    notes: [
      `route: mode=${options.mode} path=lightweight`,
      `providerCalls=${result.providerCallCount}`,
      "tool: skipped (lightweight no-write route)",
      "write: disabled (router grants no permissions)",
    ],
  };

  if (result.output) {
    for (const delta of splitForDeltas(result.output)) {
      yield { type: "message.delta", role: "coder", delta };
    }
  }
  yield { type: "turn.completed", output };
  yield {
    type: "query.completed",
    result: buildCompletedResult({
      sessionId: options.sessionId,
      prompt: options.prompt,
      output,
    }),
  };
}

function createAdapter(
  credential: ResolvedProviderCredential | undefined,
  fetchImpl?: typeof fetch,
): OpenAIModelAdapter {
  const apiKey = credential?.apiKey?.trim() ?? process.env.OPENAI_API_KEY?.trim();
  const accountAuth = credential?.accountAuth;
  if (!apiKey && !accountAuth?.accessToken?.trim()) {
    throw new Error(
      "Provider credential is missing for lightweight chat. Configure /connect or set the provider API key.",
    );
  }

  return new OpenAIModelAdapter(
    {
      provider: credential?.provider ?? "openai",
      apiKey,
      accountAuth,
      baseUrl: credential?.baseUrl,
    },
    fetchImpl,
  );
}

function resolveRequestModel(credential: ResolvedProviderCredential | undefined): string {
  const configured = credential?.model?.trim();
  if (configured) {
    return configured;
  }
  if (credential?.provider === "openai" && credential.accountAuth) {
    return "gpt-5.4";
  }
  return "gpt-4.1-mini";
}

function buildSystemPrompt(mode: LightweightChatOptions["mode"]): string {
  const base =
    "You are a concise coding assistant. Answer the user's prompt directly. Do not call tools, request permissions, modify files, run commands, or claim local file inspection unless the user pasted the relevant content.";
  if (mode === "plan") {
    return `${base} Produce a plan only. Do not execute the plan.`;
  }
  if (mode === "analysis") {
    return `${base} Provide analysis only. Separate evidence from inference when local context was not supplied.`;
  }
  return base;
}

function syntheticResponse(
  mode: LightweightChatOptions["mode"],
  prompt: string,
): string {
  if (mode === "plan") {
    return `Plan only: ${prompt}`;
  }
  if (mode === "analysis") {
    return `Analysis only: ${prompt}`;
  }
  return `Lightweight chat response: ${prompt}`;
}

function splitForDeltas(output: string): string[] {
  const parts = output.match(/\S+\s*/g);
  return parts && parts.length > 0 ? parts : [output];
}

function buildCompletedResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly output: AgentExecutionOutput;
}): OrchestrationResult {
  return {
    status: "completed",
    terminalReason: "completed",
    terminalClassification: "success",
    transcript: [input.output],
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes: [...(input.output.notes ?? [])],
      handoffs: [],
    },
    finalOutput: input.output.content,
  };
}

function buildStoppedErrorResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly mode: LightweightChatOptions["mode"];
  readonly error: unknown;
  readonly providerCallCount: number;
}): OrchestrationResult {
  const providerError = asNormalizedProviderError(input.error);
  const errorKind = providerError?.kind ?? "unknown";
  const stopReason = formatProviderStopReason(input.error);
  const notes = [
    `route: mode=${input.mode} path=lightweight`,
    `providerCalls=${input.providerCallCount}`,
    `provider-error-kind=${errorKind}`,
    "tool: skipped (lightweight no-write route)",
    "write: disabled (router grants no permissions)",
  ];

  return {
    status: "stopped_error",
    terminalReason: "stopped_error",
    terminalClassification: "error",
    stopReason,
    transcript: [],
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes,
      handoffs: [],
    },
    finalOutput: "",
  };
}

function formatProviderStopReason(error: unknown): string {
  const providerError = asNormalizedProviderError(error);
  if (providerError) {
    const details = [
      providerError.statusCode != null ? `status=${providerError.statusCode}` : undefined,
      providerError.code ? `code=${providerError.code}` : undefined,
      `retriable=${providerError.retriable ? "true" : "false"}`,
    ].filter(Boolean);
    const suffix = details.length > 0 ? ` (${details.join(" ")})` : "";
    return redactProviderFailureDetail(
      `Provider request failed (provider-${providerError.kind}): ${providerError.message}${suffix}`,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return redactProviderFailureDetail(
    `Provider request failed (provider-unknown): ${message}`,
  );
}

function asNormalizedProviderError(
  error: unknown,
): NormalizedProviderError | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "provider" in error &&
    "message" in error &&
    "retriable" in error &&
    typeof (error as { kind?: unknown }).kind === "string" &&
    typeof (error as { provider?: unknown }).provider === "string" &&
    typeof (error as { message?: unknown }).message === "string" &&
    typeof (error as { retriable?: unknown }).retriable === "boolean"
  ) {
    return error as NormalizedProviderError;
  }
  return undefined;
}
