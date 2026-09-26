/**
 * Finding the credential a request is signed with.
 *
 * There is no single answer to where an account keeps its keys. A laptop has them
 * in a file, a container has them behind a local endpoint, an instance has them
 * behind another, and a build agent has them in the environment. The order below
 * is the one the tooling established, and it is ordered by specificity: the more
 * deliberately something was placed, the earlier it is consulted.
 *
 * Only the first source that answers is used. Falling through on a partially
 * complete answer would mix credentials from two places, which signs a request
 * with a key pair that does not exist.
 */

import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { signAwsRequest } from "./signature.js";
import {
  homeDirectory,
  mergedProfile,
  parseProfileFile,
  profileFilePaths,
  resolveProfileName,
  resolveRegion,
  shouldReadConfig,
  type ProfileFile,
} from "./profile.js";

const execFileAsync = promisify(execFile);

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

/**
 * How long before expiry a credential is replaced.
 *
 * A credential that is valid when a request is signed and expired when it is
 * received fails as an authentication error, which reads as a wrong key. The
 * margin is what makes a renewal happen while the old one still works.
 */
const REFRESH_SKEW_MS = 60_000;

/**
 * How long a session credential from a file is trusted.
 *
 * The file carries no expiry for these, but they are short-lived by construction:
 * the tools that write them rotate them. Trusting them indefinitely would serve
 * a key that was replaced hours ago, and the only symptom would be an
 * authentication failure with a correct-looking key.
 */
const FILE_SESSION_TTL_MS = 5 * 60_000;

/** How long the metadata endpoints get before the attempt is abandoned. */
const METADATA_TIMEOUT_MS = 1_000;

/**
 * Resolve a credential, or say why none could be found.
 *
 * The error names every source that was tried, because the failure a user can act
 * on is "there is nothing here" and the failure they cannot is "something was
 * missing" with no indication of what.
 */
export async function resolveCredentials(options: ResolveOptions = {}): Promise<Credentials> {
  const env = options.env ?? process.env;
  const profileName = resolveProfileName(options.profile, env);

  const inEnvironment = fromEnv(env);
  if (inEnvironment) return inEnvironment;

  const inWebIdentity = await fromWebIdentityFile(env, options);
  if (inWebIdentity) return inWebIdentity;

  const inProfile = await fromProfileFile(profileName, options, env);
  if (inProfile) return inProfile;

  const inContainer = await fromContainer(env, options);
  if (inContainer) return inContainer;

  const inMetadata = await fromInstanceMetadata(env, options);
  if (inMetadata) return inMetadata;

  throw new CredentialsError(
    `No credentials found. Checked the environment, an assumed web identity, the '${profileName}' profile, ` +
      `container credentials, and instance metadata.`,
    "chain",
  );
}

