import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import type { CompactionSource } from './contract.js';
import { sessionCompactionAuthority } from './authority.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-compaction-authority-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

it.each(['customType', 'data', 'display', 'metadata'] as const)('rejects changed custom %s while identical inert history remains admissible', field => {
  const message = { role: 'custom' as const, customType: 'application', content: 'same visible content', display: false, data: { value: 1 }, metadata: { application: 1 } };
  const source: CompactionSource = { sessionId: 'custom-test', identity: 'raw-history', history: [message] };
  const authority = sessionCompactionAuthority({ sessionId: source.sessionId, workspaceRoot: root, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: () => ({ status: 'committed' }) });
  expect(authority.capture([structuredClone(message)])).toBe(source);
  const changed = structuredClone(message);
  if (field === 'customType') changed.customType = 'different';
  if (field === 'data') changed.data = { value: 2 };
  if (field === 'display') changed.display = true;
  if (field === 'metadata') changed.metadata = { application: 2 };
  expect(() => authority.capture([changed])).toThrow('no longer matches');
});

it.each(['metadata', 'origin', 'failureClass', 'promptMeasurement'] as const)('rejects standard %s changes visible to application conversion', field => {
  const message: AgentMessage = { id: 'stored', timestamp: 'earlier', role: 'assistant', content: 'same answer',
    metadata: { application: 1 }, origin: { provider: 'fixture', model: 'first' }, failureClass: 'first' };
  const source: CompactionSource = { sessionId: 'standard-facts', identity: 'raw', history: [message] };
  const authority = sessionCompactionAuthority({ sessionId: source.sessionId, workspaceRoot: root, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: () => ({ status: 'committed' }) });
  const { id: _id, timestamp: _timestamp, ...caller } = message;
  expect(authority.capture([caller])).toBe(source);
  const changed = { ...caller, [field]: field === 'metadata' ? { application: 2 }
    : field === 'origin' ? { provider: 'fixture', model: 'second' } : field === 'promptMeasurement' ? { application: 1 } : 'second' };
  expect(() => authority.capture([changed as AgentMessage])).toThrow('no longer matches');
});

it('allows only opening content prefixes while preserving every other application field', () => {
  const message: AgentMessage = { id: 'opening', timestamp: 'earlier', role: 'user', content: 'original prompt', metadata: { application: 1 } };
  const source: CompactionSource = { sessionId: 'opening-facts', identity: 'raw', promptEntryId: 'opening', history: [message] };
  const authority = sessionCompactionAuthority({ sessionId: source.sessionId, workspaceRoot: root, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: () => ({ status: 'committed' }) });
  const caller: AgentMessage = { role: 'user', content: 'Environment Context\n\noriginal prompt', metadata: { application: 1 } };
  expect(authority.capture([caller])).toBe(source);
  expect(() => authority.capture([{ ...caller, metadata: { application: 2 } }])).toThrow('no longer matches');
  expect(() => authority.capture([{ role: 'user', content: caller.content }])).toThrow('no longer matches');
});

it('accepts live assistant completion diagnostics omitted by durable history while retaining its facts', () => {
  const stored: AgentMessage = { id: 'assistant', timestamp: 'earlier', role: 'assistant', content: 'answer',
    metadata: { application: 1 }, origin: { provider: 'fixture', model: 'model' } };
  const source: CompactionSource = { sessionId: 'live-completion', identity: 'raw', history: [stored] };
  const authority = sessionCompactionAuthority({ sessionId: source.sessionId, workspaceRoot: root, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: () => ({ status: 'committed' }) });
  const live: AgentMessage = { role: 'assistant', content: 'answer', stopReason: 'stop', errorMessage: 'transient diagnostic',
    metadata: { application: 1 }, origin: { provider: 'fixture', model: 'model' } };
  expect(authority.capture([live])).toBe(source);
  expect(() => authority.capture([{ ...live, metadata: { application: 2 } }])).toThrow('no longer matches');
  expect(() => authority.capture([{ ...live, origin: { provider: 'fixture', model: 'changed' } }])).toThrow('no longer matches');
});

it('rejects custom accessors without invoking application code', () => {
  const source: CompactionSource = { sessionId: 'inert-test', identity: 'raw', history: [{ role: 'custom', customType: 'application', content: 'text', display: true }] };
  const authority = sessionCompactionAuthority({ sessionId: source.sessionId, workspaceRoot: root, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: () => ({ status: 'committed' }) });
  const getter = vi.fn(() => 'custom');
  const message = { content: 'text', customType: 'application', display: true };
  Object.defineProperty(message, 'role', { enumerable: true, get: getter });
  expect(() => authority.capture([message as AgentMessage])).toThrow('no longer matches');
  expect(getter).not.toHaveBeenCalled();
});

it('preserves the runtime environment suffix allowance for the original user opening', () => {
  const source: CompactionSource = { sessionId: 'opening-test', identity: 'raw', promptEntryId: 'opening',
    history: [{ id: 'opening', role: 'user', content: 'original prompt' }] };
  const authority = sessionCompactionAuthority({ sessionId: source.sessionId, workspaceRoot: root, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: () => ({ status: 'committed' }) });
  expect(authority.capture([{ role: 'system', content: 'runtime system' }, { role: 'user', content: 'Environment Context\n\noriginal prompt' }])).toBe(source);
  expect(() => authority.capture([{ role: 'user', content: 'Environment Context\n\nchanged prompt' }])).toThrow('no longer matches');
});

it.each(['caller', 'source'] as const)('rejects standard %s nested accessors without comparing or serializing them', owner => {
  for (const field of ['content', 'tool_calls']) {
    const getter = vi.fn(() => 'must not execute');
    const message: AgentMessage = field === 'content'
      ? { role: 'user', content: [{ type: 'text', text: 'history' }] }
      : { role: 'assistant', content: '', tool_calls: [{ id: 'read', type: 'function', function: { name: 'read', arguments: '{}' } }] };
    const clean = structuredClone(message);
    const nested = field === 'content' ? (message.content as object[])[0]! : message.tool_calls![0]!.function;
    Object.defineProperty(nested, field === 'content' ? 'text' : 'arguments', { enumerable: true, get: getter });
    const source: CompactionSource = { sessionId: 'standard-accessor', identity: 'raw', history: [owner === 'source' ? message : clean] };
    const authority = sessionCompactionAuthority({ sessionId: source.sessionId, workspaceRoot: root, admission: () => undefined,
      isCurrent: () => true, capture: () => source, commit: () => ({ status: 'committed' }) });
    expect(() => authority.capture([owner === 'caller' ? message : clean])).toThrow('no longer matches');
    expect(getter).not.toHaveBeenCalled();
  }
});
