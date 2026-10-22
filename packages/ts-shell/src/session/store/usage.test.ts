import { sessionUsageRecorder, writeSessionUsage } from "./usage.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShellRuntimeContext, switchActiveSession } from "../../core/shell/runtimeContext.js";
import { getSessionUsage, markContextUnknown, recordSessionUsage, resetSessionUsage, totalTokens } from "../../observability/usageTelemetry.js";
import { handleApplyQueryEventToState } from "../agent/persistence.js";
import { buildSessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStoreAccess } from "./sessionStoreAccess.js";
import { createSessionStoreLayout, locateExistingSessionLayout, projectSessionFileLayout } from "./sessionFileLayout.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";
import { loadSessionRecord, writeSessionRecord } from "./sessionStore.js";
import { readStateSnapshotSafely, withSessionStateLock, writeSessionState } from "./sessionStateStore.js";
import { attributedBucketKey, captureUsageAttribution, legacyBucketKey } from '../../observability/usage/identity.js';
import { costModel } from '../../core/commands/cost/model.js';
import { createProfileContext, withProfile } from '../../core/paths/profile/context.js';

const ID = "sess_usage_roundtrip";
let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "usage-store-"));
  vi.stubEnv('HOME', directory); vi.stubEnv('USERPROFILE', directory);
});
afterEach(() => { vi.unstubAllEnvs(); resetSessionUsage(ID); fs.rmSync(directory, { recursive: true, force: true }); });

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
    expect(getSessionUsage(ID).recentRequests.map(entry => entry.promptTokens)).toEqual([100, 200]);
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

it('binds late auxiliary billing to its captured home, destination and prices without changing history', () => {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), ID);
  const session: Session = { id: ID, projectRoot: directory, createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] };
  writeSessionRecord({ session, layout });
  recordSessionUsage(ID, { provider: 'main', model: 'same', promptTokens: 400, promptMessageCount: 3 });
  const recent = structuredClone(getSessionUsage(ID).recentRequests);
  const prices = { promptPerMTok: 3, completionPerMTok: 6, cacheReadPerMTok: 1 };
  const usageFor = sessionUsageRecorder(ID);
  const record = usageFor({ provider: 'relay', model: 'same', baseUrl: 'https://relay.invalid/a?secret=synthetic', rates: prices });
  const other = path.join(directory, 'other'); fs.mkdirSync(other);
  vi.stubEnv('HOME', other); vi.stubEnv('USERPROFILE', other);
  const otherLayout = locateExistingSessionLayout(createSessionStoreLayout(), ID);
  writeSessionRecord({ session: { ...session, createdAt: 'other' }, layout: otherLayout });
  recordSessionUsage(ID, { provider: 'other-main', model: 'same', promptTokens: 50 });
  writeSessionUsage(ID, otherLayout);
  const otherBefore = fs.readFileSync(otherLayout.statePath, 'utf8');
  // The store is captured before renewal; prices are captured before the model send.
  const unknown = usageFor({ provider: 'relay', model: 'same', baseUrl: 'https://relay.invalid/b' });
  prices.promptPerMTok = 99;
  record({ prompt_tokens: 100, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 80 } });
  unknown({ prompt_tokens: 10, completion_tokens: 0 });
  const saved = readStateSnapshotSafely(layout.statePath)!;
  expect(saved.usage?.turnsCount).toBe(3);
  expect(totalTokens(getSessionUsage(ID))).toBe(50);
  expect(fs.readFileSync(otherLayout.statePath, 'utf8')).toBe(otherBefore);
  writeSessionUsage(ID, otherLayout);
  expect(fs.readFileSync(otherLayout.statePath, 'utf8')).toBe(otherBefore);
  resetSessionUsage(ID);
  vi.stubEnv('HOME', directory); vi.stubEnv('USERPROFILE', directory);
  const rows = costModel(getSessionUsage(ID), []).buckets.filter(bucket => bucket.provider === 'relay');
  expect(rows.map(row => row.attribution?.rates)).toEqual(expect.arrayContaining([null, { promptPerMTok: 3, completionPerMTok: 6, cacheReadPerMTok: 1 }]));
  expect(rows.find(row => row.attribution?.rates)?.estimate.usd).toBeCloseTo(0.000152);
  expect(JSON.stringify(saved.usage)).not.toContain('secret');
  expect(getSessionUsage(ID)).toMatchObject({ lastPromptTokens: 400, lastPromptMessageCount: 3, recentRequests: recent });
  const before = fs.readFileSync(layout.statePath, 'utf8');
  record(undefined);
  expect(fs.readFileSync(layout.statePath, 'utf8')).toBe(before);
  resetSessionUsage(ID);
  activate(loadSessionRecord({ sessionId: ID, layout, cwd: directory }));
  expect(totalTokens(getSessionUsage(ID))).toBe(512);
});

