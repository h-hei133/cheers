import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveAllUserDataFiles,
  resolveUserDataFile,
  userDataDir,
  userDataSearchDirs,
} from "./userHome.js";

describe("user data location", () => {
  let home: string;
  const originalHome = process.env.HOME;
  const originalProfile = process.env.USERPROFILE;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "user-home-"));
    process.env.HOME = home;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalProfile !== undefined) process.env.USERPROFILE = originalProfile;
    fs.rmSync(home, { recursive: true, force: true });
  });

  /** Put a file in one of the directories this module knows about. */
  function write(directoryName: string, relativePath: string): string {
    const target = path.join(home, directoryName, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "x", "utf8");
    return target;
  }

  it("writes to the current directory even when an older one exists", () => {
    // Otherwise state keeps accumulating in a location that is only ever read.
    write(".private-agents", "config.json");

    expect(userDataDir()).toBe(path.join(home, ".cheers"));
  });

  it("reads from the current directory when the file is there", () => {
    const current = write(".cheers", "config.json");
    write(".private-agents", "config.json");

    expect(resolveUserDataFile("config.json")).toBe(current);
  });

  it("reads from the older directory when the current one does not have it", () => {
    // The whole point: someone who already has settings, skills and trust
    // decisions keeps them without re-authoring anything.
    const legacy = write(".private-agents", "config.json");

    expect(resolveUserDataFile("config.json")).toBe(legacy);
  });

  it("finds state that lived under the name this one replaced", () => {
    // Sessions, teams and tasks: the state a user already has keeps being read.
    const previous = write(".cheer", "current-session.json");

    expect(resolveUserDataFile("current-session.json")).toBe(previous);
  });

  it("finds state that lived under the oldest name", () => {
    const oldest = write(".coding-agents", "trust.json");

    expect(resolveUserDataFile("trust.json")).toBe(oldest);
  });

  it("prefers the newer of two older directories", () => {
    write(".private-agents", "config.json");
    const newer = write(".cheer", "config.json");

    expect(resolveUserDataFile("config.json")).toBe(newer);
  });

  it("returns a path under the current directory when no directory has the file", () => {
    // The answer has to be somewhere a caller can create the file, and creating
    // it in an old directory would put new state where nothing looks for it.
    expect(resolveUserDataFile("config.json")).toBe(path.join(home, ".cheers", "config.json"));
  });

  it("reports every existing copy for callers that merge rather than choose", () => {
    // A user skill directory in an older location is additional, not superseded:
    // a listing that read only one would hide half of what the user wrote.
    const older = write(".private-agents", "skills");
    const newer = write(".cheers", "skills");

    expect(resolveAllUserDataFiles("skills")).toEqual([newer, older]);
  });

  it("orders the search newest first", () => {
    expect(userDataSearchDirs()).toEqual([
      path.join(home, ".cheers"),
      path.join(home, ".cheer"),
      path.join(home, ".private-agents"),
      path.join(home, ".coding-agents"),
    ]);
  });
});
