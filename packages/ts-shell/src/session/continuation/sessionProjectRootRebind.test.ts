import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { rebindSessionProjectRootContinuity } from "./sessionProjectRootRebind.js";

describe("rebindSessionProjectRootContinuity", () => {
  it("persists metadata and rebases continuity state through explicit callbacks", () => {
    const oldRoot = path.join("/tmp", "old-project");
    const newRoot = path.join("/tmp", "new-project");
    const session: Session = {
      id: "sess_rebind",
      status: "active",
      turns: [],
      projectRoot: oldRoot,
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:01.000Z",
    };
    const metadataWrites: Session[] = [];
    let lockedSessionId: string | undefined;
    let writtenSnapshot: SessionStateSnapshot | undefined;

    const rebound = rebindSessionProjectRootContinuity({
      session,
      nextProjectRoot: newRoot,
      updatedAt: "2026-05-28T00:00:02.000Z",
      writeSessionMetadata: (nextSession) =>
        metadataWrites.push({ ...nextSession }),
      withStateLock: (sessionId, update) => {
        lockedSessionId = sessionId;
        update();
      },
      readStateSnapshot: () => ({
        status: "completed",
        projectRoot: oldRoot,
        workingMemory: {
          continuity: {
            projectRoot: oldRoot,
            recentTargetFiles: [path.join(oldRoot, "src", "file.ts")],
          },
          summary: [`rooted at ${oldRoot}`],
        },
      }),
      buildStateSnapshot: () => {
        throw new Error("existing state should not be rebuilt");
      },
      writeStateSnapshot: (snapshot) => {
        writtenSnapshot = snapshot;
      },
    });

    expect(rebound.projectRoot).toBe(path.resolve(newRoot));
    expect(rebound.updatedAt).toBe("2026-05-28T00:00:02.000Z");
    expect(metadataWrites).toEqual([
      expect.objectContaining({ projectRoot: newRoot }),
    ]);
    expect(lockedSessionId).toBe("sess_rebind");
    expect(writtenSnapshot).toEqual(
      expect.objectContaining({
        projectRoot: path.resolve(newRoot),
        workingMemory: expect.objectContaining({
          continuity: expect.objectContaining({
            projectRoot: path.resolve(newRoot),
            recentTargetFiles: [
              path.join(path.resolve(newRoot), "src", "file.ts"),
            ],
          }),
          summary: [`rooted at ${path.resolve(newRoot)}`],
        }),
      }),
    );
  });
});
