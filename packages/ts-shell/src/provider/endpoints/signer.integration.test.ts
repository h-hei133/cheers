import { describe, expect, it } from "vitest";
import { endpointShape, endpointUrl } from "./index.js";
import { sha256Hex } from "../aws/signature.js";

/**
 * The signature the protocol actually sends.
 *
 * The endpoint's shape is where its credential lives, so this is where it is
 * checked: the declaration is asked for a signer and the signer is run over a
 * request like the one a turn builds. Without this the protocol would be
 * reachable and every request refused — a feature that looks finished and is not.
 *
 * The transport applying a declared signer, and declining to apply one that was
 * not declared, is checked where that composition lives.
 */
describe("the signer the Bedrock endpoint declares", () => {
  it("signs the request the turn built", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
      AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      AWS_REGION: "us-east-1",
    });
    try {
      const shape = endpointShape("bedrock-converse-stream");
      expect(shape.signer).toBeDefined();
      const signer = await shape.signer!();
      expect(signer).toBeDefined();

      const url = endpointUrl("https://bedrock-runtime.us-east-1.amazonaws.com", "bedrock-converse-stream", "m1");
      const body = JSON.stringify({ messages: [] });
      const signed = await signer!({
        url,
        method: "POST",
        headers: shape.headers(""),
        body,
      });

      // The credential is named, the date is the form the scheme requires, and
      // the payload hash covers what was sent — which is what makes the body part
      // of the credential rather than something a proxy could change.
      expect(signed.authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/bedrock-runtime\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
      );
      expect(signed["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
      expect(signed["x-amz-content-sha256"]).toBe(await sha256Hex(body));
      // The host is part of the signature, so it has to be the host the request
      // goes to or the service rejects a signature that is otherwise correct.
      expect(signed.host).toBe("bedrock-runtime.us-east-1.amazonaws.com");
    } finally {
      for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]) delete process.env[name];
      Object.assign(process.env, saved);
    }
  });

  it("signs for the region the environment names", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "eu-west-1",
    });
    try {
      const shape = endpointShape("bedrock-converse-stream");
      const signer = await shape.signer!();
      const signed = await signer!({
        url: "https://bedrock-runtime.eu-west-1.amazonaws.com/model/m1/converse-stream",
        method: "POST",
        headers: shape.headers(""),
        body: "{}",
      });

      expect(signed.authorization).toContain("/eu-west-1/bedrock-runtime/aws4_request");
    } finally {
      for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]) delete process.env[name];
      Object.assign(process.env, saved);
    }
  });
});

describe("the signer the Vertex endpoint declares", () => {
  it("adds a bearer token rather than a constant header", async () => {
    // The token expires, which is why this cannot be a header resolved when the
    // session is built.
    const shape = endpointShape("google-vertex");

    expect(shape.signer).toBeDefined();
    // Its static headers carry no credential at all.
    expect(Object.keys(shape.headers(""))).not.toContain("authorization");
  });
});

describe("the endpoints that carry a constant credential", () => {
  it("declare no signer, so the transport does nothing extra", () => {
    expect(endpointShape("openai-compatible").signer).toBeUndefined();
    expect(endpointShape("anthropic-messages").signer).toBeUndefined();
    expect(endpointShape("google-generative-ai").signer).toBeUndefined();
  });
});
