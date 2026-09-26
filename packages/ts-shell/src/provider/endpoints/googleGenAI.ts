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
  convertContents,
  convertTools,
  readGoogleBody,
  readGoogleStream,
  thinkingConfigFor,
  type GooglePart,
  type GoogleRequestBody,
} from "./googleWire.js";

/** Where a request goes, given the model. */
export function googlePath(model: string, stream: boolean): string {
  const method = stream ? "streamGenerateContent" : "generateContent";
  return `/v1beta/models/${encodeURIComponent(model)}:${method}`;
}

/** The request body, shared with the other Google endpoint. */
export function googleBody(input: {
  readonly systemPrompt: string;
  readonly messages: readonly Parameters<typeof convertContents>[0][number][];
  readonly tools: Parameters<typeof convertTools>[0];
  readonly allowTools: boolean;
  readonly temperature: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly thinkingBudgetTokens?: number;
}): GoogleRequestBody {
  const tools = input.allowTools ? convertTools(input.tools) : undefined;
  return {
    contents: convertContents(input.messages),
    ...(input.systemPrompt.trim() !== ""
      ? { systemInstruction: { parts: [{ text: input.systemPrompt }] } }
      : {}),
    generationConfig: {
      temperature: input.temperature,
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(thinkingConfigFor(input.thinkingBudgetTokens) ?? {}),
    },
    ...(tools ? { tools } : {}),
    // Stated rather than left to the provider: the caller decides whether this
    // turn may call a tool, and a mode the provider chose would be that decision
    // made somewhere else.
    ...(tools ? { toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
  };
}

declareEndpoint("google-generative-ai", {
  // The model is in the path, and the streaming method is a different one.
  path: (model) => googlePath(model, true),
  headers: (apiKey) => ({ ...(apiKey ? { "x-goog-api-key": apiKey } : {}), "content-type": "application/json" }),
  body: (input) =>
    googleBody({
      systemPrompt: input.systemPrompt ?? "",
      messages: input.messages as never,
      tools: [],
      allowTools: false,
      temperature: input.temperature ?? 0,
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    }) as never,
  turnBody: (input) =>
    googleBody({
      systemPrompt: input.systemPrompt,
      messages: input.messages as never,
      tools: input.tools,
      allowTools: input.allowTools,
      temperature: input.temperature,
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(input.thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens: input.thinkingBudgetTokens } : {}),
    }) as never,
  readBody: readGoogleBody,
  readStream: readGoogleStream,
});

export type { GooglePart };
