/**
 * The two files an AWS account keeps its settings in.
 *
 * Credentials and settings live in separate files with different section naming,
 * both in a format that looks like INI but is not quite: a section may have a
 * prefix, comments start two ways, and a value may contain `=`. Parsing it with a
 * general INI library would need as much configuration as writing it, and this
 * way the exact keys are visible here rather than in a dependency's behaviour.
 */

/** One file, by section name and then by key. */
export type ProfileFile = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Parse one of these files.
 *
 * Section headers are normalised here so callers can look a profile up by name
 * alone: the credentials file writes `[name]` and the config file writes
 * `[profile name]`, and the difference is a property of which file it is rather
 * than of the profile.
 *
 * `sso-session` sections are kept under a prefixed name because they share the
 * file with profiles and would otherwise be mistaken for one.
 */
export function parseProfileFile(text: string): ProfileFile {
  const sections: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Both comment markers are honoured; the format has never settled on one.
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      current = sections[normalizeSection(line.slice(1, -1).trim())] ??= {};
      continue;
    }
    if (!current) continue;

    // Split on the first separator only: a value may legitimately contain one,
    // and splitting on the last would truncate a key that contains none.
    const equals = line.indexOf("=");
    if (equals === -1) continue;
    current[line.slice(0, equals).trim()] = line.slice(equals + 1).trim();
  }
  return sections;
}

/** The name a section is filed under, with the config file's prefix removed. */
function normalizeSection(name: string): string {
  if (name.startsWith("sso-session ")) return `sso-session:${name.slice("sso-session ".length).trim()}`;
  if (name.startsWith("profile ")) return name.slice("profile ".length).trim();
  return name;
}

/** Where the two files are, honouring a configured path when one is given. */
export function profileFilePaths(env: Readonly<Record<string, string | undefined>>): {
  readonly credentials: string;
  readonly config: string;
} {
  return {
    credentials: env.AWS_SHARED_CREDENTIALS_FILE ?? `${homeDirectory(env)}/.aws/credentials`,
    config: env.AWS_CONFIG_FILE ?? `${homeDirectory(env)}/.aws/config`,
  };
}

/** The user's home directory, from the environment. */
export function homeDirectory(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.HOME || env.USERPROFILE || "";
}

/**
 * The profile to read.
 *
 * An explicit choice wins, then the environment's, then the file's own default.
 * Only one environment variable is consulted for this: the other spelling of it
 * is not something the tooling that sets these variables uses, and accepting it
 * would mean two variables that do different things under one name.
 */
export function resolveProfileName(chosen: string | undefined, env: Readonly<Record<string, string | undefined>>): string {
  return chosen ?? env.AWS_PROFILE ?? "default";
}

/**
 * The region to sign for.
 *
 * The order matters: an explicit choice, then the environment, then what the
 * profile says, and finally a default. The default is a real region rather than
 * an error because every endpoint host is built from this, and refusing to run
 * without one would be a failure a caller cannot act on if the region is not
 * theirs to set.
 */
export function resolveRegion(
  chosen: string | undefined,
  profile: Readonly<Record<string, string>> | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return chosen ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? profile?.region ?? "us-east-1";
}

/**
 * Whether the config file should be read at all.
 *
 * The credentials file is always read; the config file only when something asked
 * for it. That is the historical behaviour and it is load-bearing: a config file
 * carries settings the older tooling ignored, and reading it unconditionally
 * would change what an account resolves to without anyone asking.
 */
export function shouldReadConfig(
  chosen: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (chosen !== undefined || env.AWS_PROFILE !== undefined) return true;
  return env.AWS_SDK_LOAD_CONFIG === "1" || env.AWS_SDK_LOAD_CONFIG === "true";
}

/**
 * One profile's settings, with the config file's copy merged over the credentials
 * file's.
 *
 * Merged rather than chosen between because the two files hold different keys —
 * keys go in one, roles and regions in the other — and a profile that appears in
 * both is the normal case, not a conflict.
 */
export function mergedProfile(
  name: string,
  credentials: ProfileFile,
  config: ProfileFile | undefined,
): Readonly<Record<string, string>> | undefined {
  const fromCredentials = credentials[name];
  const fromConfig = config?.[name];
  if (!fromCredentials && !fromConfig) return undefined;
  return { ...(fromCredentials ?? {}), ...(fromConfig ?? {}) };
}
