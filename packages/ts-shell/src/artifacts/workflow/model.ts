export type ArtifactKind = "report" | "structured-data" | "summary" | "export";

export type ArtifactValidationState =
  | "not-applicable"
  | "intent-created"
  | "source-missing"
  | "unsafe-path"
  | "invalid"
  | "validation-failed"
  | "validation-passed"
  | "not-proven";

export interface ArtifactReceiptInput {
  readonly taskKind: string;
  readonly outputKind: string;
  readonly requiredPaths: readonly string[];
  readonly workspacePaths: readonly string[];
  readonly verificationState: string;
  readonly failureCategories: readonly string[];
}

export interface ArtifactReceipt {
  readonly intent: string;
  readonly kind: ArtifactKind;
  readonly sourceReceipts: readonly {
    readonly path: string;
    readonly available: boolean;
  }[];
  readonly scopeExpectation: string;
  readonly outputPath?: string;
  readonly formatExpectation: string;
  readonly validationCheck: string;
  readonly validationState: ArtifactValidationState;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function createArtifactReceipt(input: ArtifactReceiptInput): ArtifactReceipt | undefined {
  if (input.outputKind !== "artifact") {
    return undefined;
  }
  const outputPath = input.requiredPaths[0];
  const kind = artifactKindFor(input.taskKind, outputPath);
  const sourceReceipts = input.workspacePaths
    .filter((path) => path !== outputPath)
    .map((path) => freeze({ path, available: true }));
  const validationState = artifactValidationStateFor(input);
  const blockers = artifactBlockersFor(input, validationState);

  return freeze({
    intent: `produce ${kind} artifact`,
    kind,
    sourceReceipts,
    scopeExpectation: "use only task-scoped sources and required output paths",
    outputPath,
    formatExpectation: formatExpectationFor(kind, outputPath),
    validationCheck: validationCheckFor(kind),
    validationState,
    blockers,
    terminalSuccessClaim: false,
  });
}

function artifactKindFor(taskKind: string, outputPath: string | undefined): ArtifactKind {
  if (taskKind === "docs-report") {
    return "report";
  }
  if (taskKind === "data-artifact" || outputPath?.endsWith(".json")) {
    return "structured-data";
  }
  if (taskKind === "live-triage") {
    return "export";
  }
  return "summary";
}

function artifactValidationStateFor(input: ArtifactReceiptInput): ArtifactValidationState {
  if (input.requiredPaths.some((path) => path.startsWith("/") || path.includes(".."))) {
    return "unsafe-path";
  }
  if (input.failureCategories.includes("unsupported capability")) {
    return "not-proven";
  }
  if (input.workspacePaths.length <= input.requiredPaths.length) {
    return "source-missing";
  }
  if (input.failureCategories.includes("artifact invalid")) {
    return input.verificationState === "selected-failed" ? "validation-failed" : "invalid";
  }
  if (input.verificationState === "selected-passed") {
    return "validation-passed";
  }
  if (input.verificationState === "selected-not-run" || input.verificationState === "not-selected") {
    return "not-proven";
  }
  return "intent-created";
}

function artifactBlockersFor(
  input: ArtifactReceiptInput,
  state: ArtifactValidationState,
): readonly string[] {
  switch (state) {
    case "unsafe-path":
      return ["unsafe artifact path"];
    case "source-missing":
      return ["artifact source missing"];
    case "invalid":
      return ["artifact invalid"];
    case "validation-failed":
      return ["artifact validation failed"];
    case "not-proven":
      return ["artifact validation not proven"];
    case "intent-created":
      return ["artifact validation not run"];
    case "validation-passed":
    case "not-applicable":
      return [];
  }
}

function formatExpectationFor(kind: ArtifactKind, outputPath: string | undefined): string {
  if (kind === "structured-data") {
    return "valid JSON with task totals";
  }
  if (kind === "report") {
    return "markdown report with source-scoped facts";
  }
  if (kind === "export") {
    return "durable export handle";
  }
  return outputPath ? "task summary artifact" : "durable artifact handle";
}

function validationCheckFor(kind: ArtifactKind): string {
  if (kind === "structured-data") {
    return "parse and compare structured fields";
  }
  if (kind === "report") {
    return "check source coverage and required scope";
  }
  if (kind === "export") {
    return "check durable handle and supported format";
  }
  return "inspect required artifact facts";
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
