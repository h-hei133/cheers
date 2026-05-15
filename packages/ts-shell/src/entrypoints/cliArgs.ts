import path from "node:path";
import type { RuntimeProvider } from "../config/runtimeConfig.js";

export type NonInteractiveApprovalMode =
  | "deny"
  | "allow-once"
  | "allow-always";

export interface CliOptions {
  readonly sessionId?: string;
  readonly provider?: RuntimeProvider;
  readonly apiKey?: string;
  readonly projectPath?: string;
  readonly replayFile?: string;
  readonly printMode?: boolean;
  readonly promptArg?: string;
  readonly migrateSessionRoot?: boolean;
  readonly nonInteractiveApproval?: NonInteractiveApprovalMode;
  readonly applyPatchRuntimeRoute?: boolean;
  readonly applyPatchWorkspaceWrite?: boolean;
}

export interface CliArgs {
  readonly rawArgs: readonly string[];
  readonly options: CliOptions;
  readonly versionRequested: boolean;
  readonly doctorRequested: boolean;
}

export interface CliArgParseError {
  readonly message: string;
  readonly exitCode: 1;
}

export type CliArgParseResult =
  | { readonly ok: true; readonly args: CliArgs }
  | { readonly ok: false; readonly error: CliArgParseError };

export interface ParseCliArgsOptions {
  readonly cwd: string;
}

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
]);

const RESERVED_SHELL_SLASH_COMMANDS = new Set([
  "/continue",
  "/restore",
  "/sessions",
  "/mcp",
  "/resume",
  "/workspace",
  "/help",
  "/pwd",
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
  const positionalArgs = rawArgs.filter((arg) => !arg.startsWith("--"));
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
    "applyPatchRuntimeRoute",
    rawArgs.includes("--apply-patch-runtime-route"),
  );
  assignOption(
    options,
    "applyPatchWorkspaceWrite",
    rawArgs.includes("--apply-patch-workspace-write"),
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
