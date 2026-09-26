import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { accessToken, adcPath, forgetAccessToken, GoogleAuthError } from "./auth.js";

/**
 * Turning a Google credential into a token.
 *
 * Three kinds of credential reach this and each is a different exchange, so each
 * is checked on its own: what is asked for, and what is read back. The service
 * account case signs a real assertion with a key generated here, because the
 * signature is the part that would silently differ from what the endpoint
 * accepts.
 */

/** A service account file with a real, usable key. */
function serviceAccountFile(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return JSON.stringify({
    type: "service_account",
    client_email: "robot@project.iam.gserviceaccount.com",
    private_key: privateKey,
    private_key_id: "kid-1",
  });
}

/** A fetch that answers with a token and records what it was sent. */
function tokenEndpoint(response: unknown, ok = true) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(typeof response === "string" ? response : JSON.stringify(response), {
      status: ok ? 200 : 400,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A home with a credential file at the path the environment names. */
async function withCredential(contents: string): Promise<Record<string, string>> {
  const directory = await mkdtemp(join(tmpdir(), "google-auth-"));
  const path = join(directory, "credential.json");
  await writeFile(path, contents);
  return { HOME: directory, GOOGLE_APPLICATION_CREDENTIALS: path };
}

describe("where the credential file is", () => {
  it("is the well-known path when nothing names one", () => {
    expect(adcPath({ HOME: "/home/someone" })).toBe(
      "/home/someone/.config/gcloud/application_default_credentials.json",
    );
  });
});

describe("a service account", () => {
  it("exchanges a signed assertion for a token", async () => {
    const env = await withCredential(serviceAccountFile());
    const { fetchImpl, calls } = tokenEndpoint({ access_token: "TOKEN", expires_in: 3600 });
    forgetAccessToken();

    const token = await accessToken({ env, fetchImpl });

    expect(token.token).toBe("TOKEN");
    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0]!.body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    expect(calls[0]!.body).toContain("assertion=");
  });

  it("sends an assertion that says who is asking and for what", async () => {
    // The claims are the part the endpoint validates, so they are read back out
    // of the request rather than assumed.
    const env = await withCredential(serviceAccountFile());
    const { fetchImpl, calls } = tokenEndpoint({ access_token: "T", expires_in: 60 });
    forgetAccessToken();
    await accessToken({ env, fetchImpl });

    const assertion = new URLSearchParams(calls[0]!.body).get("assertion")!;
    const [header, claims, signature] = assertion.split(".");
    const decode = (segment: string) => JSON.parse(Buffer.from(segment!, "base64url").toString("utf8"));

    expect(decode(header!)).toMatchObject({ alg: "RS256", typ: "JWT", kid: "kid-1" });
    expect(decode(claims!)).toMatchObject({
      iss: "robot@project.iam.gserviceaccount.com",
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
    });
    // The signature is over the two encoded segments, which is what the format is.
    expect(signature).toBeTruthy();
    expect(signature!.length).toBeGreaterThan(300);
  });

  it("reports what the endpoint said when it refuses", async () => {
    const env = await withCredential(serviceAccountFile());
    const { fetchImpl } = tokenEndpoint("invalid_grant", false);
    forgetAccessToken();

    await expect(accessToken({ env, fetchImpl })).rejects.toThrow(/invalid_grant/);
  });
});

describe("a signed-in user", () => {
  it("exchanges the refresh set for a token", async () => {
    const env = await withCredential(
      JSON.stringify({
        type: "authorized_user",
        client_id: "cid",
        client_secret: "secret",
        refresh_token: "refresh",
      }),
    );
    const { fetchImpl, calls } = tokenEndpoint({ access_token: "TOKEN", expires_in: 3600 });
    forgetAccessToken();

    const token = await accessToken({ env, fetchImpl });

    expect(token.token).toBe("TOKEN");
    const body = new URLSearchParams(calls[0]!.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("refresh_token")).toBe("refresh");
  });

  it("refuses a file that is missing part of the set", async () => {
    const env = await withCredential(JSON.stringify({ type: "authorized_user", client_id: "cid" }));
    forgetAccessToken();

    await expect(accessToken({ env })).rejects.toThrow(/missing part of the refresh set/);
  });
});

describe("the machine the process runs on", () => {
  it("asks the metadata server when there is no file", async () => {
    forgetAccessToken();
    const fetchImpl = (async (url: string | URL) => {
      expect(String(url)).toContain("metadata.google.internal");
      return new Response(JSON.stringify({ access_token: "METADATA", expires_in: 600 }));
    }) as unknown as typeof fetch;

    const token = await accessToken({ env: { HOME: "/nonexistent" }, fetchImpl });

    expect(token.token).toBe("METADATA");
  });

  it("sends the header the metadata server requires", async () => {
    // Without it the server refuses, and the refusal looks like the credential
    // being absent rather than the header being missing.
    forgetAccessToken();
    let sent: Record<string, string> = {};
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      sent = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ access_token: "T" }));
    }) as unknown as typeof fetch;

    await accessToken({ env: { HOME: "/nonexistent" }, fetchImpl });

    expect(sent["Metadata-Flavor"]).toBe("Google");
  });

  it("is a miss rather than an error when it does not answer", async () => {
    // This is the normal case off Google's compute, so reporting it as an error
    // would make every such run look broken.
    forgetAccessToken();
    const fetchImpl = (async () => {
      throw new Error("unreachable");
    }) as unknown as typeof fetch;

    await expect(accessToken({ env: { HOME: "/nonexistent" }, fetchImpl })).rejects.toThrow(
      /No Google credential found/,
    );
  });
});

describe("the token cache", () => {
  it("reuses a token that is still good", async () => {
    // A token lasts an hour; asking for one per request would pay for a round
    // trip every time.
    const env = await withCredential(serviceAccountFile());
    const { fetchImpl, calls } = tokenEndpoint({ access_token: "T", expires_in: 3600 });
    forgetAccessToken();

    await accessToken({ env, fetchImpl });
    await accessToken({ env, fetchImpl });

    expect(calls).toHaveLength(1);
  });

  it("replaces a token that is about to lapse", async () => {
    // A token that is valid when the request is built and expired when it arrives
    // is an authentication failure that reads as a wrong credential.
    const env = await withCredential(serviceAccountFile());
    const { fetchImpl, calls } = tokenEndpoint({ access_token: "T", expires_in: 30 });
    forgetAccessToken();

    await accessToken({ env, fetchImpl });
    await accessToken({ env, fetchImpl });

    expect(calls).toHaveLength(2);
  });
});

describe("a file that is not a credential", () => {
  it("says which kind it was instead of failing obscurely", async () => {
    const env = await withCredential(JSON.stringify({ type: "external_account" }));
    forgetAccessToken();

    await expect(accessToken({ env })).rejects.toThrow(GoogleAuthError);
    await expect(accessToken({ env })).rejects.toThrow(/external_account/);
  });

  it("is an error rather than a miss when it is not JSON", async () => {
    const env = await withCredential("not json");
    forgetAccessToken();

    await expect(accessToken({ env })).rejects.toThrow(/not JSON/);
  });
});
