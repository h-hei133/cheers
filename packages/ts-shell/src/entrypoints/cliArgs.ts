import path from "node:path";
import { profileName } from "../core/paths/profile/name.js";
import { RUNTIME_PROVIDERS, isRuntimeProvider } from "../config/runtimeConfig.js";
import { scanCliArgs, type CliInvocation } from "../cli/options/argv.js";
import { EXTENSION_FLAG_NAME } from '../extensions/runtime/flag.js';
import { listSlashInvocations, subscribeSlashCommands } from "./slashCommandRegistry.js";
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
export { isHelpRequested, isVersionRequested } from "../cli/options/early.js";

const VALID_THINKING_ARGS = new Set([
  "off",
  "auto",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

let reservedCommandNames: Set<string> | undefined;
let subscriptions: (() => void) | undefined;

function leadingCommandName(arg: string): string | undefined {
  if (!arg.startsWith("/") || arg.startsWith("//")) return undefined;
  const firstSegment = arg.slice(1).split(/[\s\\/]/)[0]?.toLowerCase();
  if (!firstSegment) return undefined;
  subscriptions ??= subscribeSlashCommands(() => {
    reservedCommandNames = undefined;
  });
  reservedCommandNames ??= new Set(listSlashInvocations().map((invocation) => invocation.name));
  return reservedCommandNames.has(firstSegment) ? firstSegment : undefined;
}

function parseError(message: string): { readonly ok: false; readonly error: CliArgParseError } {
  return { ok: false, error: { message, exitCode: 1 } };
}

function parseApprovalValue(raw: string): NonInteractiveApprovalMode | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "deny" || normalized === "allow-once" || normalized === "allow-always") return normalized;
  if (normalized === "n") return "deny";
  if (normalized === "y") return "allow-once";
  if (normalized === "a") return "allow-always";
  return undefined;
}

type MutableCliOptions = {
  -readonly [Key in keyof CliOptions]: CliOptions[Key];
};