/** Credentials written directly into the environment. */
function fromEnv(env: Readonly<Record<string, string | undefined>>): Credentials | undefined {
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  const sessionToken = env.AWS_SESSION_TOKEN;
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

/**
 * Credentials from a role assumed with a token file.
 *
 * What a workload gets when it is running under a Kubernetes service account or
 * a similar federated identity, and where the environment carries the token's
 * location and the role rather than the keys.
 */
async function fromWebIdentityFile(
  env: Readonly<Record<string, string | undefined>>,
  options: ResolveOptions,
): Promise<Credentials | undefined> {
  const tokenFile = env.AWS_WEB_IDENTITY_TOKEN_FILE;
  const roleArn = env.AWS_ROLE_ARN;
  if (!tokenFile || !roleArn) return undefined;
  const token = await readFile(tokenFile, "utf8").catch(() => undefined);
  if (!token) {
    throw new CredentialsError(`the token file at ${tokenFile} could not be read`, "web identity");
  }
  return assumeRoleWithWebIdentity(
    { roleArn, token: token.trim(), ...(env.AWS_ROLE_SESSION_NAME ? { sessionName: env.AWS_ROLE_SESSION_NAME } : {}) },
    resolveRegion(options.region, undefined, env),
    options,
  );
}

/**
 * Credentials from the profile files.
 *
 * The shape a profile takes decides what happens next, and the branches are
 * mutually exclusive rather than layered: a profile that names a role is not also
 * a profile with keys, and reading it as one would sign with the wrong identity.
 */
async function fromProfileFile(
  profileName: string,
  options: ResolveOptions,
  env: Readonly<Record<string, string | undefined>>,
  seen: ReadonlySet<string> = new Set(),
): Promise<Credentials | undefined> {
  if (seen.has(profileName)) {
    throw new CredentialsError(`the profile '${profileName}' refers back to itself`, "profile");
  }
  const paths = profileFilePaths(env);
  const credentials = await readProfileFile(paths.credentials);
  const config = shouldReadConfig(options.profile, env) ? await readProfileFile(paths.config) : undefined;
  const profile = mergedProfile(profileName, credentials, config);
  if (!profile) return undefined;

  const region = resolveRegion(options.region, profile, env);

  // A role to assume: the keys come from somewhere else and are exchanged.
  if (profile.role_arn) {
    if (profile.web_identity_token_file) {
      const token = await readFile(expandHome(profile.web_identity_token_file, env), "utf8").catch(() => undefined);
      if (!token) {
        throw new CredentialsError("the profile's web identity token file could not be read", "profile");
      }
      return assumeRoleWithWebIdentity(
        {
          roleArn: profile.role_arn,
          token: token.trim(),
          ...(profile.role_session_name ? { sessionName: profile.role_session_name } : {}),
        },
        region,
        options,
      );
    }
    const source = await resolveRoleSource(profile, profileName, options, env, seen);
    return assumeRole({ ...profile, region }, source, options);
  }

  // A command that prints credentials, which is how a vault-backed setup works.
  if (profile.credential_process) return fromCredentialProcess(profile.credential_process, options);

  // Single sign-on, where a cached token is exchanged for a role's keys.
  if (profile.sso_session || (profile.sso_start_url && profile.sso_account_id && profile.sso_role_name)) {
    return fromSso(profile, profileName, config, env, options);
  }

  const accessKeyId = profile.aws_access_key_id;
  const secretAccessKey = profile.aws_secret_access_key;
  if (!accessKeyId || !secretAccessKey) return undefined;
  const sessionToken = profile.aws_session_token;
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
    // A key from a role without a stated expiry is still short-lived; the tools
    // that write these rotate them, so it is trusted for a bounded time.
    ...(sessionToken ? { expiresAt: Date.now() + FILE_SESSION_TTL_MS } : {}),
  };
}

/** The base credential a role in a profile is assumed with. */
async function resolveRoleSource(
  profile: Readonly<Record<string, string>>,
  profileName: string,
  options: ResolveOptions,
  env: Readonly<Record<string, string | undefined>>,
  seen: ReadonlySet<string>,
): Promise<Credentials> {
  const source = profile.credential_source;
  if (source) {
    if (source === "Environment") {
      const fromEnvironment = fromEnv(env);
      if (fromEnvironment) return fromEnvironment;
      throw new CredentialsError("the profile names the environment as its source, and it is empty", "profile");
    }
    if (source === "Ec2InstanceMetadata") {
      const creds = await fromInstanceMetadata(env, options);
      if (creds) return creds;
      throw new CredentialsError("the profile names instance metadata as its source, and it did not answer", "profile");
    }
    if (source === "EcsContainer") {
      const creds = await fromContainer(env, options);
      if (creds) return creds;
      throw new CredentialsError("the profile names container credentials as its source, and they did not answer", "profile");
    }
    throw new CredentialsError(`'${source}' is not a credential source this build knows`, "profile");
  }
  if (profile.source_profile) {
    const next = new Set(seen);
    next.add(profileName);
    const base = await fromProfileFile(profile.source_profile, options, env, next);
    if (base) return base;
    throw new CredentialsError(
      `the profile '${profileName}' is assumed from '${profile.source_profile}', which has no credentials`,
      "profile",
    );
  }
  throw new CredentialsError(
    `the profile '${profileName}' names a role but no way to assume it: add 'source_profile' or 'credential_source'`,
    "profile",
  );
}

