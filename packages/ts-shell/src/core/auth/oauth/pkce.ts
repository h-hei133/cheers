import { createHash, randomBytes } from "node:crypto";

/**
 * Proof Key for Code Exchange (RFC 7636).
 *
 * The verifier is a secret this process keeps; the challenge is its SHA-256,
 * which is what travels in the authorize URL. The authorization code is then only
 * redeemable by whoever holds the verifier, which is what makes a public client
 * with no secret safe to run on a laptop.
 *
 * The verifier is drawn from the unreserved character set rather than base64url
 * of random bytes: both are legal, but some authorization servers reject the
 * padding-free base64 alphabet, and the difference only shows up against a real
 * one.
 */

/** RFC 7636 unreserved characters. */
const VERIFIER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
/** Length within the 43..128 the spec allows. */
const VERIFIER_LENGTH = 64;

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** A fresh verifier and its S256 challenge. */
export function createPkcePair(): PkcePair {
  const bytes = randomBytes(VERIFIER_LENGTH);
  let verifier = "";
  for (const byte of bytes) verifier += VERIFIER_ALPHABET[byte % VERIFIER_ALPHABET.length];
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** An opaque value echoed back by the authorization server, to tie the callback to this request. */
export function createState(): string {
  return randomBytes(24).toString("base64url");
}