export function parseCliArgs(
  input: readonly string[] | CliInvocation,
  parseOptions: ParseCliArgsOptions,
): CliArgParseResult {
  const invocation = 'rawArgs' in input ? input : scanCliArgs(input);
  const { rawArgs, positionals, tail } = invocation;
  if (invocation.versionRequested) {
    return { ok: true, args: { rawArgs, options: {}, versionRequested: true, doctorRequested: false } };
  }

  const opts: MutableCliOptions = {
    printMode: false,
    jsonEvents: false,
    rpcMode: false,
    noContextFiles: false,
    noSkills: false,
    offline: false,
    dangerouslyBypassHookTrust: false,
    migrateSessionRoot: false,
  };
  let profileSelected = false;
  let doctorRequested = false;
  let explicitProject: string | undefined;
  let attachProject: string | undefined;
  let pendingProviderError: string | undefined;
  const configPaths: string[] = [];
  const skillPaths: string[] = [];
  const themePaths: string[] = [];
  const extensionPaths: string[] = [];
  for (const { name, value } of invocation.options) {
    if (name === "--profile") {
      if (profileSelected) return parseError("Select one --profile per process.");
      profileSelected = true;
      if (!value?.trim()) return parseError("Missing value for --profile. Example: --profile work");
      try { opts.profile = profileName(value); }
      catch (err) { return parseError((err as Error).message); }
    } else if (name === "--config") {
      if (!value?.trim()) {
        return parseError("Missing or ambiguous value for --config. Use a path such as ./settings.json or ./-p.");
      }
      if (configPaths.length >= 32) return parseError("At most 32 --config inputs may be selected.");
      configPaths.push(value);
    } else if (name === "--project" || name === "--attach") {
      if (!value) {
        return parseError(`Missing value for ${name}. Example: --project D:\\path\\to\\your-project`);
      }
      if (name === "--project") explicitProject = value;
      else attachProject = value;
    } else if (name === "--doctor") {
      doctorRequested = true;
    } else if (name === "--session-id") {
      if (!value) return parseError("Missing value for --session-id. Example: --session-id <id>");
      opts.sessionId = value;
    } else if (name === "--continue" || name === "-c") {
      opts.continueSession = true;
    } else if (name === "--resume" || name === "-r") {
      opts.resumeSession = true;
    } else if (name === "--fork") {
      if (!value) return parseError("Missing value for --fork. Example: --fork <session-id>");
      opts.forkSource = value;
    } else if (name === "--provider") {
      const normalized = value?.trim().toLowerCase();
      if (!normalized) {
        pendingProviderError = "Missing value for --provider. Specify a provider name.";
      } else {
        if (isRuntimeProvider(normalized)) opts.provider = normalized;
        else pendingProviderError = `Invalid --provider value: ${value}. Expected one of: ${RUNTIME_PROVIDERS.join(", ")}.`;
      }
    } else if (name === "--model") {
      if (!value) return parseError("Missing value for --model. Example: --model gpt-5.4");
      opts.model = value;
    } else if (name === "--models") {
      if (!value) return parseError("Missing value for --models. Example: --models gpt-5.4,claude-sonnet-4-5");
      const patterns = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (patterns.length === 0) return parseError("No model patterns in --models. Example: --models gpt-5.4,claude-sonnet-4-5");
      opts.scopedModels = patterns;
    } else if (name === "--thinking") {
      if (!value) return parseError("Missing value for --thinking. Example: --thinking high");
      const level = value.trim().toLowerCase();
      if (!VALID_THINKING_ARGS.has(level)) {
        return parseError(`Invalid --thinking value: ${value}. Expected one of: ${[...VALID_THINKING_ARGS].join(", ")}.`);
      }
      opts.thinking = level;
    } else if (name === "--api-key") {
      if (value) opts.apiKey = value;
    } else if (name === "--replay-file") {
      if (!value) return parseError("Missing value for --replay-file. Example: --replay-file .\\replay.txt");
      opts.replayFile = value;
    } else if (name === "--export") {
      if (!value) return parseError("Missing value for --export. Example: --export <session-id-or-file>");
      opts.exportTarget = value;
    } else if (name === "--list-models") {
      opts.listModels = value ?? true;
    } else if (name === "--print" || name === "-p") {
      opts.printMode = true;
    } else if (name === "--json") {
      opts.printMode = true;
      opts.jsonEvents = true;
    } else if (name === "--rpc") {
      opts.rpcMode = true;
    } else if (name === "--no-context-files") {
      opts.noContextFiles = true;
    } else if (name === "--no-skills" || name === "-ns") {
      opts.noSkills = true;
    } else if (name === "--offline") {
      opts.offline = true;
    } else if (name === "--no-tools" || name === "-nt") {
      opts.noTools = true;
    } else if (name === "--dangerously-bypass-hook-trust") {
      opts.dangerouslyBypassHookTrust = true;
    } else if (name === "--migrate-session-root") {
      opts.migrateSessionRoot = true;
    } else if (name === "--skill") {
      if (!value) return parseError("Missing value for --skill. Example: --skill ./review.md");
      skillPaths.push(value);
    } else if (name === "--theme") {
      if (!value) return parseError("Missing value for --theme. Example: --theme ./my-theme.json");
      themePaths.push(value);
    } else if (name === "--use-theme") {
      if (!value) return parseError("Missing value for --use-theme. Example: --use-theme dark");
      opts.useTheme = value;
    } else if (name === "--extension" || name === "-e") {
      if (!value) return parseError("Missing value for --extension. Example: --extension ./my-ext.ts");
      extensionPaths.push(value);
    } else if (name === "--tools") {
      if (!value) return parseError("Missing value for --tools. Example: --tools read,grep,glob");
      const named = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      if (named.length === 0) return parseError("No tool names in --tools. Example: --tools read,grep,glob");
      opts.allowedTools = named;
    } else if (name === "--non-interactive-approval") {
      if (!value) {
        return parseError("Missing value for --non-interactive-approval. Use deny, allow-once, or allow-always.");
      }
      const mode = parseApprovalValue(value);
      if (!mode) {
        return parseError(
          `Invalid --non-interactive-approval value: ${value.trim().toLowerCase()}. Use deny, allow-once, or allow-always.`,
        );
      }
      opts.nonInteractiveApproval = mode;
    }
  }

  if (configPaths.length > 0) opts.configPaths = configPaths;
  if (skillPaths.length > 0) opts.skillPaths = skillPaths;
  if (themePaths.length > 0) opts.themePaths = themePaths;
  if (extensionPaths.length > 0) opts.extensionPaths = extensionPaths;
  const unresolved = invocation.unresolved;
  if (unresolved.length && (!parseOptions.deferExtensionOptions || extensionPaths.length === 0
    || doctorRequested || opts.listModels !== undefined || opts.exportTarget !== undefined
    || unresolved.some(option => !option.name.startsWith('--') || !EXTENSION_FLAG_NAME.test(option.name.slice(2))))) {
    return parseError("Unrecognized option. Place dash-prefixed prompt text after --.");
  }

  const project = explicitProject ?? attachProject;
  if (project) {
    opts.projectPath = project;
  } else if (!opts.exportTarget) {
    const cmdIdx = positionals.findIndex((t) => leadingCommandName(t) !== undefined);
    const candidates = cmdIdx === -1 ? positionals : positionals.slice(0, cmdIdx);
    const fallbackProject = candidates.find((arg) => /[\\/]/.test(arg) && leadingCommandName(arg.trim()) === undefined);
    if (fallbackProject) opts.projectPath = fallbackProject;
  }

  if (doctorRequested) {
    return { ok: true, args: { rawArgs, options: opts, versionRequested: false, doctorRequested: true } };
  }

  if (pendingProviderError) return parseError(pendingProviderError);

  if (opts.forkSource && (opts.sessionId || opts.continueSession || opts.resumeSession)) {
    return parseError("--fork cannot be combined with --session-id, --continue, or --resume.");
  }

  const promptTokens = [...positionals];
  if (opts.projectPath) {
    const normalizedProject = path.resolve(parseOptions.cwd, opts.projectPath).toLowerCase();
    const matchIdx = promptTokens.findIndex(
      (t) => path.resolve(parseOptions.cwd, t).toLowerCase() === normalizedProject || t === opts.projectPath,
    );
    if (matchIdx >= 0) promptTokens.splice(matchIdx, 1);
  }
  promptTokens.push(...tail);
  const prompt = promptTokens.join(" ");
  opts.promptArg = prompt.trim().length > 0 ? prompt : undefined;

  return { ok: true, args: { rawArgs, options: opts, versionRequested: false, doctorRequested: false,
    ...(unresolved.length ? { extensionOptions: unresolved } : {}) } };
}

export function isPrintModeRequested(args: CliArgs): boolean {
  return args.options.printMode === true;
}

export function isStdinModeRequested(input: {
  readonly stdinIsTty: boolean;
  readonly cliArgs: CliArgs;
}): boolean {
  return !input.stdinIsTty && !input.cliArgs.options.printMode && !input.cliArgs.options.replayFile;
}

export function isContinueRequested(cliArgs: CliArgs): boolean {
  return cliArgs.options.continueSession === true || cliArgs.options.promptArg?.trim().startsWith("/continue") === true;
}

export function isProviderReadinessRequested(cliArgs: CliArgs): boolean {
  return cliArgs.options.provider !== undefined || cliArgs.options.apiKey !== undefined;
}

export function getApprovalMode(cliArgs: CliArgs): NonInteractiveApprovalMode | undefined {
  return cliArgs.options.nonInteractiveApproval;
}

export function getWorkspaceSelection(cliArgs: CliArgs): string | undefined {
  return cliArgs.options.projectPath;
}