/** Read one of the profile files, treating absence as an empty file. */
async function readProfileFile(path: string): Promise<ProfileFile> {
  const text = await readFile(path, "utf8").catch(() => undefined);
  return text === undefined ? {} : parseProfileFile(text);
}

/** A path in a profile, with a leading `~` resolved. */
function expandHome(path: string, env: Readonly<Record<string, string | undefined>>): string {
  return path.startsWith("~") ? `${homeDirectory(env)}${path.slice(1)}` : path;
}

/**
 * Credentials from a command the profile names.
 *
 * The command prints a JSON object on success. Its exit status and its shape are
 * both checked: a command that failed and printed an error would otherwise be
 * read as an object with missing fields, and the resulting error would blame the
 * profile rather than the command.
 */
async function fromCredentialProcess(command: string, options: ResolveOptions): Promise<Credentials> {
  let stdout: string;
  try {
    const result = await execFileAsync(shellBinary(), shellArguments(command), {
      signal: options.signal,
    });
    stdout = result.stdout;
  } catch (error) {
    throw new CredentialsError(
      `the credential process failed: ${error instanceof Error ? error.message : String(error)}`,
      "credential_process",
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new CredentialsError("the credential process did not print JSON", "credential_process");
  }
  const accessKeyId = parsed.AccessKeyId;
  const secretAccessKey = parsed.SecretAccessKey;
  if (typeof accessKeyId !== "string" || typeof secretAccessKey !== "string") {
    throw new CredentialsError("the credential process printed no usable key pair", "credential_process");
  }
  const sessionToken = typeof parsed.SessionToken === "string" ? parsed.SessionToken : undefined;
  const expiration = typeof parsed.Expiration === "string" ? Date.parse(parsed.Expiration) : Number.NaN;
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
    // No stated expiry means it is re-read next time rather than cached.
    expiresAt: Number.isFinite(expiration) ? expiration : Date.now(),
  };
}

/** The shell a command string is run through. */
function shellBinary(): string {
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}

/** The arguments that run a command string through that shell. */
function shellArguments(command: string): string[] {
  return process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];
}

/**
 * Credentials from the single sign-on cache.
 *
 * A token obtained by signing in is exchanged for the role's keys. The cached
 * token is refreshed when it is near expiry and the cache carries what a refresh
 * needs; otherwise it is used as it is and the exchange is what fails, which is
 * the clearer error.
 */
async function fromSso(
  profile: Readonly<Record<string, string>>,
  profileName: string,
  config: ProfileFile | undefined,
  env: Readonly<Record<string, string | undefined>>,
  options: ResolveOptions,
): Promise<Credentials | undefined> {
  const sessionName = profile.sso_session;
  const session = sessionName ? config?.[`sso-session:${sessionName}`] : undefined;
  const startUrl = session?.sso_start_url ?? profile.sso_start_url;
  const region = session?.sso_region ?? profile.sso_region ?? resolveRegion(options.region, profile, env);
  const accountId = profile.sso_account_id;
  const roleName = profile.sso_role_name;
  if (!startUrl || !accountId || !roleName) {
    throw new CredentialsError(
      `the profile '${profileName}' uses single sign-on but does not name a start URL, account and role`,
      "sso",
    );
  }

  const token = await readSsoToken(sessionName ?? startUrl, startUrl, region, env, options);
  if (!token) {
    throw new CredentialsError("no cached single sign-on token; sign in first", "sso");
  }

  const url =
    `https://portal.sso.${region}.amazonaws.com/federation/credentials` +
    `?account_id=${encodeURIComponent(accountId)}&role_name=${encodeURIComponent(roleName)}`;
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { "x-amz-sso_bearer_token": token },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    throw new CredentialsError(`the single sign-on role request answered ${response.status}`, "sso");
  }
  const body = (await response.json()) as {
    roleCredentials?: { accessKeyId?: string; secretAccessKey?: string; sessionToken?: string; expiration?: number };
  };
  const role = body.roleCredentials;
  if (!role?.accessKeyId || !role.secretAccessKey || !role.sessionToken) {
    throw new CredentialsError("the single sign-on role request returned no credentials", "sso");
  }
  return {
    accessKeyId: role.accessKeyId,
    secretAccessKey: role.secretAccessKey,
    sessionToken: role.sessionToken,
    ...(typeof role.expiration === "number" ? { expiresAt: role.expiration } : {}),
  };
}

