import { googleRefreshBody } from "./googleWire.js";
/**
 * The Google AI Studio endpoint.
 *
 * A key in a header, the model in the path, and a server-sent event stream whose
 * events are JSON chunks. Simpler than the other Google endpoint in every way,
 * which is why it comes first: the translation is shared between them, so getting
 * it right here means the second one only has to get its host and credential
 * right.
 */

import { declareEndpoint } from "./kinds.js";

import {
  googleBody,
  readGoogleBody,
  readGoogleStream,
  type GooglePart,
} from "./googleWire.js";

/** Where a request goes, given the model. */
export function googlePath(model: string, stream: boolean): string {
  const method = stream ? "streamGenerateContent" : "generateContent";
  return `/v1beta/models/${encodeURIComponent(model)}:${method}${stream ? "?alt=sse" : ""}`;
}

declareEndpoint("google-generative-ai", {
  opaqueReplay: true,
  contextFields: { system: 'systemInstruction', conversation: 'contents', tools: 'tools' },
  // The model is in the path, and the streaming method is a different one.
  path: (model, stream = true) => googlePath(model, stream),
  modelsPath: "/v1beta/models",
  headers: (apiKey) => ({ ...(apiKey ? { "x-goog-api-key": apiKey } : {}), "content-type": "application/json" }),
  body: (input) =>
    googleBody({
      model: input.model,
      provider: input.provider,
      replayBinding: input.replayBinding,
      systemPrompt: input.systemPrompt ?? "",
      messages: input.messages as never,
      tools: [],
      allowTools: false,
      temperature: input.temperature ?? 0,
      ...(input.thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens: input.thinkingBudgetTokens } : {}),
      supportsTemperature: input.supportsTemperature,
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    }) as never,
  turnBody: (input) =>
    googleBody({
      model: input.model,
      provider: input.provider,
      replayBinding: input.replayBinding,
      vision: input.vision,
      systemPrompt: input.systemPrompt,
      messages: input.messages as never,
      tools: input.tools,
      allowTools: input.allowTools,
      temperature: input.temperature,
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(input.thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens: input.thinkingBudgetTokens } : {}),
      supportsTemperature: input.supportsTemperature,
    }) as never,
  refreshBody: googleRefreshBody,
  readBody: readGoogleBody,
  readStream: readGoogleStream,
});

export type { GooglePart };
