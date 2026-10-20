import fs from "node:fs";
import path from "node:path";

const SAFE_ENV = new Set([
  "COLORTERM",
  "COMSPEC",
  "DYLD_FALLBACK_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH",
  "LANG",
  "LD_LIBRARY_PATH",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "SHELL",
  "SYSTEMROOT",
  "TERM",
  "TZ",
  "WINDIR",
]);

function safeEnvironmentKey(key) {
  const upper = key.toUpperCase();
  return SAFE_ENV.has(upper) || upper.startsWith("LC_");
}

/**
 * Build a child environment for the packaged PTY probe.
 *
 * The probe must not inherit a developer's provider credentials, alternate
 * Cheers home, XDG state, or Git configuration. PATH and ordinary platform
 * variables remain available so the real executable can start.
 */
export function createQaPtyEnvironment(home, project, source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && safeEnvironmentKey(key)) env[key] = value;
  }
  const temporary = path.join(home, "tmp");
  const testRoot = path.join(home, "test-root");
  for (const directory of [
    temporary,
    testRoot,
    path.join(home, ".config"),
    path.join(home, ".cache"),
    path.join(home, ".local", "share"),
    path.join(home, ".local", "state"),
  ]) fs.mkdirSync(directory, { recursive: true });

  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    CHEERS_HOME_OVERRIDE: home,
    CHEERS_TEST_ROOT: testRoot,
    CHEERS_PROVIDER_MODE: "synthetic",
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    GIT_CEILING_DIRECTORIES: project,
    GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    NO_COLOR: "1",
    TERM: "xterm-256color",
  };
}
