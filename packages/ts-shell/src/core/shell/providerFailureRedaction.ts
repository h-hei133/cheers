const REAL_HOME_CONFIG_PATTERN =
  /[A-Za-z]:[\\/]+Test[\\/]+home-sf[\\/]+\.cheers[\\/]+config\.json/gi;

// Every directory a user config may be read from, not just the current one:
// an older directory is still consulted when the current one has no file, so a
// path under one of those names can reach a failure message just as easily.
const USER_DATA_DIRS = "(?:cheers|cheer|private-agents|coding-agents)";

const WINDOWS_CHEERS_CONFIG_PATTERN = new RegExp(
  `[A-Za-z]:[\\\\/]+[^\\s"'\\\`<>]+[\\\\/]+\\.${USER_DATA_DIRS}[\\\\/]+config\\.json`,
  "gi",
);

const POSIX_CHEERS_CONFIG_PATTERN = new RegExp(
  `/[^\\s"'\\\`<>]+/\\.${USER_DATA_DIRS}/config\\.json`,
  "gi",
);

const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const AUTHORIZATION_BEARER_PATTERN =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE_SECRET_PATTERN =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi;
const OPENAI_STYLE_KEY_PATTERN =
  /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g;

const SECRET_QUERY_PARAM_PATTERN =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi;

export function redactProviderFailureDetail(input: string): string {
  return input
    .replace(
      AUTHORIZATION_BEARER_PATTERN,
      (_match, prefix: string, quote: string) =>
        `${prefix}${quote}Bearer [REDACTED]`,
    )
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]")
    .replace(
      KEY_VALUE_SECRET_PATTERN,
      (_match, key: string, separator: string, quote: string) =>
        `${key}${separator}${quote}[REDACTED]`,
    )
    .replace(OPENAI_STYLE_KEY_PATTERN, "[REDACTED_API_KEY]")
    .replace(SECRET_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(REAL_HOME_CONFIG_PATTERN, "[REAL_PROVIDER_CONFIG_PATH]")
    .replace(WINDOWS_CHEERS_CONFIG_PATTERN, "[CHEERS_CONFIG_PATH]")
    .replace(POSIX_CHEERS_CONFIG_PATTERN, "[CHEERS_CONFIG_PATH]");
}
