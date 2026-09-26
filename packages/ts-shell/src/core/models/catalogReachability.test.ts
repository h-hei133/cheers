import { describe, expect, it } from "vitest";
import { BUILTIN_PROVIDERS, providerEndpoint } from "./catalog.js";
import { isRuntimeProvider } from "../../config/runtimeConfig.js";
import { providerFacts } from "../providers/facts.js";

/**
 * The protocols that ship with their own endpoint are reachable.
 *
 * An endpoint nobody can select is an endpoint nobody can use: the adapter, its
 * tests and its translation all exist, and a request never reaches it. The
 * three checked here are declared in the catalogue with an endpoint of their
 * own, so what makes them usable is being nameable as a connection's provider —
 * which is exactly what `isRuntimeProvider` answers.
 */
describe("a provider that ships its own protocol", () => {
  const protocolProviders = [
    { id: "bedrock", endpoint: "bedrock-converse-stream" },
    { id: "google-ai", endpoint: "google-generative-ai" },
    { id: "vertex", endpoint: "google-vertex" },
  ] as const;

  for (const { id, endpoint } of protocolProviders) {
    it(`can be named as a connection's provider: ${id}`, () => {
      expect(isRuntimeProvider(id)).toBe(true);
    });

    it(`reaches the endpoint it declares: ${id}`, () => {
      // The lookup is by the id a connection carries, so this is the path a
      // request actually takes.
      expect(providerEndpoint(BUILTIN_PROVIDERS, id)).toBe(endpoint);
    });

    it(`carries no placeholder where an address belongs: ${id}`, () => {
      const entry = BUILTIN_PROVIDERS.find((candidate) => candidate.id === id)!;
      // A base URL containing a placeholder is copied into a command and sent.
      for (const value of [entry.baseUrl ?? "", ...entry.models.map((model) => model.id)]) {
        expect(value).not.toMatch(/GOOGLE_CLOUD_|YOUR_|_PROJECT_|<[a-z-]+>/i);
      }
    });
  }

  it("maps its catalogue id onto the provider a connection records", () => {
    // The catalogue id and the connection's provider have to agree, or the
    // endpoint is found for an id nothing ever passes in.
    for (const { id } of protocolProviders) {
      const entry = BUILTIN_PROVIDERS.find((candidate) => candidate.id === id)!;
      expect(entry.runtime).toBe(id);
    }
  });
});

describe("the address a Vertex request goes to", () => {
  /**
   * It is built from the account, not written down.
   *
   * This provider puts the project and the location in the address, so there is
   * no single URL that is right for everyone. A fixed string would have to be a
   * placeholder, and a placeholder that reaches a user gets copied into a
   * command and sent — the request then fails somewhere far from the cause.
   */
  it("is absent from the catalogue rather than a placeholder", () => {
    const vertex = BUILTIN_PROVIDERS.find((candidate) => candidate.id === "vertex")!;

    expect(vertex.baseUrl).toBeUndefined();
  });

  it("is computed from the environment that names the account", async () => {
    const { resolveProviderCredential } = await import("../shell/providerCredentials.js");
    const resolution = resolveProviderCredential({
      runtimeConfig: {
        provider: "vertex",
        providerConnections: [],
        providerCredentials: {},
      } as never,
      env: {
        GOOGLE_CLOUD_PROJECT: "my-project",
        GOOGLE_CLOUD_LOCATION: "europe-west4",
      },
    });

    expect(resolution.baseUrl).toBe(
      "https://europe-west4-aiplatform.googleapis.com/v1/projects/my-project/locations/europe-west4/publishers/google/models",
    );
  });

  it("stays absent when the account is not stated, rather than guessing", async () => {
    const { resolveProviderCredential } = await import("../shell/providerCredentials.js");
    const resolution = resolveProviderCredential({
      runtimeConfig: {
        provider: "vertex",
        providerConnections: [],
        providerCredentials: {},
      } as never,
      env: {},
    });

    expect(resolution.baseUrl).toBeUndefined();
  });
});

describe("a provider whose credential is computed, not supplied", () => {
  /**
   * Its environment variable is not the one the account already uses.
   *
   * This name is what the credential resolver reads, and anything found there is
   * treated as a static key — which would replace the signature entirely and send
   * the request unsigned. `AWS_ACCESS_KEY_ID` and `GOOGLE_APPLICATION_CREDENTIALS`
   * are read by the signing and account chains respectively, so naming either here
   * would read the same variable twice and let the wrong reader win.
   */
  it("does not name the variable its signing chain reads", () => {
    const taken = new Set(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]);

    for (const id of ["bedrock", "vertex"] as const) {
      const facts = providerFacts(id);
      expect(taken.has(facts.apiKeyEnvVar), `${id} → ${facts.apiKeyEnvVar}`).toBe(false);
    }
  });

  it("resolves no static key from an ambient AWS credential", async () => {
    const { resolveProviderCredential } = await import("../shell/providerCredentials.js");
    const resolution = resolveProviderCredential({
      runtimeConfig: {
        provider: "bedrock",
        providerConnections: [],
        providerCredentials: {},
      } as never,
      env: { AWS_ACCESS_KEY_ID: "AKIDEXAMPLE", AWS_SECRET_ACCESS_KEY: "secret" },
    });

    // No key is picked up, so authorization falls through to the endpoint's own
    // signer rather than sending the ambient key as a bearer token.
    expect(resolution.credential ?? undefined).toBeUndefined();
  });
});
