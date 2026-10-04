import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createProjectMemoryLocalStore } from "../projectMemoryLocalStore.js";
import type { ProjectMemoryRecord } from "../projectMemoryStoreContract.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const mocked = { ...actual, writeFileSync: vi.fn(actual.writeFileSync), renameSync: vi.fn(actual.renameSync), openSync: vi.fn(actual.openSync) };
  return { ...mocked, default: mocked };
});
const nativeFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const roots: string[] = [];
const record: ProjectMemoryRecord = {
  id: "one", version: 1, createdAt: "2026-10-04", candidateId: "candidate",
  candidateKind: "project-fact", retentionClass: "project-scoped-candidate",
  approvedAt: "2026-10-04", approvedBySourceCommand: "/memory", memoryText: "Keep checked facts.",
  evidence: ["checked"], source: "system-derived", routeReferences: [], safety: "safe", redactions: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(fs.writeFileSync).mockReset().mockImplementation(nativeFs.writeFileSync);
  vi.mocked(fs.renameSync).mockReset().mockImplementation(nativeFs.renameSync);
  vi.mocked(fs.openSync).mockReset().mockImplementation(nativeFs.openSync);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-transaction-"));
  roots.push(root);
  const file = path.join(root, "project-memory.jsonl");
  const content = [record, { ...record, id: "two", memoryText: "Keep the second fact." }].map(value => JSON.stringify(value)).join("\n") + "\n";
  fs.writeFileSync(file, content, { mode: 0o600 });
  return { root, file, content, store: createProjectMemoryLocalStore({ ref: { mode: "test-only", root } }) };
}

it("preserves every record when a delete write fails after writing a prefix", async () => {
  const { file, content, root, store } = setup();
  const write = nativeFs.writeFileSync;
  vi.mocked(fs.writeFileSync).mockImplementation(((target: fs.PathOrFileDescriptor, data: string, ...args: unknown[]) => {
    if (typeof data === "string" && data.includes("project-memory-lifecycle")) {
      Reflect.apply(write, fs, [target, data.slice(0, 15), ...args]);
      throw Object.assign(new Error("storage full"), { code: "ENOSPC" });
    }
    return Reflect.apply(write, fs, [target, data, ...args]);
  }) as typeof fs.writeFileSync);
  const result = await store.delete!({ recordId: "one", deletedAt: "2026-10-04", sourceCommand: "/memory" });
  expect(result).toMatchObject({ deleted: false, skipped: false });
  expect(result.blocker).toContain("storage full");
  expect(fs.readFileSync(file, "utf8")).toBe(content);
  expect(fs.readdirSync(root)).toEqual(["project-memory.jsonl"]);
});

it("preserves the live store when replacement fails and releases the lock", async () => {
  const { file, content, root, store } = setup();
  vi.mocked(fs.renameSync).mockImplementation(() => { throw Object.assign(new Error("replacement failed"), { code: "EIO" }); });
  const result = await store.delete!({ recordId: "one", deletedAt: "2026-10-04", sourceCommand: "/memory" });
  expect(result.deleted).toBe(false);
  expect(fs.readFileSync(file, "utf8")).toBe(content);
  expect(fs.readdirSync(root)).toEqual(["project-memory.jsonl"]);
  vi.mocked(fs.renameSync).mockImplementation(nativeFs.renameSync);
  expect((await store.delete!({ recordId: "one", deletedAt: "2026-10-04", sourceCommand: "/memory" })).deleted).toBe(true);
  expect((await store.list()).records.map(value => value.id)).toEqual(["two"]);
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});

it.each(["write", "invalidate", "delete"] as const)("refuses %s while another holder owns the store lock", async operation => {
  const { file, content, store } = setup();
  const lock = file + ".lock";
  const owner = JSON.stringify({ token: "existing-owner", pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString() });
  fs.writeFileSync(lock, owner);
  vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(2000);
  const result = operation === "write"
    ? await store.write({ record: { ...record, id: "three" }, storeRef: store.ref })
    : operation === "invalidate"
      ? await store.invalidate!({ recordId: "one", invalidatedAt: "2026-10-04", sourceCommand: "/memory" })
      : await store.delete!({ recordId: "one", deletedAt: "2026-10-04", sourceCommand: "/memory" });
  expect(result).toMatchObject({ skipped: false });
  expect(result.blocker).toMatch(/lock timeout/);
  expect(fs.readFileSync(file, "utf8")).toBe(content);
  expect(fs.readFileSync(lock, "utf8")).toBe(owner);
});

it("uses the same target lock through an explicit records-file symlink", async () => {
  const { root, file, content } = setup();
  const alias = path.join(root, "alias.jsonl");
  fs.symlinkSync(file, alias);
  const owner = JSON.stringify({ token: "existing-owner", pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString() });
  fs.writeFileSync(file + ".lock", owner);
  const store = createProjectMemoryLocalStore({ ref: { mode: "test-only", root, recordsFile: alias } });
  vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(2000);
  expect((await store.delete!({ recordId: "one", deletedAt: "2026-10-04", sourceCommand: "/memory" })).deleted).toBe(false);
  expect(fs.readFileSync(file, "utf8")).toBe(content);
  expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
  vi.restoreAllMocks();
  fs.unlinkSync(file + ".lock");
  expect((await store.delete!({ recordId: "one", deletedAt: "2026-10-04", sourceCommand: "/memory" })).deleted).toBe(true);
  expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
  expect((await store.list()).records.map(value => value.id)).toEqual(["two"]);
});

it("reads under the lock so a preceding writer's record survives deletion", async () => {
  const { file, store } = setup();
  vi.mocked(fs.openSync).mockImplementation((...args: Parameters<typeof fs.openSync>) => {
    const fd = nativeFs.openSync(...args);
    if (args[0] === file + ".lock") {
      nativeFs.appendFileSync(file, `${JSON.stringify({ ...record, id: "three" })}\n`);
    }
    return fd;
  });
  expect((await store.delete!({ recordId: "one", deletedAt: "today", sourceCommand: "/memory" })).deleted).toBe(true);
  expect((await store.list()).records.map(value => value.id)).toEqual(["two", "three"]);
});

it("preserves dangling aliases and creates private ordinary stores", async () => {
  const { root } = setup();
  const file = path.join(root, "missing", "records.jsonl");
  const alias = path.join(root, "dangling.jsonl");
  fs.symlinkSync(file, alias);
  const dangling = createProjectMemoryLocalStore({ ref: { mode: "test-only", root, recordsFile: alias } });
  expect((await dangling.write({ record, storeRef: dangling.ref })).written).toBe(false);
  expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
  expect(fs.existsSync(file)).toBe(false);
  const store = createProjectMemoryLocalStore({ ref: { mode: "test-only", root, recordsFile: file } });
  expect((await store.write({ record, storeRef: store.ref })).written).toBe(true);
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
});
