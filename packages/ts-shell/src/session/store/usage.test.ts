import { writeSessionUsage } from "./usage.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShellRuntimeContext, switchActiveSession } from "../../core/shell/runtimeContext.js";
import { getSessionUsage, markContextUnknown, recordSessionUsage, resetSessionUsage, totalTokens } from "../../observability/usageTelemetry.js";
import { handleApplyQueryEventToState } from "../agent/persistence.js";
import { buildSessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStoreAccess } from "./sessionStoreAccess.js";
import { projectSessionFileLayout } from "./sessionFileLayout.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";
import { loadSessionRecord, writeSessionRecord } from "./sessionStore.js";
import { readStateSnapshotSafely, withSessionStateLock, writeSessionState } from "./sessionStateStore.js";
import { attributedBucketKey, captureUsageAttribution, legacyBucketKey } from '../../observability/usage/identity.js';
import { costModel } from '../../core/commands/cost/model.js';

const ID = "sess_usage_roundtrip";
let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "usage-store-")); });
afterEach(() => { resetSessionUsage(ID); fs.rmSync(directory, { recursive: true, force: true }); });

function activate(session: Session) {
  return createShellRuntimeContext({
    cwd: directory, originalCwd: directory, projectRoot: directory, rootMode: "direct",
    targetPathBase: directory, gitRoot: null, session,
    runtimeConfig: { ...getRuntimeConfig(directory), maxTurns: 6 },
    gitContext: { insideGit: false, root: null, branch: null, isClean: null },
  });
}

describe("session usage persistence seams", () => {
  it('migrates legacy identity through real state writes and keeps captured prices on activation', () => {
    const layout = projectSessionFileLayout({ sessionsDir: directory, sessionId: ID });
    const session: Session = { id: ID, projectRoot: directory, createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] };
    writeSessionRecord({ session, layout });
    const attribution = captureUsageAttribution({ provider: 'fixture', model: 'same', baseUrl: 'https://relay.invalid/v1',
      rates: { promptPerMTok: 3, completionPerMTok: 6 } });
    const key = attributedBucketKey(attribution);
    const before = readStateSnapshotSafely(layout.statePath)!;
    writeJsonFileAtomic(layout.statePath, { ...before, usage: {
      byModel: { [key]: { promptTokens: 100, completionTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 100, turnsCount: 1 } },
      turnsCount: 1, toolCallsCount: 0, lastBucketKey: key, lastUpdated: 1,
    } });
    activate(loadSessionRecord({ sessionId: ID, layout, cwd: directory }));
    recordSessionUsage(ID, { attribution, promptTokens: 1_000_000 });
    writeSessionUsage(ID, layout);
    resetSessionUsage(ID);
    activate(loadSessionRecord({ sessionId: ID, layout, cwd: directory }));
    const usage = getSessionUsage(ID);
    expect(usage.byModel[legacyBucketKey(key)]).toMatchObject({ totalTokens: 100 });
    expect(usage.byModel[key]).toMatchObject({ attribution, totalTokens: 1_000_000 });
    expect(usage.byModel[legacyBucketKey(key)]?.attribution).toBeUndefined();
    expect(totalTokens(usage)).toBe(1_000_100);
    expect(costModel(usage, []).buckets.find(bucket => bucket.attribution)?.estimate.usd).toBe(3);
    expect(usage.lastPromptTokens).toBeUndefined();
    const saved = fs.readFileSync(layout.statePath, 'utf8');
    writeSessionUsage(ID, layout);
    expect(fs.readFileSync(layout.statePath, 'utf8')).toBe(saved);
  });

  it("persists both query and lifecycle writes, survives pre-activation rewrites, and restores on activation", () => {
    const layout = projectSessionFileLayout({ sessionsDir: directory, sessionId: ID });
    const session: Session = { id: ID, projectRoot: directory, createdAt: "now", updatedAt: "now", status: "active", turns: [] };
    const load = () => loadSessionRecord({ sessionId: ID, layout, cwd: directory });
    const read = () => readStateSnapshotSafely(layout.statePath);
    writeSessionRecord({ session, layout });
    recordSessionUsage(ID, { provider: "one", model: "org/model", promptTokens: 100 });
    // The real query owner, with only its path/storage adapter supplied here.
    const store = {
      load, statePath: () => layout.statePath,
      transcriptPath: () => layout.transcriptPath,
      withSessionStateLock: (_id: string, write: () => void) => withSessionStateLock(layout, write),
      readStateSnapshotSafely: read, writeJsonFileAtomic,
    } as unknown as SessionStoreAccess;
    handleApplyQueryEventToState(store, ID, { type: "message.delta", role: "coder", delta: "done" });
    expect(read()?.usage?.byModel["one/org/model"]?.totalTokens).toBe(100);
    recordSessionUsage(ID, { provider: "two", model: "org/model", promptTokens: 200 });
    writeSessionState({ session, layout });
    expect(read()?.usage?.turnsCount).toBe(2);
    writeSessionState({ session, layout });
    expect(read()?.usage?.turnsCount).toBe(2);

    // Compact/navigation may reset live context after their durable write.
    markContextUnknown(ID);
    resetSessionUsage(ID);
    const restored = load();
    writeSessionState({ session: restored, layout });
    // Other snapshot builders preserve locked disk totals, not stale Session.usage.
    expect(buildSessionStateSnapshot(session, read()).usage).toEqual(read()?.usage);
    const context = activate(load());
    expect(totalTokens(getSessionUsage(ID))).toBe(300);
    expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
    expect(getSessionUsage(ID).recentRequests).toEqual([]);
    recordSessionUsage(ID, { provider: "one", model: "org/model", promptTokens: 10 });
    switchActiveSession(context, context.session);
    expect(getSessionUsage(ID).lastPromptTokens).toBe(10);
    writeSessionState({ session: context.session, layout });
    expect(read()?.usage?.byModel["one/org/model"]?.totalTokens).toBe(110);

    resetSessionUsage(ID);
    switchActiveSession(context, { ...session, id: "sess_other" });
    switchActiveSession(context, load());
    expect(totalTokens(getSessionUsage(ID))).toBe(310);
  });
});


