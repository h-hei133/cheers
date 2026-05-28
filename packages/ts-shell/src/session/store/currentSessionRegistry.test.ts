import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectCurrentSessionRegistryResolution,
  projectCurrentSessionSelectionStore,
  readSessionRegistryStore,
  removeCurrentSessionSelectionFromStore,
  writeSessionRegistryStore,
} from "./currentSessionRegistry.js";

describe("currentSessionRegistry", () => {
  it("round-trips selection store and marks missing sessions for cleanup", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "current-registry-"));
    try {
      const storePath = path.join(root, "current-session.json");
      const empty = readSessionRegistryStore(storePath);
      const next = projectCurrentSessionSelectionStore({
        current: empty.store,
        normalizedProjectRoot: "/repo",
        sessionId: "sess_current",
        updatedAt: "2026-05-28T00:00:00.000Z",
      });

      writeSessionRegistryStore({ storePath, store: next });

      expect(readSessionRegistryStore(storePath).store).toEqual(next);
      expect(
        projectCurrentSessionRegistryResolution({
          projectRoot: "/repo",
          normalizedProjectRoot: "/repo",
          storeReadError: null,
          selection: next.byProjectRoot["/repo"],
          sessionExists: false,
        }),
      ).toEqual(
        expect.objectContaining({
          clearSelection: true,
          resolution: expect.objectContaining({ reason: "missing-session" }),
        }),
      );
      expect(
        removeCurrentSessionSelectionFromStore({
          current: next,
          normalizedProjectRoot: "/repo",
        }),
      ).toEqual({ schemaVersion: 1, byProjectRoot: {} });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
