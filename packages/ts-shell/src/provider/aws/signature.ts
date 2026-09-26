/**
 * Signing a request the way AWS requires.
 *
 * Some endpoints do not take a static credential. They take a signature over the
 * request itself: the method, the URL, the headers and a hash of the body, keyed
 * with a secret derived from the account's secret access key. Nothing can be
 * precomputed, because the body is most of what is being signed — which is why
 * this runs at the transport, where the body exists, rather than where the
 * credential is resolved.
 *
 * WebCrypto only. Node has its own crypto module, but a signature is arithmetic
 * over byte strings and both runtimes have the same primitives; staying on the
 * standard one keeps this usable from either and adds no dependency.
 */

/** The account material a signature is derived from. */
export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /**
   * A token that travels with temporary credentials.
   *
   * Present when the credential came from a role rather than from a user. It is
   * signed like any other header and must also be sent, because the service
   * checks that the token in the request is the one the signature covers.
   */
  readonly sessionToken?: string;
}

/** Everything a signature is computed over. */
export interface SignatureInput {
  readonly method: string;
  /** Hostname only. It becomes the `host` header and part of the signed text. */
  readonly host: string;
  /** The path, before canonicalization. */
  readonly path: string;
  /** A query string without its leading `?`, when the request has one. */
  readonly query?: string;
  /** Headers to sign in addition to the ones this adds. Matched case-insensitively. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
  readonly region: string;
  readonly service: string;
  readonly credentials: AwsCredentials;
  /** The moment to sign for. Absent means now; present so a test can be exact. */
  readonly at?: Date;
}

/**
 * What the request has to carry for the service to accept the signature.
 *
 * A header map that also names the four fields always present, so a reader that
 * needs one gets it without a lookup and a transport can still treat the whole
 * thing as headers. The session token appears only when the credential is
 * temporary, which is why it is not among the named ones.
 */
export type SignedHeaders = Record<string, string> & {
  readonly host: string;
  readonly "x-amz-date": string;
  readonly "x-amz-content-sha256": string;
  readonly authorization: string;
};

const ALGORITHM = "AWS4-HMAC-SHA256";
const TERMINATOR = "aws4_request";

/**
 * Headers a signature never covers.
 *
 * The list is the specification's, not a preference: these are the ones that
 * describe the connection rather than the request, so they are added or changed
 * by intermediaries on the way and a signature over them could not survive the
 * trip. Signing one would make every request through a proxy fail.
 */
const UNSIGNABLE: Readonly<Record<string, true>> = {
  authorization: true,
  "cache-control": true,
  connection: true,
  expect: true,
  from: true,
  "keep-alive": true,
  "max-forwards": true,
  pragma: true,
  referer: true,
  te: true,
  trailer: true,
  "transfer-encoding": true,
  upgrade: true,
  "user-agent": true,
  "x-amzn-trace-id": true,
};

/**
 * A view of the bytes that the crypto API will accept.
 *
 * `crypto.subtle` wants a buffer it owns outright. A `Uint8Array` that is a
 * window onto a larger one satisfies the type at runtime and not at the type
 * level, so a copy is taken in that case rather than a cast — the copy is small
 * and a wrong cast here is a signature over the wrong bytes.
 */
function contiguous(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

const subtle = globalThis.crypto.subtle;
const HEX = "0123456789abcdef";

/** Bytes as lowercase hex, which is how every value in this scheme is written. */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += HEX[byte >> 4]! + HEX[byte & 15]!;
  return out;
}

/** The SHA-256 of some text, as hex. */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : contiguous(data);
  return toHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await subtle.importKey(
    "raw",
    contiguous(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)));
}

/**
 * The key a signature is actually made with.
 *
 * Not the secret itself. The secret is stretched through four rounds so that a
 * signature cannot be used to recover it and so that a key leaked for one region
 * and service is useless for another. The rounds are the specification's and the
 * order matters.
 */
export async function signingKeyFor(
  secretAccessKey: string,
  shortDate: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const dated = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), shortDate);
  const scoped = await hmac(dated, region);
  const serviced = await hmac(scoped, service);
  return hmac(serviced, TERMINATOR);
}

/**
 * A moment in the two forms the scheme needs.
 *
 * Both come from one string so they cannot disagree: the long form stamps the
 * request and the short one names the date the signing key is scoped to, and a
 * request that straddles midnight with the two derived separately would be
 * signed with one day's key and dated the other.
 */
export function signingClock(at: Date): { readonly longDate: string; readonly shortDate: string } {
  const iso = at.toISOString();
  const longDate = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { longDate, shortDate: longDate.slice(0, 8) };
}

