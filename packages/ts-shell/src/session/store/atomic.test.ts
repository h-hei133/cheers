import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { writeSessionMetadataRecord } from "./sessionStore.js";
import { writeSessionRegistryStore } from "./currentSessionRegistry.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, renameSync: vi.fn(actual.renameSync), fsyncSync: vi.fn(actual.fsyncSync) };
});
const roots: string[] = [];
afterEach(() => { vi.mocked(fs.renameSync).mockClear(); vi.mocked(fs.fsyncSync).mockClear(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const writers = {
  metadata: (file: string) => writeSessionMetadataRecord({ layout: { metadataPath: file }, session: {
    id: "saved", projectRoot: "/workspace", status: "active", createdAt: "today", updatedAt: "today", turns: [],
  } }),
  registry: (file: string) => writeSessionRegistryStore({ storePath: file, store: { schemaVersion: 1, byProjectRoot: {} } }),
  snapshot: (file: string) => writeJsonFileAtomic(file, { status: "active" }),
};

it.each(Object.entries(writers))("%s retains the previous JSON if publication keeps failing", (_name, write) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-atomic-")); roots.push(root);
  const file = path.join(root, "state.json");
  fs.writeFileSync(file, '{"previous":true}');
  const fail = () => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); };
  for (let attempt = 0; attempt < 6; attempt++) vi.mocked(fs.renameSync).mockImplementationOnce(fail);
  expect(() => write(file)).toThrow("busy");
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ previous: true });
  expect(fs.readdirSync(root)).toEqual(["state.json"]);
});

it("cleans staging on flush failure and publishes after a transient rename failure", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-atomic-")); roots.push(root);
  const file = path.join(root, "state.json");
  fs.writeFileSync(file, '{"previous":true}');
  vi.mocked(fs.fsyncSync).mockImplementationOnce(() => { throw new Error("flush failed"); });
  expect(() => writeJsonFileAtomic(file, { next: true })).toThrow("flush failed");
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ previous: true });
  expect(fs.readdirSync(root)).toEqual(["state.json"]);
  vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); });
  writeJsonFileAtomic(file, { next: true });
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ next: true });
  expect(fs.readdirSync(root)).toEqual(["state.json"]);
});
