import { expect, it, vi } from 'vitest';
import { captureMessageHistory } from '../custom.js';
import { captureRequestDeclaration, snapshotRequestDeclaration } from './codec.js';

const declaration = () => ({ version: 1, target: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages',
  replayBinding: 'a'.repeat(64) }, tools: [{ type: 'function', function: { name: 'read', description: 'Read a file',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }], effort: 'high' });

it('captures the complete declaration and message without mutable source references', () => {
  const source = declaration();
  const saved = snapshotRequestDeclaration(source);
  source.tools[0]!.function.parameters.properties.path.type = 'number';
  source.target.model = 'changed';
  expect(saved.target.model).toBe('m');
  expect(saved.tools[0]!.function.parameters).toMatchObject({ properties: { path: { type: 'string' } } });
  expect(Object.isFrozen(saved)).toBe(true); expect(Object.isFrozen(saved.tools[0]?.function.parameters)).toBe(true);
  const message = { id: 'declaration-1', role: 'system', content: '', timestamp: '2026-11-15T00:00:00Z', requestDeclaration: declaration() };
  const captured = captureMessageHistory([message])[0]!;
  message.requestDeclaration.effort = 'low';
  expect(captured.requestDeclaration.effort).toBe('high');
  expect(captured).toMatchObject({ id: 'declaration-1', role: 'system', content: '', timestamp: message.timestamp });
  expect(captured).not.toBe(message); expect(Object.isFrozen(captured)).toBe(true);
});

it('accepts an empty tool snapshot and omitted automatic effort', () => {
  const { effort: _effort, ...source } = declaration();
  const saved = snapshotRequestDeclaration({ ...source, tools: [] });
  expect(saved.tools).toEqual([]); expect(saved.effort).toBeUndefined();
});

it.each([
  { version: 2 }, { version: '1' }, { target: { ...declaration().target, replayBinding: 'invalid' } },
  { target: { ...declaration().target, model: '' } }, { target: { ...declaration().target, token: 'extra' } },
  { tools: null }, { tools: [...declaration().tools, ...declaration().tools] },
  { tools: [{ type: 'function', function: { name: 'read', parameters: [] } }] },
  { tools: [{ type: 'function', function: { name: '', parameters: {} } }] },
  { tools: [{ type: 'function', function: { name: 'read', parameters: {}, execute: 'extra' } }] },
  { tools: [{ type: 'other', function: { name: 'read', parameters: {} } }] },
  { effort: '' }, { effort: 1 }, { unexpected: true },
])('rejects an invalid version, target or tool snapshot: %j', patch => {
  expect(() => snapshotRequestDeclaration({ ...declaration(), ...patch })).toThrow();
});

it.each(['user', 'assistant', 'tool', 'custom'])('rejects declarations attached to %s history', role => {
  const message = { role, content: '', requestDeclaration: declaration(),
    ...(role === 'custom' ? { customType: 'note', display: false } : {}) };
  expect(() => captureMessageHistory([message])).toThrow();
});

it.each([{ content: 'text' }, { content: [] }, { content: null }])('rejects a declaration message with nonempty or non-text content: %j', ({ content }) => {
  expect(() => captureRequestDeclaration({ role: 'system', content, requestDeclaration: declaration() })).toThrow();
});

it('rejects message, target and nested schema accessors without invoking them', () => {
  const getter = vi.fn(() => declaration());
  expect(() => captureRequestDeclaration(Object.defineProperty({ role: 'system', content: '' }, 'requestDeclaration',
    { enumerable: true, get: getter }))).toThrow();
  const target = Object.defineProperty(declaration().target, 'model', { enumerable: true, get: getter });
  expect(() => snapshotRequestDeclaration({ ...declaration(), target })).toThrow();
  const parameters = Object.defineProperty({}, 'type', { enumerable: true, get: getter });
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read', parameters } }] })).toThrow();
  const message = Object.defineProperty({ role: 'system', requestDeclaration: declaration() }, 'content', { enumerable: true, get: getter });
  expect(() => captureRequestDeclaration(message)).toThrow();
  const inherited = Object.create(Object.defineProperty({}, 'requestDeclaration', { get: getter }));
  Object.defineProperties(inherited, { role: { value: 'system' }, content: { value: '' } });
  expect(() => captureRequestDeclaration(inherited)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});

it('rejects proxies and serialization hooks without invoking their callbacks', () => {
  const get = vi.fn(); const ownKeys = vi.fn(); const toJSON = vi.fn();
  expect(() => snapshotRequestDeclaration(new Proxy(declaration(), { get, ownKeys }))).toThrow();
  expect(() => captureRequestDeclaration(new Proxy({ role: 'system', content: '', requestDeclaration: declaration() }, { get }))).toThrow();
  expect(() => snapshotRequestDeclaration({ ...declaration(), toJSON })).toThrow();
  expect(get).not.toHaveBeenCalled(); expect(ownKeys).not.toHaveBeenCalled(); expect(toJSON).not.toHaveBeenCalled();
});

it('rejects oversized UTF-8 schemas, excessive depth and excessive tool counts', () => {
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read',
    parameters: { description: '界'.repeat(1_500_000) } } }] })).toThrow();
  let nested: unknown = null;
  for (let depth = 0; depth < 45; depth++) nested = { nested };
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read', parameters: { nested } } }] })).toThrow();
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: Array.from({ length: 4097 }, (_, index) => ({
    type: 'function', function: { name: `tool-${index}`, parameters: {} } })) })).toThrow();
});

it.each([Infinity, NaN, () => {}, undefined])('refuses non-JSON values inside schema arrays: %s', value => {
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read',
    parameters: { enum: [value] } } }] })).toThrow();
});

it('rejects explicit undefined schema properties and unknown fields rather than dropping them', () => {
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read',
    parameters: { type: 'object', omitted: undefined } } }] })).toThrow();
  expect(() => snapshotRequestDeclaration({ ...declaration(), unexpected: undefined })).toThrow();
  expect(() => captureRequestDeclaration({ role: 'system', content: '', requestDeclaration: undefined })).toThrow();
});

it('rejects sparse arrays, cyclic schemas and invalid message identities', () => {
  const sparse = new Array(1);
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: sparse })).toThrow();
  const parameters: Record<string, unknown> = {}; parameters.cycle = parameters;
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read', parameters } }] })).toThrow();
  expect(() => captureRequestDeclaration({ role: 'system', content: '', id: '', requestDeclaration: declaration() })).toThrow();
  expect(() => captureRequestDeclaration({ role: 'system', content: '', timestamp: 1, requestDeclaration: declaration() })).toThrow();
  expect(() => captureRequestDeclaration({ role: 'system', content: '', tool_calls: [], requestDeclaration: declaration() })).toThrow();
});

it('rejects oversized single declarations and node-heavy schemas', () => {
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read',
    parameters: { description: 'x'.repeat(4 * 1024 * 1024) } } }] })).toThrow();
  expect(() => snapshotRequestDeclaration({ ...declaration(), tools: [{ type: 'function', function: { name: 'read',
    parameters: { enum: Array.from({ length: 100_000 }, () => 0) } } }] })).toThrow();
});
