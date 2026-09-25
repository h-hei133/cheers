import path from "node:path";
import type { RuntimeProvider } from "../config/runtimeConfig.js";
import type {
  CliArgParseError,
  CliArgParseResult,
  CliArgs,
  CliOptions,
  NonInteractiveApprovalMode,
  ParseCliArgsOptions,
} from "../cli/options/cliOptions.js";

export type {
  CliArgs,
  CliArgParseError,
  CliArgParseResult,
  CliOptions,
  NonInteractiveApprovalMode,
  ParseCliArgsOptions,
} from "../cli/options/cliOptions.js";

const VALID_PROVIDERS: readonly RuntimeProvider[] = [
  "openai",
  "anthropic",
  "openai-compatible",
  "google",
  "antigravity",
  "claudecode",
];

const VALUE_FLAGS = new Set([
  "--project",
  "--attach",
  "--session-id",
  "--provider",
  "--api-key",
  "--replay-file",
  "--non-interactive-approval",
  // Takes a value, so the prompt scan must step over it: without this the tool
  // list is also read as part of the prompt.
  "--tools",
  // Same reason: a named skill path is a value, and the prompt scan would
  // otherwise read it as the prompt — a path is exactly what the positional
  // project fallback treats as a project, too.
  "--skill",
  // Same again: these take a path and a theme name, and a path among the
  // positionals would be read as the project.
  "--theme",
  "--use-theme",
]);

