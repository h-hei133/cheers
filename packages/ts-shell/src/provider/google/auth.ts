/**
 * Turning whatever credential a Google account has into a token.
 *
 * Three kinds of credential reach this, and they are not variations on one thing:
 * a service account signs an assertion with a private key, a signed-in user
 * exchanges a refresh token, and a workload running on Google's own compute asks
 * the machine it is on. All three end as a bearer token, which is why the result
 * is one thing and the ways there are three.
 *
 * WebCrypto only, like the other signing this build does: RS256 is an arithmetic
 * operation over byte strings, both runtimes have it, and asking for a library
 * would be a dependency for one algorithm.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** A token, and when it stops working. */
export interface AccessToken {
  readonly token: string;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
}

/** A credential that could not be used, with which kind it was. */
export class GoogleAuthError extends Error {
  constructor(message: string, readonly kind: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/** What a service account file holds. */
interface ServiceAccount {
  readonly type: "service_account";
  readonly client_email: string;
  readonly private_key: string;
  readonly private_key_id?: string;
}

/** What a signed-in user's file holds. */
interface AuthorizedUser {
  readonly type: "authorized_user";
  readonly client_id: string;
  readonly client_secret: string;
  readonly refresh_token: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const METADATA_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

/**
 * How long before expiry a token is replaced.
 *
 * A token that is valid when the request is built and expired when it arrives is
 * an authentication failure that reads as a wrong credential. The margin absorbs
 * both the clock difference and the time the request spends in flight.
 */
const REFRESH_SKEW_MS = 60_000;

/** Where the signed-in user's credential file lives. */
export function adcPath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return join(env.HOME || homedir(), ".config", "gcloud", "application_default_credentials.json");
}

/**
 * A token for the credential this environment provides.
 *
 * The order is by how directly the credential was placed: a path named in the
 * environment was named for this process, the well-known file is the one a
 * sign-in writes, and the metadata server is what exists when neither does. The
 * result is cached because a token lasts an hour and every request would
 * otherwise pay for a round trip to get one.
 */
export async function accessToken(options: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
} = {}): Promise<AccessToken> {
  const env = options.env ?? process.env;
  const cached = cache;
  if (cached && cached.expiresAt - REFRESH_SKEW_MS > Date.now()) return cached;

  const path = env.GOOGLE_APPLICATION_CREDENTIALS ?? adcPath(env);
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text !== undefined) {
    const token = await fromCredentialFile(text, path, options);
    cache = token;
    return token;
  }

  const fromMetadata = await fromMetadataServer(options);
  if (fromMetadata) {
    cache = fromMetadata;
    return fromMetadata;
  }

  throw new GoogleAuthError(
    `No Google credential found. Set GOOGLE_APPLICATION_CREDENTIALS, sign in with 'gcloud auth application-default login', ` +
      `or run somewhere that provides a metadata server.`,
    "chain",
  );
}

/** The last token this process obtained. */
let cache: AccessToken | undefined;

/** Forget the cached token, so the next call obtains a fresh one. */
export function forgetAccessToken(): void {
  cache = undefined;
}

/** A token from a credential file, whichever of the two kinds it holds. */
async function fromCredentialFile(
  text: string,
  path: string,
  options: { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal },
): Promise<AccessToken> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new GoogleAuthError(`${path} is not JSON`, "credentials file");
  }

  if (parsed.type === "service_account") {
    return exchangeAssertion(parsed as unknown as ServiceAccount, options);
  }
  if (parsed.type === "authorized_user") {
    return exchangeRefreshToken(parsed as unknown as AuthorizedUser, options);
  }
  throw new GoogleAuthError(
    `${path} declares type '${String(parsed.type)}', which is neither a service account nor a signed-in user`,
    "credentials file",
  );
}

/**
 * Exchange a signed assertion for a token.
 *
 * The assertion says who is asking and what for, and is signed with the account's
 * private key — which is what makes it usable without also sending the key. The
 * lifetime is the maximum the endpoint accepts.
 */
