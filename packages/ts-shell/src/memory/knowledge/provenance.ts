import { createHash } from "node:crypto";
import type { ProjectMemoryRecord } from "../projectMemoryStoreContract.js";

export interface MemoryInjectionProvenance {
  readonly version: 1;
  readonly contextHash: string;
  readonly context: string;
  readonly records: readonly {
    readonly id: string;
    readonly source: string;
    readonly createdAt: string;
    readonly approvedAt: string;
  }[];
}

export function injectionProvenance(context: string, records: readonly ProjectMemoryRecord[], selectedIds: readonly string[]): MemoryInjectionProvenance {
  return { version: 1, context, contextHash: createHash("sha256").update(context).digest("hex"),
    records: records.filter((record) => selectedIds.includes(record.id)).map((record) => ({
      id: record.id, source: record.source, createdAt: record.createdAt, approvedAt: record.approvedAt,
    })) };
}
