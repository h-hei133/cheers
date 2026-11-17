import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { writeSessionMetadataRecord } from "./sessionStore.js";
import { writeSessionRegistryStore } from "./currentSessionRegistry.js";
import { writeJsonFileAtomic, writeTextFileAtomic } from "./sessionFileStore.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, renameSync: vi.fn(actual.renameSync), fsyncSync: vi.fn(actual.fsyncSync), rmSync: vi.fn(actual.rmSync) };
});
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const roots: string[] = [];
afterEach(() => {
  vi.mocked(fs.renameSync).mockReset().mockImplementation(actualFs.renameSync);
  vi.mocked(fs.fsyncSync).mockReset().mockImplementation(actualFs.fsyncSync);
  vi.mocked(fs.rmSync).mockReset().mockImplementation(actualFs.rmSync);
  for (const root of roots.splice(0)) actualFs.rmSync(root, { recursive: true, force: true });
});

const writers = {
  metadata: (file: string) => writeSessionMetadataRecord({ layout: { metadataPath: file, stateLockPath: `${file}.state.lock` }, session: {
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

function previousFile(): { root: string; file: string } {
  fs.mkdirSync("/tmp/cheers-test", { recursive: true });
  const root = fs.mkdtempSync("/tmp/cheers-test/atomic-guard-"); roots.push(root);
  const file = path.join(root, "state.json");
  fs.writeFileSync(file, '{"previous":true}');
  return { root, file };
}

it("refuses after staging fsync without retrying a transient-shaped guard error", () => {
  const { root, file } = previousFile();
  let flushed = false;
  vi.mocked(fs.fsyncSync).mockImplementationOnce(fd => { actualFs.fsyncSync(fd); flushed = true; });
  const refusal = Object.assign(new Error("publication retired"), { code: "EBUSY" });
  const beforeRename = vi.fn(() => { expect(flushed).toBe(true); throw refusal; });
  const onRenameStart = vi.fn(), onRenameSuccess = vi.fn();
  expect(() => writeTextFileAtomic(file, '{"next":true}', undefined, { beforeRename, onRenameStart, onRenameSuccess }))
    .toThrow(refusal);
  expect(beforeRename).toHaveBeenCalledTimes(1);
  expect(fs.renameSync).not.toHaveBeenCalled();
  expect(onRenameStart).not.toHaveBeenCalled();
  expect(onRenameSuccess).not.toHaveBeenCalled();
  expect(fs.readFileSync(file, "utf8")).toBe('{"previous":true}');
  expect(fs.readdirSync(root)).toEqual(["state.json"]);
});

it("rechecks admission after EBUSY and refuses before a second rename", () => {
  const { root, file } = previousFile();
  const events: string[] = [];
  let attempted = false;
  vi.mocked(fs.renameSync).mockImplementationOnce(() => {
    attempted = true;
    throw Object.assign(new Error("busy destination"), { code: "EBUSY" });
  });
  const refusal = Object.assign(new Error("admission changed"), { code: "EBUSY" });
  const beforeRename = vi.fn(() => { events.push("guard"); if (attempted) throw refusal; });
  const onRenameStart = vi.fn(() => { events.push("start"); }), onRenameSuccess = vi.fn();
  const onRenameError = vi.fn((error: unknown) => {
    expect(error).toMatchObject({ code: "EBUSY" });
    events.push("error");
  });
  expect(() => writeTextFileAtomic(file, '{"next":true}', undefined, { beforeRename, onRenameStart, onRenameSuccess, onRenameError }))
    .toThrow(refusal);
  expect(beforeRename).toHaveBeenCalledTimes(2);
  expect(fs.renameSync).toHaveBeenCalledTimes(1);
  expect(onRenameStart).toHaveBeenCalledTimes(1);
  expect(onRenameSuccess).not.toHaveBeenCalled();
  expect(onRenameError).toHaveBeenCalledTimes(1);
  expect(events).toEqual(["guard", "start", "error", "guard"]);
  expect(fs.readFileSync(file, "utf8")).toBe('{"previous":true}');
  expect(fs.readdirSync(root)).toEqual(["state.json"]);
});

it("records an attempted but unconfirmed rename when the real effect precedes an exception", () => {
  const { root, file } = previousFile();
  const failure = Object.assign(new Error("rename completion unknown"), { code: "EIO" });
  let started = false;
  vi.mocked(fs.renameSync).mockImplementationOnce((source, target) => {
    expect(started).toBe(true);
    actualFs.renameSync(source, target);
    throw failure;
  });
  const onRenameStart = vi.fn(() => { started = true; });
  const onRenameSuccess = vi.fn();
  const onRenameError = vi.fn((error: unknown) => {
    expect(error).toBe(failure);
    throw Object.assign(new Error("observer failed"), { code: "EBUSY" });
  });
  expect(() => writeTextFileAtomic(file, '{"next":true}', undefined, { onRenameStart, onRenameSuccess, onRenameError })).toThrow(failure);
  expect(onRenameStart).toHaveBeenCalledTimes(1);
  expect(onRenameSuccess).not.toHaveBeenCalled();
  expect(onRenameError).toHaveBeenCalledTimes(1);
  expect(fs.renameSync).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(file, "utf8")).toBe('{"next":true}');
  expect(fs.readdirSync(root)).toEqual(["state.json"]);
});

it("retains confirmed publication when cleanup of a reappeared staging file fails", () => {
  const { file } = previousFile();
  let staging: string | undefined, confirmed = false;
  vi.mocked(fs.renameSync).mockImplementationOnce((source, target) => {
    actualFs.renameSync(source, target);
    staging = String(source);
  });
  const cleanupFailure = Object.assign(new Error("staging cleanup failed"), { code: "EIO" });
  vi.mocked(fs.rmSync).mockImplementation((target, options) => {
    if (target === staging) throw cleanupFailure;
    actualFs.rmSync(target, options);
  });
  const onRenameStart = vi.fn();
  const onRenameSuccess = vi.fn(() => {
    confirmed = true;
    expect(fs.readFileSync(file, "utf8")).toBe('{"next":true}');
    // A real file reappears at the old staging name before finally removes residue.
    actualFs.writeFileSync(staging!, "external residue");
  });
  expect(() => writeTextFileAtomic(file, '{"next":true}', undefined, { onRenameStart, onRenameSuccess })).toThrow(cleanupFailure);
  expect(confirmed).toBe(true);
  expect(onRenameStart).toHaveBeenCalledTimes(1);
  expect(onRenameSuccess).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(file, "utf8")).toBe('{"next":true}');
  expect(fs.readFileSync(staging!, "utf8")).toBe("external residue");
});

it.each(["start", "success"] as const)("does not replay rename when its %s callback throws a transient-shaped error", phase => {
  const { root, file } = previousFile();
  const failure = Object.assign(new Error("callback failed"), { code: "EBUSY" });
  const onRenameStart = vi.fn(() => { if (phase === "start") throw failure; });
  const onRenameSuccess = vi.fn(() => { if (phase === "success") throw failure; });
  const onRenameError = vi.fn();
  expect(() => writeTextFileAtomic(file, '{"next":true}', undefined, { onRenameStart, onRenameSuccess, onRenameError })).toThrow(failure);
  expect(onRenameStart).toHaveBeenCalledTimes(1);
  expect(onRenameSuccess).toHaveBeenCalledTimes(phase === "success" ? 1 : 0);
  expect(fs.renameSync).toHaveBeenCalledTimes(phase === "success" ? 1 : 0);
  expect(onRenameError).not.toHaveBeenCalled();
  expect(fs.readFileSync(file, "utf8")).toBe(phase === "success" ? '{"next":true}' : '{"previous":true}');
  expect(fs.readdirSync(root)).toEqual(["state.json"]);
});