it('retains the delta after a failed auxiliary flush and does not recreate a deleted session directory', () => {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), ID);
  const session: Session = { id: ID, projectRoot: directory, createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] };
  writeSessionRecord({ session, layout });
  const record = sessionUsageRecorder(ID)({ provider: 'relay', model: 'same', baseUrl: 'https://relay.invalid' });
  const before = fs.readFileSync(layout.statePath);
  fs.writeFileSync(layout.statePath, 'broken');
  record({ prompt_tokens: 20, completion_tokens: 1 });
  expect(fs.readFileSync(layout.statePath, 'utf8')).toBe('broken');
  fs.writeFileSync(layout.statePath, before);
  writeSessionUsage(ID, layout);
  writeSessionUsage(ID, layout);
  expect(readStateSnapshotSafely(layout.statePath)?.usage).toMatchObject({ turnsCount: 1 });
  fs.rmSync(layout.sessionDir, { recursive: true });
  record({ prompt_tokens: 10, completion_tokens: 0 });
  expect(fs.existsSync(layout.sessionDir)).toBe(false);
  expect(totalTokens(getSessionUsage(ID))).toBe(0);
});

it('does not publish a late auxiliary response into a replacement session directory', () => {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), ID);
  const session: Session = { id: ID, projectRoot: directory, createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] };
  writeSessionRecord({ session, layout });
  const record = sessionUsageRecorder(ID)({ provider: 'relay', model: 'same', baseUrl: 'https://relay.invalid' });
  // Keep the old inode alive so a filesystem cannot reuse it for the replacement.
  fs.renameSync(layout.sessionDir, `${layout.sessionDir}.retired`);
  writeSessionRecord({ session: { ...session, createdAt: 'later' }, layout });
  const before = fs.readFileSync(layout.statePath, 'utf8');
  record({ prompt_tokens: 20, completion_tokens: 1 });
  expect(fs.readFileSync(layout.statePath, 'utf8')).toBe(before);
  writeSessionUsage(ID, layout);
  expect(readStateSnapshotSafely(layout.statePath)?.usage).toBeUndefined();
  expect(totalTokens(getSessionUsage(ID))).toBe(0);
});

it('drops an old pending delta after directory replacement before a normal state save', () => {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), ID);
  const session: Session = { id: ID, projectRoot: directory, createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] };
  writeSessionRecord({ session, layout });
  const record = sessionUsageRecorder(ID)({ provider: 'old-aux', model: 'same', baseUrl: 'https://relay.invalid' });
  fs.writeFileSync(layout.statePath, 'broken');
  record({ prompt_tokens: 20, completion_tokens: 1 });
  expect(totalTokens(getSessionUsage(ID))).toBe(21);
  fs.renameSync(layout.sessionDir, `${layout.sessionDir}.retired`);
  writeSessionRecord({ session: { ...session, createdAt: 'replacement' }, layout });
  writeSessionState({ session: { ...session, createdAt: 'replacement' }, layout });
  expect(readStateSnapshotSafely(layout.statePath)?.usage).toBeUndefined();
  recordSessionUsage(ID, { provider: 'replacement-main', model: 'same', promptTokens: 5 });
  writeSessionUsage(ID, layout);
  const saved = readStateSnapshotSafely(layout.statePath)!;
  expect(Object.keys(saved.usage!.byModel)).toEqual(['replacement-main/same']);
  expect(saved.usage!.turnsCount).toBe(1);
  expect(totalTokens(getSessionUsage(ID))).toBe(5);
});

it('returns a same-ID late response only to the captured profile even inside another profile scope', () => {
  const profiles = ['a', 'b'].map(name => createProfileContext({ name, homeDir: directory }));
  const session: Session = { id: ID, projectRoot: directory, createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] };
  const [a, b] = profiles.map(profile => withProfile(profile!, () => {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), ID);
    writeSessionRecord({ session, layout });
    return { layout, record: sessionUsageRecorder(ID)({ provider: profile!.id, model: 'same', baseUrl: 'https://relay.invalid' }) };
  }));
  try {
    withProfile(profiles[1]!, () => {
      b!.record({ prompt_tokens: 7, completion_tokens: 1 });
      a!.record({ prompt_tokens: 20, completion_tokens: 1 });
      writeSessionUsage(ID, b!.layout);
      expect(totalTokens(getSessionUsage(ID))).toBe(8);
      expect(readStateSnapshotSafely(b!.layout.statePath)?.usage?.turnsCount).toBe(1);
    });
    withProfile(profiles[0]!, () => {
      expect(totalTokens(getSessionUsage(ID))).toBe(21);
      writeSessionUsage(ID, a!.layout);
      expect(readStateSnapshotSafely(a!.layout.statePath)?.usage?.turnsCount).toBe(1);
    });
  } finally {
    for (const profile of profiles) withProfile(profile!, () => resetSessionUsage(ID));
  }
});
