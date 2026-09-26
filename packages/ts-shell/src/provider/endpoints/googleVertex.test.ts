import { describe, expect, it } from "vitest";
import { declareEndpoint, endpointShape, endpointTurnBody, endpointUrl } from "./index.js";
import { vertexBaseUrl, vertexHost, vertexTarget } from "./googleVertex.js";

/**
 * The Vertex endpoint.
 *
 * What makes it a different service from the other Google one is the address and
 * the credential, so that is what is checked: the host follows the location, the
 * resource path names the account, and the request body is the shared translation
 * rather than a second copy of it.
 */

describe("the host", () => {
  it("follows the location", () => {
    expect(vertexHost("us-central1")).toBe("us-central1-aiplatform.googleapis.com");
  });

  it("has no prefix for the global location", () => {
    // A hostname built from the word "global" does not resolve, and this is the
    // location accounts that have not chosen one get.
    expect(vertexHost("global")).toBe("aiplatform.googleapis.com");
  });
});

describe("the base address", () => {
  it("names the account in the resource path", () => {
    // There is no path that reaches a model without saying whose it is and where
    // it lives, which is why both travel in the address rather than in the body.
    expect(vertexBaseUrl({ location: "us-central1", project: "my-project" })).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models",
    );
  });

  it("encodes a project that needs it", () => {
    expect(vertexBaseUrl({ location: "l", project: "a/b" })).toContain("projects/a%2Fb");
  });
});

describe("the endpoint", () => {
  it("adds the model and the streaming method to the base", () => {
    const shape = endpointShape("google-vertex");

    expect(shape.path("gemini-2.5-pro")).toBe("/gemini-2.5-pro:streamGenerateContent?alt=sse");
  });

  it("reaches the address a caller built", () => {
    const base = vertexBaseUrl({ location: "us-central1", project: "p" });

    expect(endpointUrl(base, "google-vertex", "gemini-2.5-pro")).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google/models/gemini-2.5-pro:streamGenerateContent?alt=sse",
    );
  });

  it("states no static credential, because its token is per request", () => {
    // A bearer token expires, so it cannot be resolved when the session is built.
    // The transport adds it, which is the only place that sees the whole request.
    expect(endpointShape("google-vertex").headers("unused")).toEqual({
      "content-type": "application/json",
      accept: "text/event-stream",
    });
  });

  it("builds the same body as the other Google endpoint", () => {
    // The translation is shared, so this is checking that it is shared rather
    // than that it is correct — the other endpoint's tests cover that.
    const turn = {
      model: "m",
      systemPrompt: "s",
      messages: [{ role: "user" as const, content: "hi" }],
      tools: [],
      allowTools: true,
      vision: false,
      temperature: 0.1,
      systemRole: "system" as const,
      reasoningEffort: false,
      maxTokensField: "max_tokens" as const,
      assistantAfterToolResult: false,
    };

    expect(endpointTurnBody("google-vertex", turn)).toEqual(endpointTurnBody("google-generative-ai", turn));
  });
});

describe("where the account's details come from", () => {
  it("reads the names the tooling writes", () => {
    expect(vertexTarget({ GOOGLE_CLOUD_PROJECT: "p", GOOGLE_CLOUD_LOCATION: "l" })).toEqual({
      project: "p",
      location: "l",
    });
  });

  it("reports nothing when neither is set", () => {
    expect(vertexTarget({})).toEqual({});
  });
});

describe("a declared protocol nobody ships", () => {
  it("can still be registered, which is what makes a protocol a module", () => {
    // The claim that adding a protocol touches nothing else is only worth making
    // if it can be shown, and this is the thing that shows it.
    declareEndpoint("test-vertex-shaped", { ...endpointShape("google-vertex"), path: () => "/x" });

    expect(endpointUrl("https://a.test", "test-vertex-shaped", "m")).toBe("https://a.test/x");
  });
});
