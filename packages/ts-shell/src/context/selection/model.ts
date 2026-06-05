export type ContextSelectionState = "ready" | "partial" | "blocked";

export interface ContextSelectionInput {
  readonly taskKind: string;
  readonly taskPath: string;
  readonly shortPrompt: string;
  readonly workspaceFiles: readonly {
    readonly path: string;
    readonly purpose: string;
  }[];
  readonly requiredPaths: readonly string[];
  readonly observedPaths?: readonly string[];
  readonly continuationAvailable: boolean;
  readonly failureCategories: readonly string[];
}

export interface ContextSelection {
  readonly state: ContextSelectionState;
  readonly selectedPaths: readonly string[];
  readonly sourcePaths: readonly string[];
  readonly targetPaths: readonly string[];
  readonly relatedPaths: readonly string[];
  readonly ownerPaths: readonly string[];
  readonly observedPaths: readonly string[];
  readonly verificationPaths: readonly string[];
  readonly packagePaths: readonly string[];
  readonly omittedPaths: readonly string[];
  readonly contextPacketSummary: string;
  readonly refreshed: boolean;
  readonly proofGap: readonly string[];
  readonly suggestedActions: readonly string[];
  readonly blockers: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function selectContext(input: ContextSelectionInput): ContextSelection {
  const workspacePaths = input.workspaceFiles.map((file) => file.path);
  const targetPaths = input.requiredPaths.filter((path) => workspacePaths.includes(path));
  const packagePaths = workspacePaths.filter((path) => packagePath(path));
  const verificationPaths = input.workspaceFiles
    .filter((file) => verificationCandidate(file.path, file.purpose))
    .map((file) => file.path);
  const sourcePaths = input.workspaceFiles
    .filter((file) => !input.requiredPaths.includes(file.path) && sourceCandidate(file.path, file.purpose, input.taskPath))
    .map((file) => file.path);
  const ownerPaths = input.workspaceFiles
    .filter((file) => ownerCandidate(file.path, file.purpose, input.shortPrompt, targetPaths))
    .map((file) => file.path);
  const relatedPaths = input.workspaceFiles
    .filter((file) => relatedCandidate(file.path, file.purpose, input.shortPrompt, targetPaths, input.taskKind))
    .map((file) => file.path);
  const observedPaths = (input.observedPaths ?? []).filter((path) => workspacePaths.includes(path));
  const selectedPaths = unique([...targetPaths, ...packagePaths, ...sourcePaths, ...ownerPaths, ...verificationPaths, ...relatedPaths, ...observedPaths]);
  const observedRequiredPaths = new Set(observedPaths.filter((path) => input.requiredPaths.includes(path)));
  const missingRequiredPaths = input.requiredPaths.filter((path) =>
    !workspacePaths.includes(path) && !observedRequiredPaths.has(path)
  );
  const continuationBlocked = input.taskKind === "continuation" && !input.continuationAvailable;
  const state: ContextSelectionState = missingRequiredPaths.length > 0 || continuationBlocked
    ? "blocked"
    : selectedPaths.length > 0
      ? "ready"
      : "partial";

  return freeze({
    state,
    selectedPaths,
    sourcePaths,
    targetPaths,
    relatedPaths: unique(relatedPaths),
    ownerPaths: unique(ownerPaths),
    observedPaths: unique(observedPaths),
    verificationPaths: unique(verificationPaths),
    packagePaths: unique(packagePaths),
    omittedPaths: workspacePaths.filter((path) => !selectedPaths.includes(path)),
    contextPacketSummary: `${targetPaths.length} target(s), ${sourcePaths.length} source(s), ${ownerPaths.length} owner hint(s), ${verificationPaths.length} verification candidate(s), ${relatedPaths.length} related path(s)`,
    refreshed: input.taskKind === "continuation" && input.continuationAvailable,
    proofGap: proofGapFor(input, state, missingRequiredPaths, verificationPaths),
    suggestedActions: suggestedActionsFor(input, state, missingRequiredPaths, verificationPaths),
    blockers: [
      ...missingRequiredPaths.map((path) => `missing required context: ${path}`),
      ...(continuationBlocked ? ["continuation context unavailable"] : []),
      ...(state === "partial" ? ["context selection incomplete"] : []),
    ],
    notProvenClaims: [
      "context-selected-is-not-task-success",
      ...(state === "ready" ? [] : ["context-selection-not-ready"]),
    ],
    terminalSuccessClaim: false,
  });
}

function proofGapFor(
  input: ContextSelectionInput,
  state: ContextSelectionState,
  missingRequiredPaths: readonly string[],
  verificationPaths: readonly string[],
): readonly string[] {
  return freeze([
    ...(missingRequiredPaths.length > 0 ? ["required context missing"] : []),
    ...(input.failureCategories.includes("context insufficient") ? ["context evidence incomplete"] : []),
    ...(input.failureCategories.includes("missing context") ? ["failure needs more context"] : []),
    ...(input.failureCategories.includes("verification failed") ? ["verification evidence incomplete"] : []),
    ...(input.failureCategories.includes("verification blocked") ? ["verification blocker unresolved"] : []),
    ...(input.taskKind === "continuation" && !input.continuationAvailable ? ["continuation facts unavailable"] : []),
    ...(state !== "blocked" && verificationPaths.length === 0 ? ["verification target missing"] : []),
  ]);
}

function suggestedActionsFor(
  input: ContextSelectionInput,
  state: ContextSelectionState,
  missingRequiredPaths: readonly string[],
  verificationPaths: readonly string[],
): readonly string[] {
  if (missingRequiredPaths.length > 0 || input.failureCategories.includes("missing context")) {
    return freeze(["search", "read"]);
  }
  if (state === "partial" || input.failureCategories.includes("context insufficient")) {
    return freeze(["search"]);
  }
  if (input.failureCategories.includes("verification failed")) {
    return freeze(["repair", "verify"]);
  }
  if (input.failureCategories.includes("verification blocked")) {
    return freeze(["verify"]);
  }
  if (verificationPaths.length === 0) {
    return freeze(["search", "verify"]);
  }
  return freeze(["read", "verify"]);
}

function packagePath(path: string): boolean {
  return path === "package.json" || path.endsWith("/package.json");
}

function verificationCandidate(path: string, purpose: string): boolean {
  const normalized = `${path} ${purpose}`.toLowerCase();
  return normalized.includes("test") ||
    normalized.includes("spec") ||
    normalized.includes("verification") ||
    normalized.includes("check");
}

function sourceCandidate(path: string, purpose: string, taskPath: string): boolean {
  if (taskPath === "artifact") {
    return !path.startsWith("reports/") && !path.startsWith("artifacts/");
  }
  const normalized = `${path} ${purpose}`.toLowerCase();
  return normalized.includes("source") ||
    normalized.includes("note") ||
    normalized.includes("data") ||
    normalized.includes("context") ||
    normalized.includes("script");
}

function relatedCandidate(
  path: string,
  purpose: string,
  shortPrompt: string,
  targetPaths: readonly string[],
  taskKind: string,
): boolean {
  if (targetPaths.includes(path) || packagePath(path) || verificationCandidate(path, purpose)) {
    return false;
  }
  if (taskKind === "continuation") {
    return path.startsWith("session/");
  }
  const normalized = `${path} ${purpose} ${shortPrompt}`.toLowerCase();
  const targetStem = targetPaths
    .map((target) => target.split("/").at(-1)?.replace(/\.[^.]+$/, "").toLowerCase())
    .filter((value): value is string => Boolean(value));
  return targetStem.some((stem) => normalized.includes(stem)) ||
    normalized.includes("related") ||
    normalized.includes("nearby") ||
    normalized.includes("owner") ||
    normalized.includes("risk");
}

function ownerCandidate(
  path: string,
  purpose: string,
  shortPrompt: string,
  targetPaths: readonly string[],
): boolean {
  if (targetPaths.includes(path) || packagePath(path) || verificationCandidate(path, purpose)) {
    return false;
  }
  const normalized = `${path} ${purpose} ${shortPrompt}`.toLowerCase();
  return normalized.includes("owner") ||
    normalized.includes("boundary") ||
    normalized.includes("module") ||
    targetPaths.some((target) => {
      const [targetRoot] = target.split("/");
      return Boolean(targetRoot) && path.startsWith(`${targetRoot}/`);
    });
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
