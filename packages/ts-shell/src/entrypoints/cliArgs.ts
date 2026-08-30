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
  "--planning-mutation-proposal",
  "--planning-mutation-verify-command",
  "--host-command",
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
  "/rewind",
  "/revert",
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
    "planningMutationConfirm",
    rawArgs.includes("--planning-mutation-confirm"),
  );
  assignOption(
    options,
    "planningMutationControlledWorkspace",
    rawArgs.includes("--planning-mutation-controlled-workspace"),
  );
  assignOption(
    options,
    "planningMutationSelectedWorkspace",
    rawArgs.includes("--planning-mutation-selected-workspace"),
  );
  assignOption(
    options,
    "planningMutationLiveProviderProposal",
    rawArgs.includes("--planning-mutation-live-provider-proposal"),
  );
  const planningMutationProposal = parsePlanningMutationProposalPath(rawArgs);
  if (planningMutationProposal.ok === false) {
    return { ok: false, error: planningMutationProposal.error };
  }
  assignOption(
    options,
    "planningMutationProposalPath",
    planningMutationProposal.value,
  );
  const planningMutationVerifyCommand = parsePlanningMutationVerifyCommand(rawArgs);
  if (planningMutationVerifyCommand.ok === false) {
    return { ok: false, error: planningMutationVerifyCommand.error };
  }
  assignOption(
    options,
    "planningMutationVerifyCommand",
    planningMutationVerifyCommand.value,
  );
  const hostCommand = parseHostCommand(rawArgs);
  if (hostCommand.ok === false) {
    return { ok: false, error: hostCommand.error };
  }
  assignOption(options, "hostCommand", hostCommand.value);
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

function parseHostCommand(
  args: readonly string[],
):
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly error: CliArgParseError } {
  const idx = args.indexOf("--host-command");
  if (idx === -1) {
    return { ok: true, value: undefined };
  }
  const value = args[idx + 1];
  if (!value) {
    return parseError(
      "Missing value for --host-command. Provide a structured host command JSON object.",
    );
  }
  return { ok: true, value };
}

function parsePlanningMutationVerifyCommand(
  args: readonly string[],
):
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly error: CliArgParseError } {
  const idx = args.indexOf("--planning-mutation-verify-command");
  if (idx === -1) {
    return { ok: true, value: undefined };
  }
  const value = args[idx + 1];
  if (!value) {
    return parseError(
      "Missing value for --planning-mutation-verify-command. Provide an allowlisted verification command.",
    );
  }
  return { ok: true, value };
}

function parsePlanningMutationProposalPath(
  args: readonly string[],
):
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly error: CliArgParseError } {
  const idx = args.indexOf("--planning-mutation-proposal");
  if (idx === -1) {
    return { ok: true, value: undefined };
  }
  const value = args[idx + 1];
  if (!value) {
    return parseError(
      "Missing value for --planning-mutation-proposal. Provide a JSON file with exact old/new proposal targets.",
    );
  }
  return { ok: true, value };
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
