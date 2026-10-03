import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../SessionManager.js";
import { SessionStoreAccess } from "../store/sessionStoreAccess.js";

describe("continuity observation inputs", () => {
  let home: string;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-observation-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("repairs the prompt from the session already loaded for this snapshot", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.markRunStarted(session.id, "observed pending prompt");
    manager.markTurnActive(session.id);
    manager.saveInterrupted(session.id, "turn");
    const observed = manager.getSession(session.id)!;
    const load = vi.spyOn(SessionStoreAccess.prototype, "load")
      .mockReturnValue({ ...observed, pendingPrompt: "later pending prompt" })
      .mockReturnValueOnce(observed);
    expect(manager.buildContinuitySnapshot(session.id).lastUserIntent).toBe("observed pending prompt");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("uses the same transcript observation for recovery and continuity", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const events = vi.spyOn(manager, "getTranscriptEvents")
      .mockReturnValue([])
      .mockReturnValueOnce([{
        type: "lifecycle", event: "run-error", timestamp: session.updatedAt, detail: "observed failure",
      }]);
    expect(manager.buildContinuitySnapshot(session.id).lastFailure).toBe("observed failure");
    expect(events).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "invalid"])("rejects %s state instead of producing a fallback snapshot", (kind) => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    if (kind === "missing") fs.unlinkSync(statePath);
    else fs.writeFileSync(statePath, "{invalid");
    expect(() => manager.buildContinuitySnapshot(session.id)).toThrow();
    expect(fs.existsSync(statePath)).toBe(kind !== "missing");
    if (kind === "invalid") expect(fs.readFileSync(statePath, "utf8")).toBe("{invalid");
  });

  it("does not revive state deleted before legacy normalization acquires its lock", () => {
    const manager = new SessionManager();
    const session = manager.createNew(path.join(home, "current"));
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.workingMemory = { approvalAudit: { projectRoot: "/old", cacheKey: "/old|read" } };
    fs.writeFileSync(statePath, JSON.stringify(state));
    vi.spyOn(SessionStoreAccess.prototype, "withSessionStateLock").mockImplementation((_id, update) => {
      fs.unlinkSync(statePath);
      return update();
    });
    const write = vi.spyOn(SessionStoreAccess.prototype, "writeJsonFileAtomic");
    expect(() => manager.buildContinuitySnapshot(session.id)).toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(fs.existsSync(statePath)).toBe(false);
  });
});
