import path from "node:path";
import { profileName } from "../core/paths/profile/name.js";
import { RUNTIME_PROVIDERS, isRuntimeProvider } from "../config/runtimeConfig.js";
import { isVersionRequested } from "../cli/options/early.js";
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

function splitFlagToken(token: string): { readonly name: string; readonly inlineValue?: string } {
  const eq = token.indexOf("=");
  if (eq <= 0 || !token.startsWith("--")) return { name: token };
  return { name: token.slice(0, eq), inlineValue: token.slice(eq + 1) };
}

function takeRequiredValue(
  rawArgs: readonly string[],
  index: number,
  inlineValue: string | undefined,
  rejectAnyDash = false,
): { readonly value?: string; readonly nextIndex: number } {
  if (inlineValue !== undefined) {
    if (!inlineValue.trim() || (rejectAnyDash ? inlineValue.startsWith("-") : inlineValue.startsWith("--"))) {
      return { nextIndex: index };
    }
    return { value: inlineValue, nextIndex: index };
  }
  const next = rawArgs[index + 1];
  if (!next || (rejectAnyDash ? next.startsWith("-") : next.startsWith("--"))) {
    return { nextIndex: index };
  }
  return { value: next, nextIndex: index + 1 };
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
  rawArgs: readonly string[],
  parseOptions: ParseCliArgsOptions,
): CliArgParseResult {
  if (isVersionRequested(rawArgs)) {
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
  const positionalBeforeTerminator: string[] = [];
  const tailAfterTerminator: string[] = [];

  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i]!;
    if (token === "--") {
      tailAfterTerminator.push(...rawArgs.slice(i + 1));
      break;
    }

    const { name, inlineValue } = splitFlagToken(token);
    if (name === "--profile") {
      if (profileSelected) return parseError("Select one --profile per process.");
      profileSelected = true;
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value || !got.value.trim()) return parseError("Missing value for --profile. Example: --profile work");
      i = got.nextIndex;
      try { opts.profile = profileName(got.value); }
      catch (err) { return parseError((err as Error).message); }
    } else if (name === "--config") {
      const got = takeRequiredValue(rawArgs, i, inlineValue, true);
      if (!got.value || !got.value.trim()) {
        return parseError("Missing or ambiguous value for --config. Use a path such as ./settings.json or ./-p.");
      }
      if (configPaths.length >= 32) return parseError("At most 32 --config inputs may be selected.");
      configPaths.push(got.value);
      i = got.nextIndex;
    } else if (name === "--project" || name === "--attach") {
      const rawVal = inlineValue ?? rawArgs[i + 1];
      if (!rawVal) {
        return parseError(`Missing value for ${name}. Example: --project D:\\path\\to\\your-project`);
      }
      if (inlineValue === undefined) i += 1;
      if (name === "--project") explicitProject = rawVal;
      else attachProject = rawVal;
    } else if (name === "--doctor") {
      doctorRequested = true;
    } else if (name === "--session-id") {
      const val = inlineValue ?? rawArgs[i + 1];
      if (val) { opts.sessionId = val; if (inlineValue === undefined) i += 1; }
    } else if (name === "--continue" || name === "-c") {
      opts.continueSession = true;
    } else if (name === "--resume" || name === "-r") {
      opts.resumeSession = true;
    } else if (name === "--fork") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --fork. Example: --fork <session-id>");
      opts.forkSource = got.value;
      i = got.nextIndex;
    } else if (name === "--provider") {
      const rawProvider = inlineValue ?? rawArgs[i + 1];
      if (rawProvider) {
        if (inlineValue === undefined) i += 1;
        const normalized = rawProvider.trim().toLowerCase();
        if (isRuntimeProvider(normalized)) opts.provider = normalized;
        else pendingProviderError = `Invalid --provider value: ${rawProvider}. Expected one of: ${RUNTIME_PROVIDERS.join(", ")}.`;
      }
    } else if (name === "--model") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --model. Example: --model gpt-5.4");
      opts.model = got.value;
      i = got.nextIndex;
    } else if (name === "--models") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --models. Example: --models gpt-5.4,claude-sonnet-4-5");
      const patterns = got.value.split(",").map((s) => s.trim()).filter(Boolean);
      if (patterns.length === 0) return parseError("No model patterns in --models. Example: --models gpt-5.4,claude-sonnet-4-5");
      opts.scopedModels = patterns;
      i = got.nextIndex;
    } else if (name === "--thinking") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --thinking. Example: --thinking high");
      const level = got.value.trim().toLowerCase();
      if (!VALID_THINKING_ARGS.has(level)) {
        return parseError(`Invalid --thinking value: ${got.value}. Expected one of: ${[...VALID_THINKING_ARGS].join(", ")}.`);
      }
      opts.thinking = level;
      i = got.nextIndex;
    } else if (name === "--api-key") {
      const val = inlineValue ?? rawArgs[i + 1];
      if (val) { opts.apiKey = val; if (inlineValue === undefined) i += 1; }
    } else if (name === "--replay-file") {
      const val = inlineValue ?? rawArgs[i + 1];
      if (!val) return parseError("Missing value for --replay-file. Example: --replay-file .\\replay.txt");
      opts.replayFile = val;
      if (inlineValue === undefined) i += 1;
    } else if (name === "--export") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --export. Example: --export <session-id-or-file>");
      opts.exportTarget = got.value;
      i = got.nextIndex;
    } else if (name === "--list-models") {
      if (inlineValue !== undefined) {
        opts.listModels = inlineValue.trim() || true;
      } else {
        const next = rawArgs[i + 1];
        if (next && !next.startsWith("-") && !next.startsWith("@")) {
          opts.listModels = next;
          i += 1;
        } else {
          opts.listModels = true;
        }
      }
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
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --skill. Example: --skill ./review.md");
      skillPaths.push(got.value);
      i = got.nextIndex;
    } else if (name === "--theme") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --theme. Example: --theme ./my-theme.json");
      themePaths.push(got.value);
      i = got.nextIndex;
    } else if (name === "--use-theme") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --use-theme. Example: --use-theme dark");
      opts.useTheme = got.value;
      i = got.nextIndex;
    } else if (name === "--extension" || name === "-e") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --extension. Example: --extension ./my-ext.ts");
      extensionPaths.push(got.value);
      i = got.nextIndex;
    } else if (name === "--tools") {
      const got = takeRequiredValue(rawArgs, i, inlineValue);
      if (!got.value) return parseError("Missing value for --tools. Example: --tools read,grep,glob");
      const named = got.value.split(",").map((entry) => entry.trim()).filter(Boolean);
      if (named.length === 0) return parseError("No tool names in --tools. Example: --tools read,grep,glob");
      opts.allowedTools = named;
      i = got.nextIndex;
    } else if (name === "--non-interactive-approval") {
      const rawApproval = inlineValue ?? rawArgs[i + 1];
      if (!rawApproval) {
        return parseError("Missing value for --non-interactive-approval. Use deny, allow-once, or allow-always.");
      }
      if (inlineValue === undefined) i += 1;
      const mode = parseApprovalValue(rawApproval);
      if (!mode) {
        return parseError(
          `Invalid --non-interactive-approval value: ${rawApproval.trim().toLowerCase()}. Use deny, allow-once, or allow-always.`,
        );
      }
      opts.nonInteractiveApproval = mode;
    } else if (!token.startsWith("-")) {
      positionalBeforeTerminator.push(token);
    }
  }

  if (configPaths.length > 0) opts.configPaths = configPaths;
  if (skillPaths.length > 0) opts.skillPaths = skillPaths;
  if (themePaths.length > 0) opts.themePaths = themePaths;
  if (extensionPaths.length > 0) opts.extensionPaths = extensionPaths;

  const project = explicitProject ?? attachProject;
  if (project) {
    opts.projectPath = project;
  } else if (!opts.exportTarget) {
    const cmdIdx = positionalBeforeTerminator.findIndex((t) => leadingCommandName(t) !== undefined);
    const candidates = cmdIdx === -1 ? positionalBeforeTerminator : positionalBeforeTerminator.slice(0, cmdIdx);
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

  const promptTokens = [...positionalBeforeTerminator];
  if (opts.projectPath) {
    const normalizedProject = path.resolve(parseOptions.cwd, opts.projectPath).toLowerCase();
    const matchIdx = promptTokens.findIndex(
      (t) => path.resolve(parseOptions.cwd, t).toLowerCase() === normalizedProject || t === opts.projectPath,
    );
    if (matchIdx >= 0) promptTokens.splice(matchIdx, 1);
  }
  promptTokens.push(...tailAfterTerminator);
  const prompt = promptTokens.join(" ");
  opts.promptArg = prompt.trim().length > 0 ? prompt : undefined;

  return { ok: true, args: { rawArgs, options: opts, versionRequested: false, doctorRequested: false } };
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
