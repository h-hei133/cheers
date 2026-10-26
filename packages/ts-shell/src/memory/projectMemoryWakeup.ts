import type {
  ProjectMemoryRecord,
  ProjectMemoryReader,
  ProjectMemoryReadOptions,
} from "./projectMemoryStoreContract.js";
import { compareMemoryRecordRecency } from "./projectMemoryRetrieval.js";
import { memoryRecordIsInjectable } from "./memoryValidation.js";

export interface ProjectMemoryWakeupSection {
  readonly title: string;
  readonly records: readonly ProjectMemoryRecord[];
}

export interface ProjectMemoryWakeupPreview {
  readonly l0: ProjectMemoryWakeupSection;
  readonly l1: ProjectMemoryWakeupSection;
  readonly totalRecords: number;
  readonly autoInjected: false;
  readonly startupCache: "not-enabled";
  readonly providerCall: "none";
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

const MAX_L0_RECORDS = 5;
const MAX_L1_RECORDS = 8;

export async function buildProjectMemoryWakeupPreview(
  store: ProjectMemoryReader,
  readOptions?: ProjectMemoryReadOptions,
): Promise<ProjectMemoryWakeupPreview> {
  const list = await store.list(readOptions ? { readOptions } : undefined);
  const records = list.records.filter(memoryRecordIsInjectable);
  const l0 = records
    .filter(isL0Record)
    .sort(compareWakeRecords)
    .slice(0, MAX_L0_RECORDS);
  const l1 = records
    .filter(isL1Record)
    .sort(compareWakeRecords)
    .slice(0, MAX_L1_RECORDS);
  return {
    l0: {
      title: "L0-like stable project facts and explicit preferences",
      records: l0,
    },
    l1: {
      title: "L1-like essential project story",
      records: l1,
    },
    totalRecords: list.records.length,
    autoInjected: false,
    startupCache: "not-enabled",
    providerCall: "none",
    warnings: [
      "project-memory-wakeup:preview-only",
      "project-memory-wakeup:auto-injection-disabled",
    ],
    evidence: [
      ...list.evidence,
      "project-memory-wakeup:deterministic-preview",
      "project-memory-wakeup:no-provider-call",
      "project-memory-wakeup:no-persistence-write",
      "project-memory-wakeup:no-auto-injection",
    ],
  };
}

function isL0Record(record: ProjectMemoryRecord): boolean {
  return (
    record.retentionClass === "user-memory-candidate" ||
    record.candidateKind === "project-fact" ||
    record.candidateKind === "project-structure"
  );
}

function isL1Record(record: ProjectMemoryRecord): boolean {
  return (
    record.candidateKind === "route-decision" ||
    record.candidateKind === "capability-state" ||
    record.candidateKind === "blocked-by-design-decision" ||
    record.candidateKind === "validation-pattern" ||
    record.candidateKind === "restore/recovery-boundary"
  );
}

function compareWakeRecords(left: ProjectMemoryRecord, right: ProjectMemoryRecord): number {
  const priority = wakePriority(right) - wakePriority(left);
  if (priority !== 0) {
    return priority;
  }
  return compareMemoryRecordRecency(left, right);
}

function wakePriority(record: ProjectMemoryRecord): number {
  switch (record.candidateKind) {
    case "user-preference-candidate":
      return 10;
    case "project-fact":
      return 9;
    case "project-structure":
      return 8;
    case "capability-state":
      return 7;
    case "blocked-by-design-decision":
      return 6;
    case "route-decision":
      return 5;
    case "validation-pattern":
      return 4;
    case "restore/recovery-boundary":
      return 3;
    default:
      return 1;
  }
}
