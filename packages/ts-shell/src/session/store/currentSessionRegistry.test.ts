import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Session } from '../schema/sessionRecord.js';
import {
  projectCurrentSessionRegistryResolution,
  projectCurrentSessionSelectionStore,
  readSessionRegistryStore,
  removeCurrentSessionSelectionFromStore,
  writeSessionRegistryStore,
  resolveCurrentSessionForProject,
  setCurrentSessionSelection,
} from "./currentSessionRegistry.js";

describe("currentSessionRegistry", () => {
  it.each(['missing', 'unreadable', 'different-project'] as const)(
    'read-only verification preserves the selection when the target is %s', kind => {
      const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-registry-readback-'));
      try {
        const storePath = path.join(root, 'current-session.json');
        setCurrentSessionSelection({ storePath, projectRoot: root, sessionId: 'sess_saved', updatedAt: 'today' });
        const before = fs.readFileSync(storePath);
        const input = { storePath, projectRoot: root, sessionExists: () => kind !== 'missing',
          loadSession: () => {
            if (kind === 'unreadable') throw new Error('Unavailable session');
            return { id: 'sess_saved', projectRoot: path.join(root, 'other') } as Session;
          } };
        expect(resolveCurrentSessionForProject({ ...input, readOnly: true }).ok).toBe(false);
        expect(fs.readFileSync(storePath)).toEqual(before);
        expect(resolveCurrentSessionForProject(input).ok).toBe(false);
        expect(readSessionRegistryStore(storePath).store.byProjectRoot).toEqual({});
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });

  it('uses host path identity and only accepts legacy case-folded keys after checking the saved binding', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-binding-'));
    try {
      const storePath = path.join(root, 'current-session.json'); const project = path.join(root, 'Project');
      setCurrentSessionSelection({ storePath, projectRoot: project, sessionId: 'sess_current', updatedAt: '2026-10-08T00:00:00Z' });
      const expected = process.platform === 'win32' ? project.toLowerCase() : project;
      expect(Object.keys(readSessionRegistryStore(storePath).store.byProjectRoot)).toEqual([expected]);
      const store = readSessionRegistryStore(storePath).store;
      writeSessionRegistryStore({ storePath, store: { ...store, byProjectRoot: { [project.toLowerCase()]: store.byProjectRoot[expected]! } } });
      const input = { storePath, projectRoot: project, sessionExists: () => true,
        loadSession: () => ({ id: 'sess_current', projectRoot: project } as Session) };
      expect(resolveCurrentSessionForProject(input).ok).toBe(true);
      expect(resolveCurrentSessionForProject({ ...input, loadSession: () => ({ id: 'sess_current', projectRoot: path.join(root, 'other') } as Session) }).ok).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

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
