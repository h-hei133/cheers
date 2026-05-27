import type { SchemaVersion } from "../../../../contracts/typescript/types.js";
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../config/runtimeConfig.js";
import { OpenAIModelAdapter } from "../model-adapters/providers/openai/OpenAIModelAdapter.js";

const TURN_ROLE_DRAFT_CONTRACT_VERSION: SchemaVersion = "1.0.0";

export interface TurnRoleDraftRealProvider {
  readonly provider: RuntimeProvider;
  readonly apiKey?: string;
  readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
  readonly baseUrl?: string;
  readonly model?: string;
}

export async function streamTurnRoleDraft(input: {
  readonly role: "planner" | "coder" | "reviewer";
  readonly draft: string;
  readonly providerMode: "synthetic" | "real";
  readonly realProvider?: TurnRoleDraftRealProvider;
}): Promise<string> {
  const requestModel = resolveTurnRequestModel({
    providerMode: input.providerMode,
    realProvider: input.realProvider,
  });
  const adapter =
    input.providerMode === "real"
      ? createTurnRoleDraftRealProviderAdapter(input.realProvider)
      : new OpenAIModelAdapter(
          { provider: "openai", apiKey: "local-mvp-test-key" },
          async () =>
            new Response(createSyntheticTurnRoleDraftSseBody(input.draft), {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            }),
        );

  let text = "";
  for await (const event of adapter.streamResponse({
    schemaVersion: TURN_ROLE_DRAFT_CONTRACT_VERSION,
    model: requestModel,
    messages: [{ role: "user", content: input.draft }],
  })) {
    if (event.type === "content.delta") {
      text += event.delta;
    }
  }

  return text.trim();
}

export function resolveTurnRequestModel(input: {
  readonly providerMode: "synthetic" | "real";
  readonly realProvider?: TurnRoleDraftRealProvider;
}): string {
  if (input.providerMode !== "real") {
    return "gpt-4.1-mini";
  }

  const configuredModel = input.realProvider?.model?.trim();
  if (configuredModel) {
    return configuredModel;
  }

  if (
    input.realProvider?.provider === "openai" &&
    input.realProvider.accountAuth
  ) {
    return "gpt-5.4";
  }

  return "gpt-4.1-mini";
}

export function createTurnRoleDraftRealProviderAdapter(
  realProvider?: TurnRoleDraftRealProvider,
): OpenAIModelAdapter {
  const apiKey =
    realProvider?.apiKey?.trim() ?? process.env.OPENAI_API_KEY?.trim();
  const accountAccess = realProvider?.accountAuth?.accessToken?.trim();
  if (!apiKey && !accountAccess) {
    throw new Error(
      "OPENAI_API_KEY is required for the real provider path unless an account-auth connection is active. Use /connect login openai --account to create one.",
    );
  }

  return new OpenAIModelAdapter({
    provider: (realProvider?.provider ?? "openai") as RuntimeProvider,
    apiKey,
    accountAuth: realProvider?.accountAuth,
    baseUrl: realProvider?.baseUrl,
  });
}

export function createSyntheticTurnRoleDraftSseBody(
  content: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const first = content.slice(0, Math.ceil(content.length / 2));
  const second = content.slice(Math.ceil(content.length / 2));

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: first } }],
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: second }, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
          })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
