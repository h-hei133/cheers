import type { RecoverySurfaceSummary } from "../../orchestration/patchRecovery/recoverySurfaceProjection.js";
import type { ContextStateProjectionInput } from "./contextStateProjection.js";

export type CompactCommandMode = "preview" | "render" | "json";
export type CompactCommandSource = "session" | "route" | "manual";

export interface CompactCommandRouteInfo {
  readonly routeId?: string;
  readonly name?: string;
  readonly objective?: string;
  readonly currentPhase?: string;
  readonly nextAction?: string;
  readonly stopConditions?: readonly string[];
  readonly forbiddenScope?: readonly string[];
}

export interface CompactCommandProjectInfo {
  readonly projectRoot?: string;
  readonly safeToPersistProjectRoot?: boolean;
  readonly branch?: string;
  readonly baseCommit?: string;
  readonly repositoryHints?: readonly string[];
}

export interface CompactCommandRequestInput {
  readonly mode?: CompactCommandMode;
  readonly source?: CompactCommandSource;
  readonly generatedAt?: string;
  readonly taskGoal?: ContextStateProjectionInput["taskGoal"];
  readonly routeInfo?: CompactCommandRouteInfo;
  readonly projectInfo?: CompactCommandProjectInfo;
  readonly mutationEvidence?: ContextStateProjectionInput["mutationEvidence"];
  readonly recoverySummary?: RecoverySurfaceSummary & {
    readonly currentContentGuardSummary?: string;
    readonly rawOriginalContent?: string;
  };
  readonly validationEvidence?: ContextStateProjectionInput["validationEvidence"];
  readonly includeMarkdown?: boolean;
  readonly includeJson?: boolean;
  readonly unsafeInputs?: Record<string, unknown>;
  readonly secretValues?: readonly string[];
}

export interface CompactCommandRequest {
  readonly mode: CompactCommandMode;
  readonly source: CompactCommandSource;
  readonly generatedAt: string;
  readonly previewOnly: true;
  readonly taskGoal?: ContextStateProjectionInput["taskGoal"];
  readonly routeInfo?: CompactCommandRouteInfo;
  readonly projectInfo?: CompactCommandProjectInfo;
  readonly mutationEvidence?: ContextStateProjectionInput["mutationEvidence"];
  readonly recoverySummary?: RecoverySurfaceSummary & {
    readonly currentContentGuardSummary?: string;
    readonly rawOriginalContent?: string;
  };
  readonly validationEvidence?: ContextStateProjectionInput["validationEvidence"];
  readonly includeMarkdown: boolean;
  readonly includeJson: boolean;
  readonly unsafeInputs: Record<string, unknown>;
  readonly secretValues: readonly string[];
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly recoveryExecution: "none";
  readonly evidence: readonly string[];
}

export class CompactCommandContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CompactCommandContractError";
    this.code = code;
  }
}

const RAW_TOP_LEVEL_KEYS = [
  "rawContent",
  "rawOriginalContent",
  "rawRecoveryContent",
  "rawContentBlob",
  "rawFileDump",
  "hiddenReasoning",
  "chainOfThought",
  "providerCredentials",
  "providerConfig",
  "headers",
  "authorization",
  "apiKey",
  "token",
];

export function parseCompactCommandArgs(
  args: readonly string[],
  defaults: CompactCommandRequestInput = {},
): CompactCommandRequest {
  const options = parseOptions(args);
  if (options.has("execute") || options.has("persist") || options.has("memory")) {
    throw new CompactCommandContractError(
      "compact-command-mutating-flag",
      "/compact is preview-only and cannot execute recovery, persist memory, or write state.",
    );
  }
  if (
    options.has("raw") ||
    options.has("raw-content") ||
    options.has("raw-recovery-content")
  ) {
    throw new CompactCommandContractError(
      "compact-command-raw-content-rejected",
      "/compact does not accept raw content fields.",
    );
  }
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const mode = parseMode(positional[0], options, defaults.mode);

  const source =
    parseSource(optionValue(options.get("source"))) ?? defaults.source ?? "session";
  const includeJson = mode === "json" || defaults.includeJson === true;
  const includeMarkdown =
    defaults.includeMarkdown ??
    (mode === "render" || (mode === "json" ? false : false));

  return normalizeCompactCommandRequest({
    ...defaults,
    mode,
    source,
    includeJson,
    includeMarkdown,
    taskGoal: {
      ...defaults.taskGoal,
      ...stripUndefined({
        objective:
          optionValue(options.get("goal")) ??
          optionValue(options.get("objective")) ??
          defaults.taskGoal?.objective,
        constraints: [
          ...(defaults.taskGoal?.constraints ?? []),
          ...optionValues(options, "constraint"),
        ],
        nextAction:
          optionValue(options.get("next")) ??
          optionValue(options.get("next-action")) ??
          defaults.taskGoal?.nextAction,
      }),
    },
    routeInfo: {
      ...defaults.routeInfo,
      ...stripUndefined({
        routeId:
          optionValue(options.get("route-id")) ??
          optionValue(options.get("route")) ??
          defaults.routeInfo?.routeId,
        name:
          optionValue(options.get("route-name")) ??
          optionValue(options.get("name")) ??
          defaults.routeInfo?.name,
        currentPhase:
          optionValue(options.get("phase")) ?? defaults.routeInfo?.currentPhase,
        nextAction:
          optionValue(options.get("next")) ??
          optionValue(options.get("next-action")) ??
          defaults.routeInfo?.nextAction,
      }),
    },
    projectInfo: {
      ...defaults.projectInfo,
      ...stripUndefined({
        projectRoot:
          optionValue(options.get("project-root")) ??
          optionValue(options.get("cwd")) ??
          defaults.projectInfo?.projectRoot,
        branch: optionValue(options.get("branch")) ?? defaults.projectInfo?.branch,
        baseCommit:
          optionValue(options.get("base")) ??
          optionValue(options.get("base-commit")) ??
          defaults.projectInfo?.baseCommit,
      }),
    },
  });
}

