import type { EvaluationCaseId } from "../model.js";
import {
  listTaskCases,
} from "./model.js";
import type {
  BuiltinTaskCaseId,
  TaskCaseDefinition,
  TaskCaseId,
  TaskExpectedOutput,
  TaskFailureCategory,
  TaskKind,
  TaskLiveGate,
  TaskLivePolicy,
  TaskLiveSafetyClass,
  TaskPath,
  TaskVerificationStatus,
} from "./types.js";

import type {
  TaskLiveEntry,
  TaskLiveEntryId,
  TaskLiveEntryKind,
} from "./liveTypes.js";

export interface TaskLiveCatalog {
  readonly catalogId: string;
  readonly entries: readonly TaskLiveEntry[];
  readonly caseDefinitions: readonly TaskCaseDefinition[];
}

type CatalogTaskRecord = {
  readonly entryId: TaskLiveEntryId;
  readonly caseId: TaskCaseId;
  readonly baseCaseId: BuiltinTaskCaseId;
  readonly entryKind: TaskLiveEntryKind;
  readonly taskKind: TaskKind;
  readonly taskPath: TaskPath;
  readonly shortPrompt: string;
  readonly gate: TaskLiveGate;
  readonly safetyClass: TaskLiveSafetyClass;
  readonly writePolicy: TaskLivePolicy;
  readonly validationPlan: string;
  readonly requirements: readonly string[];
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly expectedOutput: TaskExpectedOutput;
  readonly expectedVerification: {
    readonly verificationId: string;
    readonly commandOrCheck: string;
    readonly expectedStatus: TaskVerificationStatus;
  };
  readonly successRubric: readonly string[];
  readonly failureCategories: readonly TaskFailureCategory[];
  readonly redactionExpectations: readonly string[];
  readonly hostEvaluationCaseId: EvaluationCaseId;
  readonly setupEvaluationCaseIds?: readonly EvaluationCaseId[];
  readonly repairValidationEvidence?: TaskCaseDefinition["repairValidationEvidence"];
};

export function parseTaskLiveCatalog(value: unknown): TaskLiveCatalog {
  const object = objectValue(value, "catalog");
  const catalogId = stringValue(object.catalogId, "catalogId");
  const tasks = arrayValue(object.tasks, "tasks").map((entry, index) =>
    catalogTaskRecord(entry, `tasks[${index}]`)
  );
  const baseCases = new Map(listTaskCases().map((definition) => [definition.caseId, definition]));
  const entries = tasks.map((task) => taskLiveEntry(task));
  const caseDefinitions = tasks.map((task) => {
    const base = baseCases.get(task.baseCaseId);
    if (!base) throw new Error(`Catalog task ${task.caseId} references an unknown base task case`);
    return freeze({
      ...base,
      caseId: task.caseId,
      taskKind: task.taskKind,
      taskPath: task.taskPath,
      shortPrompt: task.shortPrompt,
      allowedTools: freeze([...task.allowedTools]),
      allowedWrites: freeze([...task.allowedWrites]),
      successRubric: freeze([...task.successRubric]),
      expectedVerification: freeze({
        ...task.expectedVerification,
        taskRelevant: true,
      }),
      expectedOutput: freeze({
        ...task.expectedOutput,
        requiredPaths: freeze([...task.expectedOutput.requiredPaths]),
      }),
      repairValidationEvidence: task.repairValidationEvidence,
      hostEvaluationCaseId: task.hostEvaluationCaseId,
      setupEvaluationCaseIds: task.setupEvaluationCaseIds
        ? freeze([...task.setupEvaluationCaseIds])
        : undefined,
      failureCategories: freeze([...task.failureCategories]),
      redactionExpectations: freeze([...task.redactionExpectations]),
      terminalSuccessClaim: false,
    } satisfies TaskCaseDefinition);
  });
  return freeze({
    catalogId,
    entries: freeze(entries),
    caseDefinitions: freeze(caseDefinitions),
  });
}

