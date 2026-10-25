/** A credential, and when it stops working. */
export interface Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  /** Epoch milliseconds. Absent means the credential does not expire. */
  readonly expiresAt?: number;
}

/** How to find one. */
export interface ResolveOptions {
  /** A named profile. Absent falls back to the environment, then to the default. */
  readonly profile?: string;
  readonly region?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/** A source that could not answer, with what it was. */
export class CredentialsError extends Error {
  constructor(message: string, readonly source: string) {
    super(message);
    this.name = "CredentialsError";
  }
}
