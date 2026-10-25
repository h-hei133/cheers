import { signAwsRequest } from "./signature.js";
import { CredentialsError, type Credentials, type ResolveOptions } from "./contract.js";

/**
 * Exchange base credentials for a role's.
 *
 * The request is signed with the base credential, which is the part that makes
 * this more than a form post: the exchange itself is authenticated.
 */
export async function assumeRole(
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
export async function assumeRoleWithWebIdentity(
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
