import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createProjectMemoryLocalStore } from "./projectMemoryLocalStore.js";
import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";
import { runProjectMemoryRecallCommand } from "./projectMemoryRecallCommandRunner.js";
import { normalizeProjectMemoryRecallCommandRequest } from "./projectMemoryRecallCommandContract.js";
import { runProjectMemoryUseCommand } from "./projectMemoryUseCommandRunner.js";
import { normalizeProjectMemoryUseCommandRequest } from "./projectMemoryUseCommandContract.js";
import { createProjectMemoryInjectionStateStore } from "./projectMemoryInjectionState.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const record: ProjectMemoryRecord = {
  id: "one", version: 1, createdAt: "2026-09-30", candidateId: "candidate",
  candidateKind: "project-fact", retentionClass: "project-scoped-candidate",
  approvedAt: "2026-09-30", approvedBySourceCommand: "/memory", memoryText: "Project uses strict validation.",
  evidence: [], source: "system-derived", routeReferences: [], safety: "safe", redactions: [],
};
function setup(content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-read-"));
  roots.push(root);
  const file = path.join(root, "project-memory.jsonl");
  fs.writeFileSync(file, content);
  const store = createProjectMemoryLocalStore({ ref: { mode: "test-only", root } });
  return { file, store };
}

it.each([
  { safety: "unsafe " },
  { safety: "unsafe" },
  { candidateKind: "unknown-kind" },
  { candidateKind: "__proto__" },
  { retentionClass: "unknown-retention" },
  { source: "unknown-source" },
  { invalidatedBySourceCommand: "/unrecognized" },
])("rejects invalid record policy values %j while retaining valid lines", async policy => {
  const content = `${JSON.stringify(record)}\n${JSON.stringify({ ...record, id: "two", ...policy })}\n`;
  const { file, store } = setup(content);
  expect((await store.list()).records.map(entry => entry.id)).toEqual(["one"]);
  expect(await store.health()).toMatchObject({ readable: true, writable: false, ok: false, recordCount: 1 });
  expect((await store.write({ record: { ...record, id: "three" }, storeRef: store.ref })).written).toBe(false);
  expect(fs.readFileSync(file, "utf8")).toBe(content);
});

it.each([{ safety: "unsafe " }, { candidateKind: "unknown-kind" }, { evidence: null }])(
  "refuses invalid records at the write boundary: %j", async invalid => {
    const content = `${JSON.stringify(record)}\n`;
    const { file, store } = setup(content);
    const result = await store.write({ record: { ...record, id: "two", ...invalid } as ProjectMemoryRecord, storeRef: store.ref });
    expect(result).toMatchObject({ written: false, skipped: false });
    expect(result.evidence).toContain("project-memory-local-store:invalid-record");
    expect(fs.readFileSync(file, "utf8")).toBe(content);
  },
);

it.each(["NOT_JSON", "null", "[]", "{}", '{"id":'])
  ("recovers valid lines around %s and preserves bytes for every mutation", async (bad) => {
    const content = `${JSON.stringify(record)}\n${bad}\n${JSON.stringify({ ...record, id: "two" })}\n{`;
    const { file, store } = setup(content);
    expect((await store.list()).records.map((entry) => entry.id)).toEqual(["one", "two"]);
    expect((await store.list()).diagnostics).toEqual([
      "Memory store line 2 is invalid; changes are blocked.", "Memory store line 4 is invalid; changes are blocked.",
    ]);
    expect(await store.health()).toMatchObject({ readable: true, writable: false, ok: false, recordCount: 2 });
    expect(await store.write({ record: { ...record, id: "three" }, storeRef: store.ref })).toMatchObject({ written: false, skipped: false });
    expect(await store.invalidate!({ recordId: "one", invalidatedAt: "today", sourceCommand: "/memory" })).toMatchObject({ invalidated: false });
    expect(await store.delete!({ recordId: "one", deletedAt: "today", sourceCommand: "/memory" })).toMatchObject({ deleted: false });
    expect(fs.readFileSync(file, "utf8")).toBe(content);
  });

it("allows explicit recall and use of surviving records and shows diagnostics", async () => {
  const { store } = setup(`${JSON.stringify(record)}\nBROKEN\n`);
  const recalled = await runProjectMemoryRecallCommand({ memoryStore: store,
    request: normalizeProjectMemoryRecallCommandRequest({ mode: "recall", query: "validation" }) });
  expect(recalled.outcome).toBe("recalled");
  expect(recalled.output).toContain(record.memoryText);
  expect(recalled.output).toContain("line 2 is invalid");
  const staged = await runProjectMemoryUseCommand({ memoryStore: store, sessionScopeId: "test",
    injectionStateStore: createProjectMemoryInjectionStateStore(),
    request: normalizeProjectMemoryUseCommandRequest({ mode: "recall", query: "validation" }) });
  expect(staged.outcome).toBe("staged");
  expect(staged.state.recordIds).toEqual(["one"]);
  expect(staged.output).toContain("line 2 is invalid");
});

it("separates an intact final line before appending or invalidating", async () => {
  const { file, store } = setup(JSON.stringify(record));
  expect((await store.write({ record: { ...record, id: "two" }, storeRef: store.ref })).written).toBe(true);
  expect((await store.list()).records).toHaveLength(2);
  fs.writeFileSync(file, JSON.stringify(record));
  expect((await store.invalidate!({ recordId: "one", invalidatedAt: "today", sourceCommand: "/memory" })).invalidated).toBe(true);
  expect((await store.list()).records).toEqual([]);
  expect((await store.list({ includeInvalidated: true })).records[0]?.invalidatedAt).toBe("today");
});

it("reports an unreadable store and blocks mutations without altering bytes", async () => {
  const content = `${JSON.stringify(record)}\n`;
  const { file, store } = setup(content);
  const read = fs.readFileSync;
  vi.spyOn(fs, "readFileSync").mockImplementation(((name: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    if (name === file) throw Object.assign(new Error("read failed"), { code: "EACCES" });
    return Reflect.apply(read, fs, [name, ...args]);
  }) as typeof fs.readFileSync);
  expect(await store.health()).toMatchObject({ readable: false, writable: false, ok: false });
  expect((await store.list()).diagnostics).toHaveLength(1);
  expect((await store.write({ record, storeRef: store.ref })).written).toBe(false);
  expect((await store.delete!({ recordId: "one", deletedAt: "today", sourceCommand: "/memory" })).deleted).toBe(false);
  expect((await store.invalidate!({ recordId: "one", invalidatedAt: "today", sourceCommand: "/memory" })).invalidated).toBe(false);
  vi.restoreAllMocks();
  expect(fs.readFileSync(file, "utf8")).toBe(content);
});

it("returns a blocked write when the append fails after a successful read", async () => {
  const content = `${JSON.stringify(record)}\n`;
  const { file, store } = setup(content);
  vi.spyOn(fs, "appendFileSync").mockImplementation(() => { throw Object.assign(new Error("permission denied"), { code: "EACCES" }); });
  const result = await store.write({ record: { ...record, id: "two" }, storeRef: store.ref });
  expect(result).toMatchObject({ written: false, skipped: false });
  expect(result.blocker).toContain("permission denied");
  expect(result.evidence).toContain("project-memory-local-store:write-unavailable");
  expect(fs.readFileSync(file, "utf8")).toBe(content);
});
