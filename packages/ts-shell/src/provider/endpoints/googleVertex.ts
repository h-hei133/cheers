import { googleRefreshBody } from "./googleWire.js";
/**
 * The Google Vertex endpoint.
 *
 * The same request and response shapes as the other Google endpoint, reached
 * differently: a different host, a resource path naming the project and location,
 * and a bearer token instead of a key. The translation is shared, so what is here
 * is only what makes it a different service.
 *
 * Where the account's details live is a decision this file makes once: the host,
 * the project and the location are the *base address*, and the endpoint adds the
 * model and the method to it. That keeps the path a pure function of the model —
 * the contract every protocol here is written against — instead of a function
 * that has to consult the environment to know what it is addressing.
 */

import { declareEndpoint } from "./kinds.js";
import {
  googleBody,
  readGoogleBody,
  readGoogleStream,
} from "./googleWire.js";
import { accessToken } from "../google/auth.js";
import type { RequestSigner } from "../request/fetch.js";

/**
 * The host for a location.
 *
 * A location names its own host, except the global one, which has none — and a
 * hostname built from the word "global" does not resolve.
 */
export function vertexHost(location: string): string {
  return location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
}

/**
 * The base address for an account.
 *
 * Everything that identifies the account is in here, and the endpoint appends
 * only the model and the method. Two facts make this the right split: the host is
 * regional, so it cannot be a constant the way the other endpoints' hosts are,
 * and both the project and the location appear in the path, so a caller that
 * has to state one has to state both.
 */
export function vertexBaseUrl(input: {
  readonly location: string;
  readonly project: string;
}): string {
  return (
    `https://${vertexHost(input.location)}/v1` +
    `/projects/${encodeURIComponent(input.project)}` +
    `/locations/${encodeURIComponent(input.location)}` +
    `/publishers/google/models`
  );
}

/**
 * Where the account's details come from when the caller names none.
 *
 * Read rather than configured because there is no other sensible source: the
 * tooling that sets up a Google account writes exactly these names, and asking a
 * user to repeat them in our own file would be a second place for the same fact
 * to be wrong.
 */
export function vertexTarget(env: Readonly<Record<string, string | undefined>>): {
  readonly project?: string;
  readonly location?: string;
} {
  return {
    ...(env.GOOGLE_CLOUD_PROJECT ? { project: env.GOOGLE_CLOUD_PROJECT } : {}),
    ...(env.GOOGLE_CLOUD_LOCATION ? { location: env.GOOGLE_CLOUD_LOCATION } : {}),
  };
}

declareEndpoint("google-vertex", {
  contextFields: { system: 'systemInstruction', conversation: 'contents', tools: 'tools' },
  // The base address carries the account; this adds the model and the method.
  // The streaming form is a different method name, and the query is what asks for
  // events rather than one document.
  path: (model, stream = true) => `/${encodeURIComponent(model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
  // No static credential: a token is fetched per request and added by the
  // transport, which is the only place that sees the request it belongs to.
  headers: () => ({ "content-type": "application/json", accept: "text/event-stream" }),
  // The token expires, so it is obtained per request rather than resolved once.
  signer: () => vertexAuthorization(),
  body: (input) =>
    googleBody({
      model: input.model,
      systemPrompt: input.systemPrompt ?? "",
      messages: input.messages as never,
      tools: [],
      allowTools: false,
      temperature: input.temperature ?? 0,
      supportsTemperature: input.supportsTemperature,
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    }) as never,
  turnBody: (input) =>
    googleBody({
      model: input.model,
      vision: input.vision,
      systemPrompt: input.systemPrompt,
      messages: input.messages as never,
      tools: input.tools,
      allowTools: input.allowTools,
      ...(input.supportsTemperature !== false ? { temperature: input.temperature } : {}),
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(input.thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens: input.thinkingBudgetTokens } : {}),
      supportsTemperature: input.supportsTemperature,
    }) as never,
  refreshBody: googleRefreshBody,
  readBody: readGoogleBody,
  readStream: readGoogleStream,
});

/**
 * The header that authenticates a request to this endpoint.
 *
 * Exported rather than wired inside the endpoint because the transport owns the
 * moment a request is complete: a token has to be attached to the request it
 * belongs to, and only the transport sees all of one.
 */
export async function vertexAuthorization(): Promise<RequestSigner> {
  return async () => {
    const token = await accessToken();
    return { authorization: `Bearer ${token.token}` };
  };
}