/** Percent-encoding to the specification's set, which is narrower than `encodeURIComponent`'s. */
function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The path, encoded per segment with the separators left alone.
 *
 * Encoding the whole path would turn the separators into `%2F` and name a
 * different resource. Model identifiers carry `:` and `.`, so encoding has to
 * happen at all.
 */
function canonicalPath(path: string): string {
  return path.split("/").map(encodeComponent).join("/");
}

/**
 * The query, encoded and then sorted by the encoded text.
 *
 * The order is by the encoded form and not the decoded one, which is the part
 * that is easy to get wrong: `%7B` decodes to `{`, so decoded it sorts after
 * `x`, while encoded its leading `%` sorts before. The service computes the
 * signature over its own canonicalization, so an order that differs from the
 * specification's is a rejected request rather than a wrong-looking one.
 *
 * A component is decoded before it is re-encoded so that a value already
 * escaped once — an ARN's `:` and `/`, a percent sign — is canonicalized rather
 * than left as the caller wrote it. A lone `%` is not a valid escape, and a
 * decoder that threw on one would turn a working request into an exception, so
 * it is passed through and encoded as the literal it is.
 */
export function canonicalQuery(query: string | undefined): string {
  if (!query) return "";
  const pairs: Array<readonly [string, string]> = [];
  for (const part of query.split("&")) {
    if (!part) continue;
    const equals = part.indexOf("=");
    const rawKey = equals === -1 ? part : part.slice(0, equals);
    const rawValue = equals === -1 ? "" : part.slice(equals + 1);
    pairs.push([
      encodeComponent(safelyDecode(rawKey)),
      encodeComponent(safelyDecode(rawValue)),
    ]);
  }
  pairs.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0));
  return pairs.map(([key, value]) => `${key}=${value}`).join("&");
}

/**
 * A component with its escapes resolved, or unchanged when they are not escapes.
 *
 * Percent-encoding is lossy to read: `+` means a space in a form body and a plus
 * in a path, and only the caller knows which convention produced the string. So
 * a component that arrived already escaped is treated as escaped, and the one
 * case that is unambiguously wrong — a `%` that does not begin a two-digit
 * escape — is left alone rather than allowed to throw.
 */
function safelyDecode(component: string): string {
  try {
    return decodeURIComponent(component);
  } catch {
    return component;
  }
}

/**
 * Sign a request, returning the headers it has to carry.
 *
 * The headers returned are added to whatever the caller already set. Nothing is
 * removed: a caller's `content-type` is signed rather than replaced, because the
 * service checks that the headers in the request are the ones the signature
 * covers.
 */
export async function signAwsRequest(input: SignatureInput): Promise<SignedHeaders> {
  const { longDate, shortDate } = signingClock(input.at ?? new Date());
  const payloadHash = await sha256Hex(input.body);

  const signed: Record<string, string> = {
    host: input.host,
    "x-amz-date": longDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (input.credentials.sessionToken) {
    signed["x-amz-security-token"] = input.credentials.sessionToken;
  }
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    const lower = name.toLowerCase();
    if (UNSIGNABLE[lower]) continue;
    // Connection-level and security-prefixed headers are added by intermediaries
    // and are not part of what the caller is asking for.
    if (lower.startsWith("proxy-") || lower.startsWith("sec-")) continue;
    // Whitespace inside a header value is collapsed: the specification compares
    // the canonical form, and two spaces where the sender wrote one would
    // otherwise be a different signature over the same request.
    signed[lower] = value.trim().replace(/\s+/g, " ");
  }

  const names = Object.keys(signed).sort();
  const canonicalHeaders = `${names.map((name) => `${name}:${signed[name]}`).join("\n")}\n`;
  const signedNames = names.join(";");

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalPath(input.path),
    canonicalQuery(input.query),
    canonicalHeaders,
    signedNames,
    payloadHash,
  ].join("\n");

  const scope = `${shortDate}/${input.region}/${input.service}/${TERMINATOR}`;
  const stringToSign = [
    ALGORITHM,
    longDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const key = await signingKeyFor(
    input.credentials.secretAccessKey,
    shortDate,
    input.region,
    input.service,
  );
  const signature = toHex(await hmac(key, stringToSign));

  return {
    host: input.host,
    "x-amz-date": longDate,
    "x-amz-content-sha256": payloadHash,
    authorization:
      `${ALGORITHM} Credential=${input.credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedNames}, Signature=${signature}`,
    ...(input.credentials.sessionToken
      ? { "x-amz-security-token": input.credentials.sessionToken }
      : {}),
  };
}
