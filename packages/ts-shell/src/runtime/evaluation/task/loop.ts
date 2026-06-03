export type TaskLoopMode = "deterministic" | "live";

export type TaskLoopModelSource =
  | "deterministic-evaluation"
  | "explicit-live-gate"
  | "not-run";

export type TaskLoopStageName =
  | "goal"
  | "state"
  | "context"
  | "plan"
  | "request"
  | "provider-turn"
  | "action"
  | "observation"
  | "verification"
  | "repair"
  | "proof"
  | "verdict";

export type TaskLoopStageStatus =
  | "ready"
  | "passed"
  | "partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "unsupported"
  | "manual-review-required"
  | "not-run"
  | "not-proven";

export interface TaskLoopStage {
  readonly stage: TaskLoopStageName;
  readonly owner: string;
  readonly status: TaskLoopStageStatus;
  readonly evidence: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface TaskLoopStepOutput<Value> {
  readonly value: Value;
  readonly status: TaskLoopStageStatus;
  readonly evidence: readonly string[];
}

export interface TaskLoopStep<Value> {
  readonly key: string;
  readonly stage: TaskLoopStageName;
  readonly owner: string;
  readonly run: (
    outputs: Readonly<Record<string, unknown>>,
  ) => Value | Promise<Value> | TaskLoopStepOutput<Value> | Promise<TaskLoopStepOutput<Value>>;
}

export interface TaskLoopRun {
  readonly mode: TaskLoopMode;
  readonly modelSource: TaskLoopModelSource;
  readonly stages: readonly TaskLoopStage[];
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly ownerCalls: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskProgression {
  readonly mode: TaskLoopMode;
  readonly modelSource: TaskLoopModelSource;
  readonly stages: readonly TaskLoopStage[];
  readonly ownerCalls: readonly string[];
  readonly completeProof: boolean;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export async function runTaskLoop(input: {
  readonly mode: TaskLoopMode;
  readonly modelSource: TaskLoopModelSource;
  readonly steps: readonly TaskLoopStep<unknown>[];
  readonly notProvenClaims?: readonly string[];
}): Promise<TaskLoopRun> {
  const outputs: Record<string, unknown> = {};
  const stages: TaskLoopStage[] = [];
  const ownerCalls: string[] = [];

  for (const step of input.steps) {
    const rawOutput = await step.run(outputs);
    const output = isStepOutput(rawOutput)
      ? rawOutput
      : {
        value: rawOutput,
        status: statusFromState(rawOutput),
        evidence: evidenceFromValue(rawOutput),
      };
    outputs[step.key] = output.value;
    ownerCalls.push(step.owner);
    stages.push(stage(step.stage, step.owner, output.status, output.evidence));
  }

  return freeze({
    mode: input.mode,
    modelSource: input.modelSource,
    stages: freeze(stages),
    outputs: freeze(outputs),
    ownerCalls: freeze(unique(ownerCalls)),
    terminalSuccessClaim: false,
    notProvenClaims: freeze(unique([
      "task-loop-run-is-not-task-success",
      "terminal-success",
      ...(input.notProvenClaims ?? []),
    ])),
  });
}

export function stepOutput<Value>(
  value: Value,
  status: TaskLoopStageStatus,
  evidence: readonly string[],
): TaskLoopStepOutput<Value> {
  return freeze({
    value,
    status,
    evidence: freeze([...evidence]),
  });
}

export function projectTaskLoopProgression(input: {
  readonly loop: TaskLoopRun;
  readonly completeProof: boolean;
  readonly notProvenClaims?: readonly string[];
}): TaskProgression {
  return freeze({
    mode: input.loop.mode,
    modelSource: input.loop.modelSource,
    stages: input.loop.stages,
    ownerCalls: input.loop.ownerCalls,
    completeProof: input.completeProof,
    terminalSuccessClaim: false,
    notProvenClaims: freeze(unique([
      "progression-is-not-task-success",
      ...input.loop.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ])),
  });
}

export function statusFromState(value: unknown): TaskLoopStageStatus {
  if (typeof value === "string") return statusFromString(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.state ?? record.status ?? record.outcome;
    if (typeof candidate === "string") return statusFromString(candidate);
  }
  return "ready";
}

export function statusFromString(status: string): TaskLoopStageStatus {
  if (
    status === "ready" ||
    status === "passed" ||
    status === "partial" ||
    status === "failed" ||
    status === "blocked" ||
    status === "skipped" ||
    status === "unsupported" ||
    status === "manual-review-required" ||
    status === "not-run" ||
    status === "not-proven"
  ) return status;
  if (status === "complete" || status === "complete-proof" || status === "validation-passed") return "passed";
  if (status === "useful-partial") return "partial";
  if (status === "missing" || status === "not-selected" || status === "not-needed") return "not-run";
  if (status === "unsafe" || status === "redaction-blocked" || status.endsWith("-unavailable")) return "blocked";
  if (status === "provider-network-inconclusive") return "blocked";
  if (status === "config-or-skip") return "skipped";
  return "not-proven";
}

function isStepOutput(value: unknown): value is TaskLoopStepOutput<unknown> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return "value" in record && typeof record.status === "string" && Array.isArray(record.evidence);
}

function evidenceFromValue(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id = record.caseId ?? record.entryId ?? record.proofId ?? record.verdictId ?? record.scenarioId;
    if (typeof id === "string") return [id];
  }
  return [];
}

function stage(
  stageName: TaskLoopStageName,
  owner: string,
  status: TaskLoopStageStatus,
  evidence: readonly string[],
): TaskLoopStage {
  return freeze({
    stage: stageName,
    owner,
    status,
    evidence: freeze([...evidence]),
    terminalSuccessClaim: false,
  });
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
