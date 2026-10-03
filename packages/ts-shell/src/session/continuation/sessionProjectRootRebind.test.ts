import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { projectSessionMetadata } from "../schema/sessionMetadataCodec.js";
import { rebindSessionProjectRootContinuity } from "./sessionProjectRootRebind.js";

function fixture() {
  const session: Session = {
    id: "sess_rebind", projectRoot: path.resolve("old-project"), status: "active", turns: [],
    title: "old title", createdAt: "2026-05-28T00:00:00.000Z", updatedAt: "2026-05-28T00:00:01.000Z",
  };
  const original = structuredClone(session);
  const originalState: SessionStateSnapshot = {
    status: "completed", projectRoot: session.projectRoot, lastError: "latest error",
    workingMemory: { target: path.join(session.projectRoot, "src", "file.ts") },
  };
  const stored: { metadata: Session; state: SessionStateSnapshot } = {
    metadata: { ...session, title: "latest title" }, state: structuredClone(originalState),
  };
  const originalMetadata = structuredClone(stored.metadata);
  const order: string[] = [];
  let locked = false;
  const input = {
    session, nextProjectRoot: path.resolve("new-project"), updatedAt: "2026-05-28T00:00:02.000Z",
    readSession: vi.fn((): Session => ({ ...stored.metadata, status: stored.state.status, lastError: stored.state.lastError })),
    readMetadata: vi.fn(() => projectSessionMetadata(stored.metadata)),
    readStateSnapshot: vi.fn((): SessionStateSnapshot | undefined => stored.state),
    withStateLock: vi.fn((_id: string, update: () => void) => {
      locked = true;
      try { update(); } finally { locked = false; }
    }),
    writeSessionMetadata: vi.fn((next: Session) => {
      order.push(locked ? "metadata" : "unlocked metadata");
      stored.metadata = { ...next };
    }),
    writeStateSnapshot: vi.fn((next: SessionStateSnapshot) => {
      order.push(locked ? "state" : "unlocked state");
      stored.state = structuredClone(next);
    }),
  };
  return { input, stored, original, originalState, originalMetadata, order };
}

function failure(input: ReturnType<typeof fixture>["input"]): unknown {
  try { rebindSessionProjectRootContinuity(input); } catch (error) { return error; }
  throw new Error("Expected migration to fail");
}

