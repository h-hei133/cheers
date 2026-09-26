import { describe, expect, it } from "vitest";
import {
  canonicalQuery,
  sha256Hex,
  signAwsRequest,
  signingClock,
  signingKeyFor,
  toHex,
} from "./signature.js";

/**
 * Signing, against the values AWS publishes.
 *
 * Every expectation below is a value the specification or its test suite states,
 * not one this code produced. That is the whole point: a signature is only
 * correct if it matches what the service computes, and the service is not here to
 * ask — so the published vectors are the only thing that can tell us.
 */

const CREDENTIALS = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
/** The moment the specification's own examples are written for. */
const AT = new Date("2015-08-30T12:36:00Z");

describe("the values AWS publishes", () => {
  it("derives the signing key the specification documents", async () => {
    // From the SigV4 examples: secret + 20150830 + us-east-1 + iam.
    const key = await signingKeyFor(CREDENTIALS.secretAccessKey, "20150830", "us-east-1", "iam");

    expect(toHex(key)).toBe("c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9");
  });

  it("hashes the empty string to the value that appears in every example", async () => {
    // The hash of no bytes. It shows up as the payload hash of every GET in the
    // test suite, so it is the one constant worth pinning on its own.
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("writes both date forms from one instant", () => {
    expect(signingClock(AT)).toEqual({ longDate: "20150830T123600Z", shortDate: "20150830" });
  });
});

describe("the canonical query", () => {
  it("sorts by the encoded text, not the decoded text", () => {
    // `%7B` decodes to `{` (0x7B), so decoded it sorts after `x` (0x78). Encoded,
    // its leading `%` (0x25) sorts before. The specification says to sort the
    // encoded form, and a service validating the signature computes it that way —
    // so the other order is a rejected request, not a cosmetic difference.
    expect(canonicalQuery("x=1&%7B=2")).toBe("%7B=2&x=1");
  });

  it("encodes a value that needs it", () => {
    expect(canonicalQuery("a=b c")).toBe("a=b%20c");
  });

  it("is empty when there is no query", () => {
    expect(canonicalQuery(undefined)).toBe("");
    expect(canonicalQuery("")).toBe("");
  });

  it("keeps a parameter with no value", () => {
    expect(canonicalQuery("flag")).toBe("flag=");
  });
});

describe("signing a request", () => {
  const base = {
    method: "POST",
    host: "bedrock-runtime.us-east-1.amazonaws.com",
    path: "/model/anthropic.claude-3/converse-stream",
    body: '{"a":1}',
    region: "us-east-1",
    service: "bedrock-runtime",
    credentials: CREDENTIALS,
    at: AT,
  };

  it("names the credential, the signed headers and a signature", async () => {
    const signed = await signAwsRequest(base);

    expect(signed.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/bedrock-runtime\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
    expect(signed["x-amz-date"]).toBe("20150830T123600Z");
    expect(signed.host).toBe(base.host);
  });

  it("signs the hash of the body it was given", async () => {
    const signed = await signAwsRequest(base);

    expect(signed["x-amz-content-sha256"]).toBe(await sha256Hex('{"a":1}'));
    // And a different body is a different signature, which is what makes the
    // body part of the credential rather than something a proxy could change.
    const other = await signAwsRequest({ ...base, body: '{"a":2}' });
    expect(other.authorization).not.toBe(signed.authorization);
  });

  it("covers the caller's content type but not the headers intermediaries rewrite", async () => {
    const signed = await signAwsRequest({
      ...base,
      headers: {
        "content-type": "application/json",
        accept: "application/vnd.amazon.eventstream",
        "user-agent": "someone",
        connection: "keep-alive",
      },
    });

    const signedNames = /SignedHeaders=([^,]+)/.exec(signed.authorization)![1]!;
    expect(signedNames).toContain("content-type");
    expect(signedNames).toContain("accept");
    // Both are on the specification's unsignable list: an intermediary may add
    // or change them, so covering them would fail every request through a proxy.
    expect(signedNames).not.toContain("user-agent");
    expect(signedNames).not.toContain("connection");
  });

  it("sends the session token and covers it", async () => {
    const signed = await signAwsRequest({
      ...base,
      credentials: { ...CREDENTIALS, sessionToken: "TOKEN" },
    });

    expect(signed["x-amz-security-token"]).toBe("TOKEN");
    const signedNames = /SignedHeaders=([^,]+)/.exec(signed.authorization)![1]!;
    expect(signedNames).toContain("x-amz-security-token");
  });

  it("collapses whitespace in a header value", async () => {
    // Two spaces where the sender wrote one would otherwise be a different
    // signature over what the service reads as the same request.
    const spaced = await signAwsRequest({ ...base, headers: { "content-type": "a  b" } });
    const plain = await signAwsRequest({ ...base, headers: { "content-type": "a b" } });

    expect(spaced.authorization).toBe(plain.authorization);
  });

  it("encodes a model identifier in the path without encoding the separators", async () => {
    // Model ids carry `:` and `.`, and turning the separators into `%2F` would
    // name a different resource.
    const signed = await signAwsRequest({ ...base, path: "/model/a:b.c/d" });

    expect(signed.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
    const plain = await signAwsRequest({ ...base, path: "/model/a:b.c/d" });
    expect(plain.authorization).toBe(signed.authorization);
  });
});
