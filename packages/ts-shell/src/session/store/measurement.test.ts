import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { historyDigest } from '../../context/request/identity.js';
import type { PromptMeasurement } from '../../context/request/model.js';
import { createShellRuntimeContext, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { clearContextUsage, getSessionUsage, invalidatePromptMeasurement, markContextUnknown,
  recordSessionUsage, resetSessionUsage, restoreSessionUsage, totalTokens } from '../../observability/usageTelemetry.js';
import { SessionManager } from '../SessionManager.js';
import { planContextSelection, selectModelContext } from '../context/selection.js';
import { updateContextSelection } from '../context/state.js';
import type { SessionMessage } from '../schema/sessionMessage.js';
import type { Session } from '../schema/sessionRecord.js';
import { appendCompactionEvent } from '../transcript/sessionTranscript.js';
import { writeSessionUsage } from './usage.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from './sessionFileLayout.js';

const ID = 'sess_measurement_restore';
const OTHER = 'sess_measurement_other';
let directory: string;
beforeEach(() => {
  const temporaryRoot = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporaryRoot, 'measurement-'));
  vi.stubEnv('HOME', directory);
  vi.stubEnv('USERPROFILE', directory);
  vi.stubEnv('CHEERS_TEST_ROOT', directory);
});
afterEach(() => {
  resetSessionUsage(ID);
  resetSessionUsage(OTHER);
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

function activate(session: Session) {
  return createShellRuntimeContext({ cwd: directory, originalCwd: directory, projectRoot: directory,
    rootMode: 'direct', targetPathBase: directory, gitRoot: null, session,
    runtimeConfig: getRuntimeConfig(directory),
    gitContext: { insideGit: false, root: null, branch: null, isClean: null } });
}

function measurement(prefix: readonly SessionMessage[], tokens = 275): PromptMeasurement {
  return { tokens, messageCount: prefix.length, identity: {
    provider: 'fixture', model: 'fixture-model', endpoint: 'chat_completions',
    endpointId: 'a'.repeat(64), schemaDigest: 'b'.repeat(64), systemDigest: 'c'.repeat(64),
    historyDigest: historyDigest(prefix), wireHistoryDigest: historyDigest(prefix),
    wireMessageCount: prefix.length, wireRewriteTokens: 0, replayBinding: 'd'.repeat(64),
  } };
}

function start(prefix: readonly SessionMessage[] = [{ role: 'user', content: 'question' }]): SessionManager {
  const manager = new SessionManager();
  manager.createNewWithId(ID, directory);
  for (const message of prefix) manager.addTurn(ID, message);
  return manager;
}

function answer(manager: SessionManager, value = measurement(selectModelContext(manager.getSession(ID)!))): void {
  manager.addTurn(ID, { role: 'assistant', content: 'answer', promptMeasurement: value,
    origin: { provider: value.identity.provider, model: value.identity.model,
      replayBinding: value.identity.replayBinding } });
}

function reopen(): Session {
  resetSessionUsage(ID);
  const loaded = new SessionManager().resume(ID, directory);
  activate(loaded);
  return loaded;
}

describe('message prompt measurement restoration', () => {
  it('restores through the real transcript and activation without adding accounting', () => {
    const manager = start();
    const anchor = measurement(selectModelContext(manager.getSession(ID)!));
    recordSessionUsage(ID, { provider: 'fixture', model: 'fixture-model', promptTokens: 250,
      cacheReadTokens: 20, cacheWriteTokens: 5, completionTokens: 10, toolCallsCount: 1 });
    answer(manager, anchor);
    const persisted = manager.getSession(ID)!.usage!;
    const loaded = reopen();
    const usage = getSessionUsage(ID);
    expect(loaded.turns.at(-1)?.promptMeasurement).toEqual(anchor);
    expect(usage.lastPromptTokens).toBe(275);
    expect(usage.lastPromptMessageCount).toBe(1);
    expect(usage.lastPromptIdentity).toEqual(anchor.identity);
    expect(totalTokens(usage)).toBe(285);
    expect(usage.turnsCount).toBe(1);
    expect(usage.toolCallsCount).toBe(1);
    expect(usage.recentRequests).toEqual(persisted.recentRequests);
    expect(usage.requestContext).toBeUndefined();
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), ID);
    writeSessionUsage(ID, layout);
    expect(new SessionManager().getSession(ID)?.usage).toEqual(persisted);
  });

  it('uses a message measurement when cumulative usage is absent', () => {
    const manager = start();
    answer(manager);
    expect(manager.getSession(ID)?.usage).toBeUndefined();
    reopen();
    const usage = getSessionUsage(ID);
    expect(usage.lastPromptTokens).toBe(275);
    expect(totalTokens(usage)).toBe(0);
    expect(usage.turnsCount).toBe(0);
    expect(usage.toolCallsCount).toBe(0);
    expect(usage.recentRequests).toEqual([]);
    expect(usage.lastBucketKey).toBe('');
  });

  it('keeps original measured tokens and identity beside a proven persisted-prefix projection', () => {
    const manager = start();
    const persistedPrefix = selectModelContext(manager.getSession(ID)!);
    const sentPrefix = [{ ...persistedPrefix[0]!, content: 'environment framing\n\nquestion' }];
    const anchor = { ...measurement(sentPrefix), projection: {
      historyDigest: historyDigest(persistedPrefix), wireHistoryDigest: historyDigest(persistedPrefix),
      wireRewriteTokens: 0, removedTokens: 8,
    } };
    answer(manager, anchor);
    reopen();
    const usage = getSessionUsage(ID);
    expect(usage.lastPromptTokens).toBe(anchor.tokens);
    expect(usage.lastPromptIdentity).toEqual(anchor.identity);
    expect(usage.lastPromptProjection).toEqual(anchor.projection);
    expect(usage.lastPromptIdentity?.historyDigest).not.toBe(anchor.projection.historyDigest);
    expect(totalTokens(usage)).toBe(0);
  });

  it.each(['count', 'same-size-content', 'origin'])(
    'refuses mismatched persisted %s evidence', kind => {
      const manager = start();
      const prefix = selectModelContext(manager.getSession(ID)!);
      const anchor = measurement(kind === 'same-size-content' ? [{ role: 'user', content: 'replaced' }] : prefix);
      manager.addTurn(ID, { role: 'assistant', content: 'answer',
        promptMeasurement: kind === 'count' ? { ...anchor, messageCount: 0 } : anchor,
        ...(kind === 'origin' ? { origin: { provider: 'other', model: anchor.identity.model } } : {}) });
      reopen();
      expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
    },
  );

  it.each(['missing', 'malformed'])('does not revive an older anchor after a newer %s measurement', kind => {
    const manager = start();
    answer(manager);
    manager.addTurn(ID, { role: 'user', content: 'next question' });
    const newest = measurement(selectModelContext(manager.getSession(ID)!));
    manager.addTurn(ID, { role: 'assistant', content: 'new answer',
      ...(kind === 'malformed' ? { promptMeasurement: { ...newest, tokens: -1 } } : {}) });
    reopen();
    expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
  });

  it.each(['context-reset', 'usage-gap'] as const)('retains a durable %s invalidation', kind => {
    const manager = start();
    recordSessionUsage(ID, { provider: 'fixture', model: 'fixture-model', promptTokens: 275 });
    answer(manager);
    markContextUnknown(ID, kind);
    writeSessionUsage(ID, locateExistingSessionLayout(createSessionStoreLayout(), ID));
    reopen();
    expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
    expect(totalTokens(getSessionUsage(ID))).toBe(275);
    expect(getSessionUsage(ID).recentRequests.at(-1)?.kind).toBe(kind);
  });

  it('restores an unchanged effective selection and refuses its later restoration', () => {
    const manager = start([{ role: 'assistant', content: '', tool_calls: [
      { id: 'call', type: 'function', function: { name: 'read', arguments: '{}' } },
    ] }, { role: 'tool', tool_call_id: 'call', content: 'x'.repeat(4096) }]);
    const current = manager.getSession(ID)!;
    const selected = updateContextSelection(manager, current, planContextSelection(current, 'elide').selection);
    const anchor = measurement(selectModelContext(selected));
    answer(manager, anchor);
    const loaded = reopen();
    expect(loaded.turns[1]?.content).toHaveLength(4096);
    expect(getSessionUsage(ID).lastPromptIdentity).toEqual(anchor.identity);
    updateContextSelection(manager, loaded, undefined);
    reopen();
    expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
  });

  it('refuses a measurement of raw turns after an effective context edit', () => {
    const manager = start([{ role: 'user', content: '```text\n' + 'x'.repeat(4096) + '\n```' }]);
    answer(manager);
    const current = manager.getSession(ID)!;
    updateContextSelection(manager, current, planContextSelection(current, 'elide').selection);
    reopen();
    expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
  });

  it('refuses a precompaction anchor even when its assistant is retained', () => {
    const manager = start();
    answer(manager);
    appendCompactionEvent(path.join(manager.getSessionDirPath(ID), 'transcript.jsonl'), {
      summary: 'replacement context', keptMessages: 1, timestamp: new Date().toISOString() });
    const loaded = reopen();
    expect(loaded.turns[0]?.content).toContain('replacement context');
    expect(loaded.turns.at(-1)?.promptMeasurement).toBeDefined();
    expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
  });

  it('does not select an anchor from an abandoned branch', async () => {
    const manager = start();
    const original = manager.getSession(ID)!.turns[0]!.id!;
    answer(manager);
    await manager.revertTo(ID, original);
    const loaded = reopen();
    expect(loaded.turns.some(message => message.promptMeasurement !== undefined)).toBe(false);
    expect(getSessionUsage(ID).lastPromptTokens).toBeUndefined();
  });

  it('does not replace live measurement or pending counters on repeat activation', () => {
    const manager = start();
    answer(manager);
    const loaded = reopen();
    recordSessionUsage(ID, { provider: 'fixture', model: 'fixture-model', promptTokens: 15,
      promptMessageCount: loaded.turns.length, promptIdentity: measurement(loaded.turns).identity });
    const live = getSessionUsage(ID);
    restoreSessionUsage(ID, loaded.usage, selectModelContext(loaded));
    activate(loaded);
    expect(getSessionUsage(ID)).toBe(live);
    expect(live.lastPromptTokens).toBe(15);
    expect(totalTokens(live)).toBe(15);
  });

  it('restores message measurements on an explicit session switch', () => {
    const manager = start();
    answer(manager);
    const loaded = manager.getSession(ID)!;
    const context = activate(manager.createNewWithId(OTHER, directory));
    switchActiveSession(context, loaded);
    expect(getSessionUsage(ID).lastPromptTokens).toBe(275);
    expect(totalTokens(getSessionUsage(ID))).toBe(0);
  });

  it.each(['accepted request', 'model change', 'context reset', 'usage gap', 'new measurement'])(
    'retires persisted-prefix projection on %s', kind => {
      const manager = start();
      const anchor = measurement(selectModelContext(manager.getSession(ID)!));
      answer(manager, { ...anchor, projection: { historyDigest: anchor.identity.historyDigest!,
        wireHistoryDigest: anchor.identity.wireHistoryDigest!, wireRewriteTokens: 0, removedTokens: 1 } });
      reopen();
      expect(getSessionUsage(ID).lastPromptProjection).toBeDefined();
      if (kind === 'accepted request') clearContextUsage(ID);
      if (kind === 'model change') invalidatePromptMeasurement(ID);
      if (kind === 'context reset') markContextUnknown(ID);
      if (kind === 'usage gap') recordSessionUsage(ID, { provider: 'fixture', model: 'fixture-model' }, { promptMeasured: false });
      if (kind === 'new measurement') recordSessionUsage(ID, { provider: 'fixture', model: 'fixture-model', promptTokens: 15 });
      expect(getSessionUsage(ID).lastPromptProjection).toBeUndefined();
    },
  );
});