it("flushes background accounting without rewriting lifecycle, branch or transcript state", () => {
  const layout = projectSessionFileLayout({ sessionsDir: directory, sessionId: ID });
  const session: Session = { id: ID, projectRoot: directory, createdAt: "now", updatedAt: "now", status: "active", turns: [] };
  writeSessionRecord({ session, layout });
  recordSessionUsage(ID, { provider: "one", model: "main", promptTokens: 100, promptMessageCount: 3 });
  writeSessionState({ session, layout });
  const before = JSON.parse(fs.readFileSync(layout.statePath, "utf8"));
  recordSessionUsage(ID, { provider: "two", model: "warm", promptTokens: 5, cacheReadTokens: 200, completionTokens: 1 }, { affectsContext: false });
  writeSessionUsage(ID, layout);
  const after = JSON.parse(fs.readFileSync(layout.statePath, "utf8"));
  expect({ ...after, usage: before.usage }).toEqual(before);
  expect(after.usage.byModel["two/warm"].totalTokens).toBe(206);
  expect(getSessionUsage(ID).lastPromptTokens).toBe(100);
  writeSessionUsage(ID, layout);
  expect(JSON.parse(fs.readFileSync(layout.statePath, "utf8"))).toEqual(after);
  resetSessionUsage(ID);
  activate(loadSessionRecord({ sessionId: ID, layout, cwd: directory }));
  expect(totalTokens(getSessionUsage(ID))).toBe(306);
});

it.each(["missing", "corrupt"])("does not reconstruct %s state to persist background usage", (kind) => {
  const layout = projectSessionFileLayout({ sessionsDir: directory, sessionId: ID });
  fs.mkdirSync(layout.sessionDir, { recursive: true });
  if (kind === "corrupt") fs.writeFileSync(layout.statePath, "broken");
  recordSessionUsage(ID, { provider: "two", model: "warm", promptTokens: 5 }, { affectsContext: false });
  expect(() => writeSessionUsage(ID, layout)).toThrow();
  if (kind === "missing") expect(fs.existsSync(layout.statePath)).toBe(false);
  else expect(fs.readFileSync(layout.statePath, "utf8")).toBe("broken");
});
