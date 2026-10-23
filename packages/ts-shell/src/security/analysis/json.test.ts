import { expect, it, vi } from 'vitest';
import { admitJsonSource, boundedJson } from './json.js';
import { decodeSecurity } from '../findings/store.js';
import { inspectionState, securityInspection } from '../view/inspection.js';
import type { SecurityState, ScanRecord } from './model.js';

it('admits exact raw UTF8 source bytes and rejects one extra before full JSON serialization', () => {
  const exact = { key: '😀'.repeat((4 * 1024 * 1024 - 4) / 4) + 'x' };
  expect(() => admitJsonSource(exact)).not.toThrow(); exact.key += 'x';
  expect(() => admitJsonSource(exact)).toThrow('source limits');
  const stringify = vi.spyOn(JSON, 'stringify');
  try { expect(() => decodeSecurity(exact)).toThrow('source limits'); expect(stringify).not.toHaveBeenCalled(); }
  finally { stringify.mockRestore(); }
});

it('rejects deep or broad raw source before cloning and retains original parsed structural limits', () => {
  let value: unknown = 'leaf'; for (let i = 0; i < 25; i++) value = [value];
  expect(() => admitJsonSource(value)).toThrow('structural limits');
  expect(() => admitJsonSource(Array(100_000).fill(null))).toThrow('structural limits');
  expect(() => boundedJson('{"__proto__":{}}')).toThrow('unsupported field');
});

it('bounds complete inspection input before JSON/hash or item projection without dropping observed records', () => {
  const state = { version: 1 as const, scans: [], remediations: [], dispositions: [], unrelated: 'x'.repeat(8 * 1024 * 1024 + 1) };
  const stringify = vi.spyOn(JSON, 'stringify');
  try {
    expect(() => securityInspection(state, { sessionId: 's', workspaceRoot: '/w' })).toThrow('source limits');
    expect(stringify).not.toHaveBeenCalled();
  } finally { stringify.mockRestore(); }
  const saved: SecurityState = { version: 1, scans: [], remediations: [], dispositions: [] };
  const unknown = Array.from({ length: 97 }, (_, i) => ({ id: String(i), durability: 'unknown' })) as ScanRecord[];
  expect(() => inspectionState(saved, unknown, [])).toThrow('source limits');
  expect(unknown).toHaveLength(97);
});

it('refuses executable serialization hooks and proxies without invoking source code', () => {
  const toJSON = vi.fn(() => ({ text: 'x'.repeat(5 * 1024 * 1024) }));
  const getter = vi.fn(() => 'x');
  const value = Object.defineProperty({}, 'text', { enumerable: true, get: getter });
  const trap = vi.fn(); const proxy = new Proxy({}, { get: trap });
  const stringify = vi.spyOn(JSON, 'stringify');
  try {
    for (const source of [{ toJSON }, value, proxy]) expect(() => decodeSecurity(source)).toThrow('inert JSON source');
    expect(toJSON).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled(); expect(trap).not.toHaveBeenCalled();
    expect(stringify).not.toHaveBeenCalled();
    expect(() => admitJsonSource({ toJSON: 'ordinary retained metadata' })).not.toThrow();
  } finally { stringify.mockRestore(); }
});

it('inspects array index data without calling an overridden iterator and preserves benign shared values', () => {
  const iterator = vi.fn(function* () { yield ''; });
  const array = ['x'.repeat(4 * 1024 * 1024 + 1)]; array[Symbol.iterator] = iterator;
  expect(() => admitJsonSource(array)).toThrow('source limits'); expect(iterator).not.toHaveBeenCalled();
  const shared = { text: 'retained' };
  expect(() => admitJsonSource({ first: shared, second: shared, sparse: Array(3), count: NaN })).not.toThrow();
});

it('refuses retained inspection field accessors before required record counts or projection', () => {
  const getter = vi.fn(() => []), source = Object.defineProperty({ version: 1, remediations: [], dispositions: [] }, 'scans', { get: getter });
  expect(() => securityInspection(source as SecurityState, { sessionId: 's', workspaceRoot: '/w' })).toThrow('inert JSON source');
  expect(getter).not.toHaveBeenCalled();
});

it('refuses overridden array projection methods before they can mutate the admitted source', () => {
  const state: SecurityState = { version: 1, scans: [], remediations: [], dispositions: [] }, project = vi.fn();
  Object.defineProperty(state.scans, 'forEach', { value: project });
  expect(() => securityInspection(state, { sessionId: 's', workspaceRoot: '/w' })).toThrow('inert JSON source');
  expect(project).not.toHaveBeenCalled();
});

it('refuses a hidden required inspection proxy without trapping it', () => {
  const trap = vi.fn(), scans = new Proxy([], { get: trap });
  const state = Object.defineProperty({ version: 1, remediations: [], dispositions: [] }, 'scans', { value: scans });
  expect(() => securityInspection(state as SecurityState, { sessionId: 's', workspaceRoot: '/w' })).toThrow('inert JSON source');
  expect(trap).not.toHaveBeenCalled();
});

it('refuses executable primitive conversion before retained projection can grow the source', () => {
  const convert = vi.fn(() => 'retained');
  for (const key of ['toString', 'valueOf', Symbol.toPrimitive]) {
    expect(() => admitJsonSource({ nested: { [key]: convert } })).toThrow('inert JSON source');
  }
  expect(convert).not.toHaveBeenCalled();
});

it('refuses custom function prototypes before inherited primitive conversion', () => {
  const convert = vi.fn(() => 'retained'), value = () => undefined;
  Object.setPrototypeOf(value, { toString: convert });
  expect(() => admitJsonSource({ id: value })).toThrow('inert JSON source'); expect(convert).not.toHaveBeenCalled();
});