/** The cached sign-on token for a session, refreshed when it is about to lapse. */
async function readSsoToken(
  cacheKey: string,
  startUrl: string,
  region: string,
  env: Readonly<Record<string, string | undefined>>,
  options: ResolveOptions,
): Promise<string | undefined> {
  const directory = `${homeDirectory(env)}/.aws/sso/cache`;
  const cached = await readSsoCache(directory, cacheKey, startUrl);
  if (!cached?.accessToken) return undefined;
  const expiresAt = cached.expiresAt ? Date.parse(cached.expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt - REFRESH_SKEW_MS > Date.now()) return cached.accessToken;
  if (!cached.refreshToken || !cached.clientId || !cached.clientSecret) return cached.accessToken;

  const response = await (options.fetchImpl ?? fetch)(`https://oidc.${region}.amazonaws.com/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: cached.clientId,
      clientSecret: cached.clientSecret,
      grantType: "refresh_token",
      refreshToken: cached.refreshToken,
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) return cached.accessToken;
  const refreshed = (await response.json()) as { accessToken?: string };
  return refreshed.accessToken ?? cached.accessToken;
}

/** The cache entry for a session, found by its file name and then by its contents. */
async function readSsoCache(
  directory: string,
  cacheKey: string,
  startUrl: string,
): Promise<
  | { accessToken?: string; expiresAt?: string; refreshToken?: string; clientId?: string; clientSecret?: string; startUrl?: string }
  | undefined
> {
  type Entry = {
    accessToken?: string;
    expiresAt?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    startUrl?: string;
  };
  const named = `${directory}/${createHash("sha1").update(cacheKey).digest("hex")}.json`;
  const direct = await readJson<Entry>(named);
  if (direct) return direct;
  // The file is named after a hash the specifications do not fix, so a cache
  // written by another tool is found by its contents instead.
  const entries = await readdir(directory).catch(() => [] as string[]);
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const parsed = await readJson<Entry>(`${directory}/${entry}`);
    if (parsed && (parsed.startUrl === undefined || parsed.startUrl === startUrl)) return parsed;
  }
  return undefined;
}

async function readJson<T>(path: string): Promise<T | undefined> {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/**
 * Credentials from a local endpoint a container runtime provides.
 *
 * The path or the whole URL may be given. Only a local address is accepted for
 * the whole-URL form: the endpoint hands out credentials, so following it to an
 * arbitrary host would be a way to have them sent somewhere else.
 */
async function fromContainer(
  env: Readonly<Record<string, string | undefined>>,
  options: ResolveOptions,
): Promise<Credentials | undefined> {
  const relative = env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const full = env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  let url: string | undefined;
  if (relative && relative.startsWith("/") && !relative.startsWith("//")) {
    url = `http://169.254.170.2${relative}`;
  } else if (full) {
    let parsed: URL;
    try {
      parsed = new URL(full);
    } catch {
      throw new CredentialsError(`AWS_CONTAINER_CREDENTIALS_FULL_URI is not a URL`, "container");
    }
    const host = parsed.hostname;
    const local =
      parsed.protocol === "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "169.254.170.2";
    if (!local) {
      throw new CredentialsError(
        `AWS_CONTAINER_CREDENTIALS_FULL_URI points at ${host}, which is not a local address`,
        "container",
      );
    }
    url = full;
  }
  if (!url) return undefined;

  const headers: Record<string, string> = {};
  const token = env.AWS_CONTAINER_AUTHORIZATION_TOKEN;
  const tokenFile = env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE;
  if (token) headers.authorization = token;
  else if (tokenFile) {
    const fromFile = await readFile(tokenFile, "utf8").catch(() => undefined);
    if (fromFile) headers.authorization = fromFile.trim();
  }

  return requestCredentials({
    url,
    headers,
    options,
    source: "container",
    fields: { access: "AccessKeyId", secret: "SecretAccessKey", token: "Token", expires: "Expiration" },
  });
}

