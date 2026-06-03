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
  readonly continuationAvailable: boolean;
  readonly failureCategories: readonly string[];
}

export interface ContextSelection {
  readonly state: ContextSelectionState;
  readonly selectedPaths: readonly string[];
  readonly sourcePaths: readonly string[];
  readonly targetPaths: readonly string[];
  readonly omittedPaths: readonly string[];
  readonly refreshed: boolean;
  readonly blockers: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function selectContext(input: ContextSelectionInput): ContextSelection {
  const workspacePaths = input.workspaceFiles.map((file) => file.path);
  const targetPaths = input.requiredPaths.filter((path) => workspacePaths.includes(path));
  const sourcePaths = input.workspaceFiles
    .filter((file) => !input.requiredPaths.includes(file.path))
    .map((file) => file.path);
  const selectedPaths = unique([...targetPaths, ...sourcePaths]);
  const missingRequiredPaths = input.requiredPaths.filter((path) => !workspacePaths.includes(path));
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
    omittedPaths: workspacePaths.filter((path) => !selectedPaths.includes(path)),
    refreshed: input.taskKind === "continuation" && input.continuationAvailable,
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

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