describe("rebindSessionProjectRootContinuity", () => {
  it("prepares from the locked records and publishes a new session after both writes", () => {
    const test = fixture();
    const rebound = rebindSessionProjectRootContinuity(test.input);
    expect(rebound).not.toBe(test.input.session);
    expect(test.input.session).toEqual(test.original);
    expect(rebound).toMatchObject({
      id: test.original.id, projectRoot: test.input.nextProjectRoot, title: "latest title",
      status: "completed", lastError: "latest error", updatedAt: test.input.updatedAt,
    });
    expect(test.order).toEqual(["state", "metadata"]);
    expect(test.stored.state).toMatchObject({
      status: "completed", lastError: "latest error", projectRoot: test.input.nextProjectRoot,
      workingMemory: { target: path.join(test.input.nextProjectRoot, "src", "file.ts") },
    });
  });

  it.each(["lock", "state read", "metadata read", "session read"])("does not change records when %s fails", stage => {
    const test = fixture();
    const fail = () => { throw new Error(stage + " unavailable"); };
    if (stage === "lock") test.input.withStateLock.mockImplementationOnce(fail);
    else if (stage === "state read") test.input.readStateSnapshot.mockImplementationOnce(fail);
    else if (stage === "metadata read") test.input.readMetadata.mockImplementationOnce(fail);
    else test.input.readSession.mockImplementationOnce(fail);
    expect(failure(test.input)).toMatchObject({ outcome: "unchanged", stage: "prepare" });
    expect(test.input.session).toEqual(test.original);
    expect(test.stored.metadata).toEqual(test.originalMetadata);
    expect(test.stored.state).toEqual(test.originalState);
    expect(test.order).toEqual([]);
  });

  it.each([undefined, null, [], "state", {}, { status: "unknown" }, { status: "active", projectRoot: 1 }])(
    "rejects missing or malformed state without creating a replacement: %j", state => {
      const test = fixture();
      test.input.readStateSnapshot.mockReturnValue(state as SessionStateSnapshot | undefined);
      expect(failure(test.input)).toMatchObject({ outcome: "unchanged", stage: "prepare" });
      expect(test.input.session).toEqual(test.original);
      expect(test.order).toEqual([]);
    },
  );

  it("accepts an older state with no project root when current metadata is consistent", () => {
    const test = fixture();
    delete test.stored.state.projectRoot;
    expect(rebindSessionProjectRootContinuity(test.input).projectRoot).toBe(test.input.nextProjectRoot);
    expect(test.stored.state.workingMemory).toEqual({ target: path.join(test.input.nextProjectRoot, "src", "file.ts") });
  });

  it.each(["metadata", "state", "both"])("rejects a changed %s root before writing", source => {
    const test = fixture();
    const otherRoot = path.resolve("other-project");
    if (source !== "state") test.stored.metadata.projectRoot = otherRoot;
    if (source !== "metadata") test.stored.state.projectRoot = otherRoot;
    const before = structuredClone(test.stored);
    expect(failure(test.input)).toMatchObject({ outcome: "unchanged", stage: "prepare" });
    expect(test.stored).toEqual(before);
    expect(test.input.session).toEqual(test.original);
    expect(test.order).toEqual([]);
  });

  it("keeps metadata and caller unchanged when the state writer fails before replacing data", () => {
    const test = fixture();
    test.input.writeStateSnapshot.mockImplementationOnce(() => { throw new Error("state denied"); });
    expect(failure(test.input)).toMatchObject({ outcome: "unchanged", stage: "state" });
    expect(test.stored.state).toEqual(test.originalState);
    expect(test.stored.metadata).toEqual(test.originalMetadata);
    expect(test.input.writeSessionMetadata).not.toHaveBeenCalled();
    expect(test.input.session).toEqual(test.original);
  });

  it("observes and restores a state replacement whose writer then reports failure", () => {
    const test = fixture();
    test.input.writeStateSnapshot.mockImplementationOnce(next => {
      test.stored.state = next;
      throw new Error("late state failure");
    });
    expect(failure(test.input)).toMatchObject({ outcome: "restored", stage: "state" });
    expect(test.stored.state).toEqual(test.originalState);
    expect(test.stored.metadata).toEqual(test.originalMetadata);
    expect(test.input.writeSessionMetadata).not.toHaveBeenCalled();
    expect(test.input.session).toEqual(test.original);
  });

  it("restores state when metadata is confirmed unchanged after its writer fails", () => {
    const test = fixture();
    test.input.writeSessionMetadata.mockImplementationOnce(() => { throw new Error("metadata denied"); });
    expect(failure(test.input)).toMatchObject({ outcome: "restored", stage: "metadata" });
    expect(test.stored.state).toEqual(test.originalState);
    expect(test.stored.metadata).toEqual(test.originalMetadata);
    expect(test.input.writeStateSnapshot).toHaveBeenCalledTimes(2);
    expect(test.input.session).toEqual(test.original);
  });

  it("does not undo committed records when the metadata writer reports a late failure", () => {
    const test = fixture();
    test.input.writeSessionMetadata.mockImplementationOnce(next => {
      test.stored.metadata = next;
      throw new Error("late metadata failure");
    });
    expect(failure(test.input)).toMatchObject({ outcome: "committed", stage: "metadata" });
    expect(test.stored.state.projectRoot).toBe(test.input.nextProjectRoot);
    expect(test.stored.metadata.projectRoot).toBe(test.input.nextProjectRoot);
    expect(test.input.writeStateSnapshot).toHaveBeenCalledTimes(1);
    expect(test.input.session).toEqual(test.original);
  });

  it.each(["throw", "silent"])("reports a partial update when state restoration fails: %s", mode => {
    const test = fixture();
    const write = test.input.writeStateSnapshot.getMockImplementation()!;
    test.input.writeStateSnapshot.mockImplementationOnce(write).mockImplementationOnce(() => {
      if (mode === "throw") throw new Error("restore denied");
    });
    test.input.writeSessionMetadata.mockImplementationOnce(() => { throw new Error("metadata denied"); });
    expect(failure(test.input)).toMatchObject({ outcome: "partial", stage: "metadata" });
    expect(test.stored.state.projectRoot).toBe(test.input.nextProjectRoot);
    expect(test.stored.metadata).toEqual(test.originalMetadata);
    expect(test.input.session).toEqual(test.original);
  });

  it("preserves a foreign state observed after a failed write", () => {
    const test = fixture();
    test.input.writeStateSnapshot.mockImplementationOnce(() => {
      test.stored.state = { status: "error", projectRoot: path.resolve("foreign-project"), lastError: "foreign state" };
      throw new Error("write outcome unknown");
    });
    expect(failure(test.input)).toMatchObject({ outcome: "partial", stage: "state" });
    expect(test.stored.state.lastError).toBe("foreign state");
    expect(test.input.writeStateSnapshot).toHaveBeenCalledTimes(1);
    expect(test.input.writeSessionMetadata).not.toHaveBeenCalled();
  });

  it.each(["unreadable", "changed"])("does not roll back against %s metadata", observation => {
    const test = fixture();
    test.input.writeSessionMetadata.mockImplementationOnce(() => {
      if (observation === "unreadable") {
        test.input.readMetadata.mockImplementation(() => { throw new Error("metadata unreadable"); });
      } else test.stored.metadata.title = "another writer";
      throw new Error("metadata outcome unknown");
    });
    expect(failure(test.input)).toMatchObject({ outcome: "partial", stage: "metadata" });
    expect(test.stored.state.projectRoot).toBe(test.input.nextProjectRoot);
    expect(test.input.writeStateSnapshot).toHaveBeenCalledTimes(1);
  });

  it("reports committed records when lock release fails and never compensates outside the lock", () => {
    const test = fixture();
    const withLock = test.input.withStateLock.getMockImplementation()!;
    test.input.withStateLock.mockImplementationOnce((id, update) => {
      withLock(id, update);
      throw new Error("lock release failed");
    });
    expect(failure(test.input)).toMatchObject({ outcome: "committed", stage: "lock-release" });
    expect(test.stored.state.projectRoot).toBe(test.input.nextProjectRoot);
    expect(test.stored.metadata.projectRoot).toBe(test.input.nextProjectRoot);
    expect(test.order).toEqual(["state", "metadata"]);
    expect(test.input.session).toEqual(test.original);
  });
});