/**
 * Credentials from the instance metadata service.
 *
 * Two requests: the first exchanges a token that the second has to present, which
 * is what stops a process on the host from reading the instance's credentials by
 * knowing only the address.
 */
async function fromInstanceMetadata(
  env: Readonly<Record<string, string | undefined>>,
  options: ResolveOptions,
): Promise<Credentials | undefined> {
  if (env.AWS_EC2_METADATA_DISABLED === "true") return undefined;
  const base =
    env.AWS_EC2_METADATA_SERVICE_ENDPOINT ??
    (env.AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE === "ipv6" ? "http://[fd00:ec2::254]" : "http://169.254.169.254");

  const token = await (options.fetchImpl ?? fetch)(`${base}/latest/api/token`, {
    method: "PUT",
    headers: { "x-aws-ec2-metadata-token-ttl-seconds": "21600" },
    signal: metadataSignal(options.signal),
  })
    .then((response) => (response.ok ? response.text() : undefined))
    .catch(() => undefined);
  if (!token) return undefined;

  const role = await (options.fetchImpl ?? fetch)(`${base}/latest/meta-data/iam/security-credentials/`, {
    headers: { "x-aws-ec2-metadata-token": token },
    signal: metadataSignal(options.signal),
  })
    .then((response) => (response.ok ? response.text() : undefined))
    .catch(() => undefined);
  if (!role?.trim()) return undefined;

  return requestCredentials({
    url: `${base}/latest/meta-data/iam/security-credentials/${encodeURIComponent(role.trim().split("\n")[0]!.trim())}`,
    headers: { "x-aws-ec2-metadata-token": token },
    options,
    source: "instance metadata",
    fields: { access: "AccessKeyId", secret: "SecretAccessKey", token: "Token", expires: "Expiration" },
  });
}

/**
 * A deadline for a metadata request.
 *
 * These endpoints are absent on a machine that is not in the cloud, and an absent
 * endpoint is usually a dropped packet rather than a refusal — so without a bound
 * the chain would stall on every run of every user who does not need it.
 */
function metadataSignal(existing: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(METADATA_TIMEOUT_MS);
  return existing ? AbortSignal.any([existing, timeout]) : timeout;
}

/**
 * Read the credentials a JSON endpoint returns.
 *
 * Several endpoints answer with the same document under the same field names, so
 * the parsing is shared and the field names are parameters. A response without a
 * usable key pair is an error rather than a miss: reaching an endpoint and being
 * refused means the source was configured and is broken, and reporting that as
 * "not found" would send the user looking at the wrong thing.
 */
async function requestCredentials(input: {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly options: ResolveOptions;
  readonly source: string;
  readonly fields: { access: string; secret: string; token: string; expires: string };
}): Promise<Credentials | undefined> {
  const response = await (input.options.fetchImpl ?? fetch)(input.url, {
    headers: { ...input.headers },
    signal: metadataSignal(input.options.signal),
  }).catch(() => undefined);
  if (!response?.ok) return undefined;

  const body = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (!body) return undefined;
  const accessKeyId = body[input.fields.access];
  const secretAccessKey = body[input.fields.secret];
  const sessionToken = body[input.fields.token];
  if (typeof accessKeyId !== "string" || typeof secretAccessKey !== "string") {
    throw new CredentialsError(`the ${input.source} endpoint returned no usable key pair`, input.source);
  }
  const expiration = typeof body[input.fields.expires] === "string" ? Date.parse(body[input.fields.expires] as string) : Number.NaN;
  return {
    accessKeyId,
    secretAccessKey,
    ...(typeof sessionToken === "string" ? { sessionToken } : {}),
    ...(Number.isFinite(expiration) ? { expiresAt: expiration } : {}),
  };
}