export function normalizeCompactCommandRequest(
  input: CompactCommandRequestInput,
): CompactCommandRequest {
  rejectRawTopLevelFields(input as Record<string, unknown>);

  const mode = input.mode ?? "render";
  const includeMarkdown = input.includeMarkdown ?? mode === "render";
  const includeJson = input.includeJson ?? mode === "json";

  if (mode === "json" && includeMarkdown) {
    throw new CompactCommandContractError(
      "compact-command-incompatible-flags",
      "JSON mode cannot include rendered markdown in the same command result.",
    );
  }
  if (mode === "preview" && includeJson) {
    throw new CompactCommandContractError(
      "compact-command-incompatible-flags",
      "Preview mode cannot include structured JSON output.",
    );
  }
  if (!includeMarkdown && !includeJson && mode !== "preview") {
    throw new CompactCommandContractError(
      "compact-command-empty-output",
      "Compact command must render markdown or JSON.",
    );
  }

  return {
    mode,
    source: input.source ?? "session",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    previewOnly: true,
    taskGoal: input.taskGoal,
    routeInfo: input.routeInfo,
    projectInfo: input.projectInfo,
    mutationEvidence: input.mutationEvidence,
    recoverySummary: input.recoverySummary,
    validationEvidence: input.validationEvidence,
    includeMarkdown,
    includeJson,
    unsafeInputs: input.unsafeInputs ?? {},
    secretValues: input.secretValues ?? [],
    persistence: "none",
    providerCall: "none",
    recoveryExecution: "none",
    evidence: [
      "compact-command-contract:pure",
      "compact-command-contract:preview-only",
      "compact-command-contract:no-persistence",
      "compact-command-contract:no-provider-call",
      "compact-command-contract:no-recovery-execution",
    ],
  };
}

function parseMode(
  positionalMode: string | undefined,
  options: ReadonlyMap<string, readonly (string | true)[]>,
  fallback: CompactCommandMode | undefined,
): CompactCommandMode {
  const flagModes = [
    options.has("preview") ? "preview" : undefined,
    options.has("render") ? "render" : undefined,
    options.has("json") ? "json" : undefined,
  ].filter(Boolean);
  if (flagModes.length > 1) {
    throw new CompactCommandContractError(
      "compact-command-incompatible-flags",
      "Choose only one compact mode: preview, render, or json.",
    );
  }
  const explicit = flagModes[0] ?? positionalMode?.trim().toLowerCase();
  if (!explicit) {
    return fallback ?? "render";
  }
  if (explicit === "preview" || explicit === "render" || explicit === "json") {
    return explicit;
  }
  throw new CompactCommandContractError(
    "compact-command-invalid-mode",
    `Unsupported compact mode: ${explicit}.`,
  );
}

function parseSource(value: string | undefined): CompactCommandSource | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "session" || value === "route" || value === "manual") {
    return value;
  }
  throw new CompactCommandContractError(
    "compact-command-invalid-source",
    `Unsupported compact source: ${value}.`,
  );
}

function rejectRawTopLevelFields(input: Record<string, unknown>): void {
  for (const key of Object.keys(input)) {
    if (RAW_TOP_LEVEL_KEYS.includes(key)) {
      throw new CompactCommandContractError(
        "compact-command-raw-content-rejected",
        `Compact command rejected raw or sensitive top-level field: ${key}.`,
      );
    }
  }
}

function parseOptions(args: readonly string[]): Map<string, readonly (string | true)[]> {
  const options = new Map<string, Array<string | true>>();
  const add = (key: string, value: string | true): void => {
    const existing = options.get(key);
    if (existing) {
      existing.push(value);
    } else {
      options.set(key, [value]);
    }
  };

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (!raw.startsWith("--")) {
      continue;
    }
    const normalized = raw.slice(2);
    const inline = normalized.indexOf("=");
    if (inline !== -1) {
      add(
        normalized.slice(0, inline).trim().toLowerCase(),
        normalized.slice(inline + 1).trim(),
      );
      continue;
    }
    const key = normalized.trim().toLowerCase();
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      add(key, next);
      index += 1;
    } else {
      add(key, true);
    }
  }
  return options;
}

function optionValue(values: readonly (string | true)[] | undefined): string | undefined {
  const value = values?.find((entry): entry is string => typeof entry === "string");
  return value?.trim() || undefined;
}

function optionValues(
  options: ReadonlyMap<string, readonly (string | true)[]>,
  key: string,
): readonly string[] {
  return (options.get(key) ?? []).filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
