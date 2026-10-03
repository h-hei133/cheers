import { describe, expect, it, vi } from "vitest";
import { normalizeLegacyPermissionStateForSession } from "./legacyPermissionRebase.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";

describe("legacy permission normalization under the state lock", () => {
  const session: Session = { id: "session", projectRoot: "/new", status: "interrupted", turns: [], createdAt: "t", updatedAt: "t" };
  const observed: SessionStateSnapshot = { status: "interrupted", workingMemory: { approvalAudit: { projectRoot: "/old", cacheKey: "/old|read" } } };

  it.each([undefined, { status: "completed" as const }, { status: "completed" as const, workingMemory: null }])("does not resurrect pre-lock memory after the latest snapshot changed: %j", latest => {
    const writeSnapshot = vi.fn();
    const result = normalizeLegacyPermissionStateForSession({
      session, snapshot: observed, withStateLock: (_id, update) => update(), readLatestSnapshot: () => latest, writeSnapshot,
    });
    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(result).toBe(latest);
  });

  it("does not relabel a newer snapshot whose project changed under the lock", () => {
    const latest: SessionStateSnapshot = { status: "completed", projectRoot: "/other", workingMemory: { approvalAudit: { projectRoot: "/other", cacheKey: "/other|read" } } };
    const writeSnapshot = vi.fn();
    const result = normalizeLegacyPermissionStateForSession({
      session, snapshot: observed, withStateLock: (_id, update) => update(), readLatestSnapshot: () => latest, writeSnapshot,
    });
    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(result).toBe(latest);
  });

  it("repairs the latest memory while preserving its newer terminal state", () => {
    const snapshot = { ...observed, projectRoot: "/old" };
    const latest = { ...snapshot, status: "completed" as const, lastError: "new diagnostic", workingMemory: { approvalAudit: { projectRoot: "/old", cacheKey: "/old|read" }, target: "/old/latest" } };
    const writeSnapshot = vi.fn();
    const result = normalizeLegacyPermissionStateForSession({
      session, snapshot, withStateLock: (_id, update) => update(), readLatestSnapshot: () => latest, writeSnapshot,
    });
    expect(result).toMatchObject({ status: "completed", lastError: "new diagnostic", projectRoot: "/new", workingMemory: { target: "/new/latest" } });
    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledWith(result);
    expect(latest.workingMemory.target).toBe("/old/latest");
  });

  it("does not write or relabel an already normalized latest snapshot", () => {
    const latest = { ...observed, workingMemory: { approvalAudit: { projectRoot: "/new", cacheKey: "/new|read" } } };
    const writeSnapshot = vi.fn();
    const result = normalizeLegacyPermissionStateForSession({
      session, snapshot: observed, withStateLock: (_id, update) => update(), readLatestSnapshot: () => latest, writeSnapshot,
    });
    expect(result).toBe(latest);
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("does not relabel or persist ambiguous permission continuity", () => {
    const snapshot = { ...observed, projectRoot: "/old", workingMemory: {
      continuity: { lastApprovalProjectRoot: "/first", lastRequestScopeProjectRoot: "/second", lastApprovalCacheKey: "/first|read" },
    } };
    const withStateLock = vi.fn();
    const writeSnapshot = vi.fn();
    expect(normalizeLegacyPermissionStateForSession({ session, snapshot, withStateLock, readLatestSnapshot: () => snapshot, writeSnapshot })).toBe(snapshot);
    expect(withStateLock).not.toHaveBeenCalled();
    expect(writeSnapshot).not.toHaveBeenCalled();
  });
});