/**
 * Exchange base credentials for a role's.
 *
 * The request is signed with the base credential, which is the part that makes
 * this more than a form post: the exchange itself is authenticated.
 */
async function assumeRole(
  profile: Readonly<Record<string, string>>,
  base: Credentials,
  options: ResolveOptions,
): Promise<Credentials> {
  const region = profile.region ?? "us-east-1";
  const body = new URLSearchParams({
    Action: "AssumeRole",
    Version: "2011-06-15",
    RoleArn: profile.role_arn!,
    RoleSessionName: profile.role_session_name ?? "cheers-session",
    ...(profile.duration_seconds ? { DurationSeconds: profile.duration_seconds } : {}),
    ...(profile.external_id ? { ExternalId: profile.external_id } : {}),
  });
  return callSts(stsEndpoint(region), body.toString(), base, region, options, "assume role");
}

/** Exchange a federated token for a role's credentials, which needs no signing. */
async function assumeRoleWithWebIdentity(
  input: { readonly roleArn: string; readonly token: string; readonly sessionName?: string },
  region: string,
  options: ResolveOptions,
): Promise<Credentials> {
  const body = new URLSearchParams({
    Action: "AssumeRoleWithWebIdentity",
    Version: "2011-06-15",
    RoleArn: input.roleArn,
    RoleSessionName: input.sessionName ?? "cheers-session",
    WebIdentityToken: input.token,
  });
  const response = await (options.fetchImpl ?? fetch)(stsEndpoint(region), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return readStsResponse(await response.text(), response.ok, "web identity");
}

/** Where the token service for a region lives. */
function stsEndpoint(region: string): string {
  // The partitioned regions end differently, and a host built from the wrong
  // suffix does not resolve at all.
  const suffix = region.startsWith("cn-") ? "amazonaws.com.cn" : "amazonaws.com";
  return `https://sts.${region}.${suffix}/`;
}

/** The signed request that performs the exchange. */
async function callSts(
  endpoint: string,
  body: string,
  base: Credentials,
  region: string,
  options: ResolveOptions,
  source: string,
): Promise<Credentials> {
  const host = new URL(endpoint).hostname;
  const signed = await signAwsRequest({
    method: "POST",
    host,
    path: "/",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    region,
    service: "sts",
    credentials: base,
  });
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: { ...signed, "content-type": "application/x-www-form-urlencoded" },
    body,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return readStsResponse(await response.text(), response.ok, source);
}

/**
 * The credentials out of a token service response.
 *
 * The response is XML. Reading three fields out of it with a pattern rather than
 * parsing the document is deliberate: the document is one level deep and fixed,
 * and a general parser would be a dependency for three field lookups.
 */
function readStsResponse(xml: string, ok: boolean, source: string): Credentials {
  if (!ok) {
    const message = tagValue(xml, "Message") ?? xml.slice(0, 200);
    throw new CredentialsError(`the ${source} request failed: ${message}`, source);
  }
  const accessKeyId = tagValue(xml, "AccessKeyId");
  const secretAccessKey = tagValue(xml, "SecretAccessKey");
  const sessionToken = tagValue(xml, "SessionToken");
  if (!accessKeyId || !secretAccessKey || !sessionToken) {
    throw new CredentialsError(`the ${source} response carried no credentials`, source);
  }
  const expiration = Date.parse(tagValue(xml, "Expiration") ?? "");
  if (!Number.isFinite(expiration)) {
    throw new CredentialsError(`the ${source} response carried no usable expiry`, source);
  }
  return { accessKeyId, secretAccessKey, sessionToken, expiresAt: expiration };
}

/** One element's text, with the entities the format escapes. */
function tagValue(xml: string, tag: string): string | undefined {
  const value = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1];
  if (!value) return undefined;
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}