function catalogTaskRecord(value: unknown, label: string): CatalogTaskRecord {
  const object = objectValue(value, label);
  return freeze({
    entryId: catalogIdValue(object.entryId, `${label}.entryId`),
    caseId: catalogIdValue(object.caseId, `${label}.caseId`),
    baseCaseId: enumValue(object.baseCaseId, `${label}.baseCaseId`, builtinCaseIds()),
    entryKind: enumValue(object.entryKind, `${label}.entryKind`, [
      "write-edit",
      "write-repair",
      "write-rollback",
      "write-adjacent",
      "pathless-context",
      "report-artifact",
      "data-artifact",
      "continuation",
      "readonly-coding",
      "write-planning",
      "provider-triage",
    ] as const),
    taskKind: enumValue(object.taskKind, `${label}.taskKind`, [
      "coding-edit",
      "debug-repair",
      "workspace-understanding",
      "docs-report",
      "data-artifact",
      "continuation",
      "live-triage",
    ] as const),
    taskPath: enumValue(object.taskPath, `${label}.taskPath`, [
      "provider",
      "tool",
      "edit",
      "artifact",
      "continuation",
    ] as const),
    shortPrompt: stringValue(object.shortPrompt, `${label}.shortPrompt`),
    gate: enumValue(object.gate, `${label}.gate`, [
      "read-only-provider",
      "anchored-provider",
      "provider-readiness",
      "artifact-dry-run",
    ] as const),
    safetyClass: enumValue(object.safetyClass, `${label}.safetyClass`, [
      "safe-no-write",
      "manual-review",
      "unsafe",
      "unsupported",
    ] as const),
    writePolicy: enumValue(object.writePolicy, `${label}.writePolicy`, [
      "no-write",
      "dry-run-only",
      "manual-review-required",
      "unsupported",
    ] as const),
    validationPlan: stringValue(object.validationPlan, `${label}.validationPlan`),
    requirements: stringArrayValue(object.requirements, `${label}.requirements`),
    allowedTools: stringArrayValue(object.allowedTools, `${label}.allowedTools`),
    allowedWrites: stringArrayValue(object.allowedWrites, `${label}.allowedWrites`),
    expectedOutput: expectedOutputValue(object.expectedOutput, `${label}.expectedOutput`),
    expectedVerification: expectedVerificationValue(object.expectedVerification, `${label}.expectedVerification`),
    successRubric: stringArrayValue(object.successRubric, `${label}.successRubric`),
    failureCategories: failureCategoriesValue(object.failureCategories, `${label}.failureCategories`),
    redactionExpectations: stringArrayValue(object.redactionExpectations, `${label}.redactionExpectations`),
    hostEvaluationCaseId: enumValue(object.hostEvaluationCaseId, `${label}.hostEvaluationCaseId`, evaluationCaseIds()),
    setupEvaluationCaseIds: object.setupEvaluationCaseIds === undefined
      ? undefined
      : arrayValue(object.setupEvaluationCaseIds, `${label}.setupEvaluationCaseIds`).map((item, index) =>
        enumValue(item, `${label}.setupEvaluationCaseIds[${index}]`, evaluationCaseIds())
      ),
    repairValidationEvidence: repairValidationEvidenceValue(
      object.repairValidationEvidence,
      `${label}.repairValidationEvidence`,
    ),
  });
}