async function exchangeAssertion(
  account: ServiceAccount,
  options: { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal },
): Promise<AccessToken> {
  if (!account.client_email || !account.private_key) {
    throw new GoogleAuthError("the service account file has no client email or private key", "service account");
  }
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signAssertion(
    { iss: account.client_email, scope: CLOUD_PLATFORM_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
    account.private_key,
    account.private_key_id,
  );
  return postForToken(
    new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }),
    options,
    "service account",
  );
}

/** Exchange a refresh token for a token, which is what a sign-in leaves behind. */
async function exchangeRefreshToken(
  account: AuthorizedUser,
  options: { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal },
): Promise<AccessToken> {
  if (!account.client_id || !account.client_secret || !account.refresh_token) {
    throw new GoogleAuthError("the credential file is missing part of the refresh set", "signed-in user");
  }
  return postForToken(
    new URLSearchParams({
      client_id: account.client_id,
      client_secret: account.client_secret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
    options,
    "signed-in user",
  );
}

/** The token request, and the reading of what comes back. */
async function postForToken(
  body: URLSearchParams,
  options: { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal },
  kind: string,
): Promise<AccessToken> {
  const response = await (options.fetchImpl ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new GoogleAuthError(`the token request was refused: ${text.slice(0, 200)}`, kind);
  }
  let parsed: { access_token?: string; expires_in?: number };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new GoogleAuthError("the token request did not answer with JSON", kind);
  }
  if (!parsed.access_token) {
    throw new GoogleAuthError("the token request returned no token", kind);
  }
  return {
    token: parsed.access_token,
    // A response with no lifetime is treated as short-lived rather than
    // long-lived: assuming it lasts an hour and being wrong costs a failed
    // request, and assuming the opposite costs a round trip.
    expiresAt: Date.now() + (parsed.expires_in ?? 300) * 1000,
  };
}

/**
 * A token from the machine the process is running on.
 *
 * This is what exists when neither a file nor an environment variable does, and
 * its absence is the normal case off Google's compute — so a failure here is a
 * miss rather than an error, and the chain reports what it found instead.
 */
async function fromMetadataServer(options: {
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<AccessToken | undefined> {
  const timeout = AbortSignal.timeout(2_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await (options.fetchImpl ?? fetch)(METADATA_URL, {
    headers: { "Metadata-Flavor": "Google" },
    signal,
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const parsed = (await response.json().catch(() => undefined)) as
    | { access_token?: string; expires_in?: number }
    | undefined;
  if (!parsed?.access_token) return undefined;
  return {
    token: parsed.access_token,
    expiresAt: Date.now() + (parsed.expires_in ?? 300) * 1000,
  };
}

/**
 * Sign the assertion the token endpoint is asked to accept.
 *
 * The two encoded segments are what is signed, and the signature is appended
 * rather than wrapped: that is what the format is, and a signature over anything
 * else is refused.
 */
async function signAssertion(
  claims: Readonly<Record<string, unknown>>,
  privateKeyPem: string,
  keyId: string | undefined,
): Promise<string> {
  const header: Record<string, unknown> = { alg: "RS256", typ: "JWT", ...(keyId ? { kid: keyId } : {}) };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;

  const key = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

/**
 * The key bytes out of a PEM block.
 *
 * The crypto API takes the encoded key itself, without the armour around it, so
 * the header, the footer and the line breaks come off before decoding.
 */
function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  if (!body) throw new GoogleAuthError("the private key is empty", "service account");
  return Uint8Array.from(Buffer.from(body, "base64"));
}

/**
 * Text or bytes as unpadded base64url.
 *
 * Not standard base64: the format this is used in has no padding and a different
 * last two characters, and a value encoded the other way is rejected.
 */
function base64Url(value: string | Uint8Array): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Whether a file looks like a usable credential, without asking for a token.
 *
 * Used where a caller needs to know whether Google is configured at all — a
 * readiness check that should not spend a round trip to answer.
 */
export async function hasGoogleCredential(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  const path = env.GOOGLE_APPLICATION_CREDENTIALS ?? adcPath(env);
  return (await readFile(path, "utf8").catch(() => undefined)) !== undefined;
}
