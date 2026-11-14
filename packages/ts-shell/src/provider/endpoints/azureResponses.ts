import { declareEndpoint } from "./kinds.js";
import { responseBody } from "./responses/body.js";
import { readResponse } from "./responses/output.js";
import { readResponseStream } from "./responses/stream.js";

/**
 * Azure OpenAI Responses endpoint (`azure-openai-responses`).
 */

const DEFAULT_AZURE_API_VERSION = "v1";

function azureApiVersion(): string {
  return process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_AZURE_API_VERSION;
}

function validateModel(model: string): void {
  if (!model.trim() || model === "." || model === "..") {
    throw new Error("Invalid Azure OpenAI deployment model identifier.");
  }
}

function responsesPath(version: string): string {
  return version === "v1" ? "/openai/v1/responses" : "/openai/responses";
}

function responsesUrl(baseUrl: string, model: string): string {
  validateModel(model);
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Invalid Azure OpenAI endpoint URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Invalid Azure OpenAI endpoint protocol.");
  }
  const version = url.searchParams.get("api-version") || azureApiVersion();
  const path = url.pathname.replace(/\/+$/, "");
  const azureHost = [".openai.azure.com", ".cognitiveservices.azure.com", ".ai.azure.com"]
    .some(suffix => url.hostname.endsWith(suffix));
  if (azureHost && (path === "" || path === "/openai")) {
    url.pathname = responsesPath(version);
  } else if (!path.endsWith("/responses")) {
    url.pathname = `${path}/responses`;
  } else {
    url.pathname = path;
  }
  url.searchParams.set("api-version", version);
  url.hash = "";
  return url.toString();
}

declareEndpoint("azure-openai-responses", {
  contextFields: { system: "instructions", conversation: "input", tools: "tools" },
  path: (model) => {
    validateModel(model);
    const version = azureApiVersion();
    return `${responsesPath(version)}?api-version=${encodeURIComponent(version)}`;
  },
  url: responsesUrl,
  headers: (apiKey) => ({
    ...(apiKey ? { "api-key": apiKey } : {}),
    "content-type": "application/json",
  }),
  body: (input) => responseBody(input, false),
  turnBody: (input) => responseBody(input, true),
  readBody: (body) => readResponse(body),
  readStream: (body) => readResponseStream(body),
});
