import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectRootOf, projectStatePath, readProjectState, writeProjectState } from "./projectState.js";

let home: string;
let workspace: string;
let realHome: string | undefined;
let realProfile: string | undefined;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "project-state-home-"));
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "project-state-work-"));
  fs.mkdirSync(path.join(workspace, ".git"), { recursive: true });
  realHome = process.env.HOME;
  realProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  delete process.env.USERPROFILE;
});

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  if (realProfile !== undefined) process.env.USERPROFILE = realProfile;
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
});

describe("state that outlives the process", () => {
  it("reads back what a previous run wrote, which is the whole point", () => {
    writeProjectState(workspace, {
      goal: { objective: "ship the reader", phase: "active", updatedAt: "2026-09-03T00:00:00.000Z" },
    });

    expect(readProjectState(workspace).goal?.objective).toBe("ship the reader");
  });

  it("merges rather than replaces, so two commands do not overwrite each other", () => {
    writeProjectState(workspace, { fastSampling: true });
    writeProjectState(workspace, {
      goal: { objective: "keep both", phase: "active", updatedAt: "" },
    });

    const state = readProjectState(workspace);
    expect(state.fastSampling).toBe(true);
    expect(state.goal?.objective).toBe("keep both");
  });

  it("shares one file across subdirectories of the same project", () => {
    const nested = path.join(workspace, "packages", "inner");
    fs.mkdirSync(nested, { recursive: true });
    writeProjectState(nested, { fastSampling: true });

    expect(projectRootOf(nested)).toBe(fs.realpathSync(workspace));
    expect(readProjectState(workspace).fastSampling).toBe(true);
  });

  it("keeps two projects apart even when they share a name", () => {
    const twin = fs.mkdtempSync(path.join(os.tmpdir(), "twin-"));
    const left = path.join(twin, "a", path.basename(workspace));
    const right = path.join(twin, "b", path.basename(workspace));
    for (const dir of [left, right]) fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    writeProjectState(left, { fastSampling: true });

    expect(projectStatePath(left)).not.toBe(projectStatePath(right));
    expect(readProjectState(right).fastSampling).toBeUndefined();
    fs.rmSync(twin, { recursive: true, force: true });
  });

  it("reads a truncated file as nothing recorded rather than throwing", () => {
    const target = projectStatePath(workspace);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{"goal": {"objective"', "utf8");

    expect(readProjectState(workspace)).toEqual({});
  });

  it("ignores a goal whose shape it does not recognise", () => {
    const target = projectStatePath(workspace);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ goal: { objective: "x", phase: "invented" } }), "utf8");

    expect(readProjectState(workspace).goal).toBeUndefined();
  });

  it("clears a goal by recording that there is none", () => {
    writeProjectState(workspace, { goal: { objective: "gone soon", phase: "active", updatedAt: "" } });
    writeProjectState(workspace, { goal: null });

    expect(readProjectState(workspace).goal ?? null).toBeNull();
  });

  it("says nothing was written when the home cannot be written to", () => {
    process.env.HOME = path.join(home, "not-a-dir", "\0invalid");

    expect(writeProjectState(workspace, { fastSampling: true })).toBeUndefined();
  });
});
