import { declareEndpoint } from "./kinds.js";
import { responseBody } from "./responses/body.js";
import { readResponse } from "./responses/output.js";
import { readResponseStream } from "./responses/stream.js";

/**
 * Azure OpenAI Responses endpoint (`azure-openai-responses`).
 */

const DEFAULT_AZURE_API_VERSION = "2025-04-01-preview";

function azureApiVersion(): string {
  return process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_AZURE_API_VERSION;
}

declareEndpoint("azure-openai-responses", {
  contextFields: { system: "instructions", conversation: "input", tools: "tools" },
  path: (model) => {
    if (!model || model === "." || model === "..") {
      throw new Error("Invalid Azure OpenAI deployment model identifier.");
    }
    const version = encodeURIComponent(azureApiVersion());
    return `/openai/deployments/${encodeURIComponent(model)}/responses?api-version=${version}`;
  },
  headers: (apiKey) => ({
    ...(apiKey ? { "api-key": apiKey } : {}),
    "content-type": "application/json",
  }),
  body: (input) => responseBody(input, false),
  turnBody: (input) => responseBody(input, true),
  readBody: (body) => readResponse(body),
  readStream: (body) => readResponseStream(body),
});