const RESERVED_SHELL_SLASH_COMMANDS = new Set([
  "/continue",
  "/c",
  "/restore",
  "/sessions",
  "/mcp",
  "/resume",
  "/workspace",
  "/where",
  "/project",
  "/cd",
  "/pwd",
  "/cancel",
  "/build",
  "/mode-build",
  "/plan",
  "/mode-plan",
  "/mode",
  "/agent-mode",
  "/view",
  "/diagnose",
  "/repo",
  "/changes",
  "/doctor",
  "/workflow-status",
  "/status",
  "/compact",
  "/handoff",
  "/memory",
  "/warmup",
  "/browser",
  "/sidebar",
  "/connect",
  "/providers",
  "/model",
  "/models",
  "/permissions",
  "/approval-policy",
  "/help",
  "/",
  "/exit",
  "/quit",
  "/q",
  "/clear",
  "/reset",
  "/cls",
  "/review",
  "/audit",
  "/check",
  "/init",
  "/setup",
  "/cost",
  "/tokens",
  "/stats",
  "/undo",
  "/back",
  "/export",
  "/save",
  "/copy",
  "/cp",
  "/goal",
  "/objective",
  "/target",
  "/loop",
  "/ralph",
  "/autoloop",
  "/todo",
  "/tasks",
  "/checklist",
  "/fast",
  "/turbo",
  "/speed",
  "/context",
  "/ctx",
  "/tokens-map",
  "/btw",
  "/side",
  "/ask",
  "/marketplace",
  "/marketplaces",
  "/market",
  "/plugin",
  "/plugins",
  "/mem",
  "/recall",
  "/retain",
  "/workflow",
  "/wf",
  "/pipeline",
  "/dag",
  "/deep-research",
  "/research",
  "/deep",
  "/brainstorm",
  "/explore",
  "/brainstorming",
  "/shell",
  "/sh",
  "/platform",
]);
export function parseCliArgs(
  rawArgs: readonly string[],
  parseOptions: ParseCliArgsOptions,
): CliArgParseResult {
  if (isVersionRequested(rawArgs)) {
    return {
      ok: true,
      args: {
        rawArgs,
        options: {},
        versionRequested: true,
        doctorRequested: false,
      },
    };
  }

  const options: CliOptions = {};

  // Positional tokens are what is left after flags and the values those flags
  // consume — `VALUE_FLAGS` decides which ones take a value. A value is not a
  // positional: `--skill ./x.md` would otherwise read `./x.md` as a project
  // path, because the fallback candidate is any token that names a path.
  const positionalArgs: string[] = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (VALUE_FLAGS.has(rawArgs[index]!)) {
      index += 1;
      continue;
    }
    if (rawArgs[index]!.startsWith("--")) continue;
    positionalArgs.push(rawArgs[index]!);
  }
  const projectIdx = getProjectFlagIndex(rawArgs);
  if (projectIdx !== -1) {
    if (!rawArgs[projectIdx + 1]) {
      return parseError(
        `Missing value for ${rawArgs[projectIdx]}. Example: --project D:\\path\\to\\your-project`,
      );
    }
    assignOption(options, "projectPath", rawArgs[projectIdx + 1]);
  } else {
    const positionalProject = positionalArgs.find(
      isPositionalProjectFallbackCandidate,
    );
    if (positionalProject) {
      assignOption(options, "projectPath", positionalProject);
    }
  }

  if (rawArgs.includes("--doctor")) {
    return {
      ok: true,
      args: {
        rawArgs,
        options,
        versionRequested: false,
        doctorRequested: true,
      },
    };
  }

  const sessionIdIdx = rawArgs.indexOf("--session-id");
  if (sessionIdIdx !== -1 && rawArgs[sessionIdIdx + 1]) {
    assignOption(options, "sessionId", rawArgs[sessionIdIdx + 1]);
  }

  const providerIdx = rawArgs.indexOf("--provider");
  if (providerIdx !== -1 && rawArgs[providerIdx + 1]) {
    const provider = rawArgs[providerIdx + 1].trim().toLowerCase();
    if (isRuntimeProvider(provider)) {
      assignOption(options, "provider", provider);
    } else {
      return parseError(
        `Invalid --provider value: ${rawArgs[providerIdx + 1]}. Expected openai, anthropic, openai-compatible, google, antigravity, or claudecode.`,
      );
    }
  }

  const apiKeyIdx = rawArgs.indexOf("--api-key");
  if (apiKeyIdx !== -1 && rawArgs[apiKeyIdx + 1]) {
    assignOption(options, "apiKey", rawArgs[apiKeyIdx + 1]);
  }

  const replayIdx = rawArgs.indexOf("--replay-file");
  if (replayIdx !== -1) {
    const replayPath = rawArgs[replayIdx + 1];
    if (!replayPath) {
      return parseError(
        "Missing value for --replay-file. Example: --replay-file .\\replay.txt",
      );
    }
    assignOption(options, "replayFile", replayPath);
  }

  assignOption(
    options,
    "printMode",
    rawArgs.includes("--print") || rawArgs.includes("-p"),
  );
  assignOption(options, "jsonEvents", rawArgs.includes("--json"));
  assignOption(options, "noContextFiles", rawArgs.includes("--no-context-files"));
  assignOption(options, "noSkills", rawArgs.includes("--no-skills") || rawArgs.includes("-ns"));
  assignOption(options, "offline", rawArgs.includes("--offline"));
  const skillPaths: string[] = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (rawArgs[index] === "--skill") {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) {
        return parseError("Missing value for --skill. Example: --skill ./review.md");
      }
      skillPaths.push(value);
      index += 1;
    }
  }
  if (skillPaths.length > 0) assignOption(options, "skillPaths", skillPaths);
  const themePaths: string[] = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (rawArgs[index] === "--theme") {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) {
        return parseError("Missing value for --theme. Example: --theme ./my-theme.json");
      }
      themePaths.push(value);
      index += 1;
    }
  }
  if (themePaths.length > 0) assignOption(options, "themePaths", themePaths);
  const useThemeIdx = rawArgs.indexOf("--use-theme");
  if (useThemeIdx !== -1) {
    const value = rawArgs[useThemeIdx + 1];
    if (!value || value.startsWith("--")) {
      return parseError("Missing value for --use-theme. Example: --use-theme dark");
    }
    assignOption(options, "useTheme", value);
  }
  const toolsIdx = rawArgs.indexOf("--tools");
  if (toolsIdx !== -1) {
    const value = rawArgs[toolsIdx + 1];
    if (!value || value.startsWith("--")) {
      return parseError(
        "Missing value for --tools. Example: --tools read,grep,glob",
      );
    }
    const named = value.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
    if (named.length === 0) {
      // `--tools ,,` is a typo, not a request for no tools at all. Accepting it
      // would offer the model nothing and read as the agent being broken. The
      // empty allowlist stays expressible in the config file, where writing an
      // empty list is a deliberate act.
      return parseError(
        "No tool names in --tools. Example: --tools read,grep,glob",
      );
    }
    assignOption(options, "allowedTools", named);
  }
  assignOption(
    options,
    "dangerouslyBypassHookTrust",
    rawArgs.includes("--dangerously-bypass-hook-trust"),
  );
  assignOption(
    options,
    "migrateSessionRoot",
    rawArgs.includes("--migrate-session-root"),
  );
  const nonInteractiveApproval = parseNonInteractiveApprovalMode(rawArgs);
  if (nonInteractiveApproval.ok === false) {
    return { ok: false, error: nonInteractiveApproval.error };
  }
  assignOption(
    options,
    "nonInteractiveApproval",
    nonInteractiveApproval.value,
  );
  assignOption(
    options,
    "promptArg",
    derivePromptArgument(rawArgs, options.projectPath, parseOptions.cwd),
  );

  return {
    ok: true,
    args: {
      rawArgs,
      options,
      versionRequested: false,
      doctorRequested: rawArgs.includes("--doctor"),
    },
  };
}