function taskLiveEntry(task: CatalogTaskRecord): TaskLiveEntry {
  return freeze({
    entryId: task.entryId,
    taskCaseId: task.caseId,
    entryKind: task.entryKind,
    shortPrompt: task.shortPrompt,
    gate: task.gate,
    safetyClass: task.safetyClass,
    writePolicy: task.writePolicy,
    validationPlan: task.validationPlan,
    expectedChangedFiles: freeze([...task.expectedOutput.requiredPaths]),
    requirements: freeze(unique([
      ...task.requirements,
      "explicit opt-in",
      "isolated runtime home",
      "redacted output",
    ])),
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

function expectedOutputValue(value: unknown, label: string): TaskExpectedOutput {
  const object = objectValue(value, label);
  return freeze({
    kind: enumValue(object.kind, `${label}.kind`, ["diff", "artifact", "analysis", "continuation"] as const),
    summary: stringValue(object.summary, `${label}.summary`),
    requiredPaths: stringArrayValue(object.requiredPaths, `${label}.requiredPaths`),
  });
}

function expectedVerificationValue(
  value: unknown,
  label: string,
): CatalogTaskRecord["expectedVerification"] {
  const object = objectValue(value, label);
  return freeze({
    verificationId: stringValue(object.verificationId, `${label}.verificationId`),
    commandOrCheck: stringValue(object.commandOrCheck, `${label}.commandOrCheck`),
    expectedStatus: enumValue(object.expectedStatus, `${label}.expectedStatus`, [
      "passed",
      "partial",
      "failed",
      "blocked",
      "skipped",
      "not-run",
    ] as const),
  });
}

function repairValidationEvidenceValue(
  value: unknown,
  label: string,
): TaskCaseDefinition["repairValidationEvidence"] | undefined {
  if (value === undefined) return undefined;
  const object = objectValue(value, label);
  const originalFailurePreserved = object.originalFailurePreserved;
  if (originalFailurePreserved !== true) {
    throw new Error(`${label}.originalFailurePreserved must be true`);
  }
  return freeze({
    status: enumValue(object.status, `${label}.status`, ["passed", "partial", "failed", "not-run"] as const),
    check: stringValue(object.check, `${label}.check`),
    originalFailurePreserved: true,
  });
}

function failureCategoriesValue(value: unknown, label: string): readonly TaskFailureCategory[] {
  return arrayValue(value, label).map((item, index) =>
    enumValue(item, `${label}[${index}]`, [
      "goal unclear",
      "missing user input",
      "context not found",
      "wrong context selected",
      "context insufficient",
      "planning weak",
      "tool strategy weak",
      "provider output insufficient",
      "provider failure",
      "edit failure",
      "verification not selected",
      "verification failed",
      "repair failed",
      "artifact invalid",
      "continuation stale",
      "completion proof missing",
      "authority missing",
      "unsupported capability",
      "environment issue",
      "redaction or safety block",
      "unknown",
    ] as const)
  );
}

function builtinCaseIds(): readonly BuiltinTaskCaseId[] {
  return listTaskCases().map((definition) => definition.caseId as BuiltinTaskCaseId);
}

function evaluationCaseIds(): readonly EvaluationCaseId[] {
  return [
    "read-only-tool-loop",
    "parallel-tool-happy",
    "parallel-tool-dependency",
    "parallel-tool-blocked",
    "parallel-tool-partial-failure",
    "provider-blocked",
    "provider-compatibility-happy",
    "provider-readiness-blocked",
    "provider-fallback",
    "provider-fallback-failed",
    "provider-redaction",
    "optional-live-gate-skipped",
    "unsupported-provider-mode",
    "multi-target-mutation-success",
    "mutation-recovery-success",
    "apply-only-negative",
    "branch-compaction-continuation",
    "missing-proof",
  ];
}

function catalogIdValue(value: unknown, label: string): `catalog-${string}` {
  const text = stringValue(value, label);
  if (!/^catalog-[a-z0-9][a-z0-9-]*$/.test(text)) {
    throw new Error(`${label} must start with catalog- and use lowercase domain text`);
  }
  return text as `catalog-${string}`;
}

function stringArrayValue(value: unknown, label: string): readonly string[] {
  return freeze(arrayValue(value, label).map((item, index) => stringValue(item, `${label}[${index}]`)));
}

function enumValue<const T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  const text = stringValue(value, label);
  if (!allowed.includes(text as T)) {
    throw new Error(`${label} has unsupported value`);
  }
  return text as T;
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