export function isVersionRequested(args: readonly string[]): boolean {
  return (
    args.length === 1 &&
    (args[0] === "--version" || args[0] === "-v" || args[0] === "-V")
  );
}

export function isPrintModeRequested(args: CliArgs): boolean {
  return args.options.printMode === true;
}

export function isStdinModeRequested(input: {
  readonly stdinIsTty: boolean;
  readonly cliArgs: CliArgs;
}): boolean {
  return (
    !input.stdinIsTty &&
    !input.cliArgs.options.printMode &&
    !input.cliArgs.options.replayFile
  );
}

export function isContinueRequested(cliArgs: CliArgs): boolean {
  return cliArgs.options.promptArg?.trim().startsWith("/continue") === true;
}

export function isProviderReadinessRequested(cliArgs: CliArgs): boolean {
  return cliArgs.options.provider !== undefined || cliArgs.options.apiKey !== undefined;
}

export function getApprovalMode(
  cliArgs: CliArgs,
): NonInteractiveApprovalMode | undefined {
  return cliArgs.options.nonInteractiveApproval;
}

export function getWorkspaceSelection(cliArgs: CliArgs): string | undefined {
  return cliArgs.options.projectPath;
}

type MutableCliOptions = {
  -readonly [Key in keyof CliOptions]: CliOptions[Key];
};

function assignOption<Key extends keyof CliOptions>(
  options: CliOptions,
  key: Key,
  value: CliOptions[Key],
): void {
  (options as MutableCliOptions)[key] = value;
}

function getProjectFlagIndex(args: readonly string[]): number {
  const explicitIdx = args.indexOf("--project");
  if (explicitIdx !== -1) {
    return explicitIdx;
  }
  return args.indexOf("--attach");
}

function isPositionalProjectFallbackCandidate(arg: string): boolean {
  return /[\\/]/.test(arg) && !isReservedShellSlashCommand(arg);
}

function isReservedShellSlashCommand(arg: string): boolean {
  return RESERVED_SHELL_SLASH_COMMANDS.has(arg.trim().toLowerCase());
}

function parseNonInteractiveApprovalMode(
  args: readonly string[],
):
  | { readonly ok: true; readonly value: NonInteractiveApprovalMode | undefined }
  | { readonly ok: false; readonly error: CliArgParseError } {
  let raw: string | undefined;
  const idx = args.indexOf("--non-interactive-approval");
  if (idx !== -1) {
    raw = args[idx + 1];
  }
  if (!raw) {
    const inline = args.find((arg) =>
      arg.toLowerCase().startsWith("--non-interactive-approval="),
    );
    if (inline) {
      raw = inline.split("=", 2)[1];
    }
  }
  if (!raw) {
    if (idx === -1) {
      return { ok: true, value: undefined };
    }
    return parseError(
      "Missing value for --non-interactive-approval. Use deny, allow-once, or allow-always.",
    );
  }
  const normalizedRaw = raw.trim().toLowerCase();
  if (
    normalizedRaw === "deny" ||
    normalizedRaw === "allow-once" ||
    normalizedRaw === "allow-always"
  ) {
    return { ok: true, value: normalizedRaw };
  }
  if (normalizedRaw === "n") {
    return { ok: true, value: "deny" };
  }
  if (normalizedRaw === "y") {
    return { ok: true, value: "allow-once" };
  }
  if (normalizedRaw === "a") {
    return { ok: true, value: "allow-always" };
  }
  return parseError(
    `Invalid --non-interactive-approval value: ${normalizedRaw}. Use deny, allow-once, or allow-always.`,
  );
}

function derivePromptArgument(
  args: readonly string[],
  projectPath: string | undefined,
  cwd: string,
): string | undefined {
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (VALUE_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    if (token === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (token.startsWith("-")) {
      continue;
    }
    positional.push(token);
  }

  if (projectPath) {
    const normalizedProject = normalizePathForCompare(projectPath, cwd);
    const projectIdx = positional.findIndex(
      (token) =>
        normalizePathForCompare(token, cwd) === normalizedProject ||
        token === projectPath,
    );
    if (projectIdx >= 0) {
      positional.splice(projectIdx, 1);
    }
  }

  const prompt = positional.join(" ").trim();
  return prompt.length > 0 ? prompt : undefined;
}

function isRuntimeProvider(value: string): value is RuntimeProvider {
  return VALID_PROVIDERS.includes(value as RuntimeProvider);
}

function normalizePathForCompare(value: string, cwd: string): string {
  return path.resolve(cwd, value).toLowerCase();
}

function parseError(message: string): { readonly ok: false; readonly error: CliArgParseError } {
  return {
    ok: false,
    error: {
      message,
      exitCode: 1,
    },
  };
}
