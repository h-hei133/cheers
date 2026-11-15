import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { captureVirtualDefinition, captureVirtualDefinitions, captureModelRoute } from './capture.js';
import { snapshotData } from '../../values/data.js';
import type { VirtualModelDefinition } from './contract.js';

const model = (): VirtualModelDefinition => ({ provider: 'adaptive', id: 'auto', name: 'Automatic',
  route: () => ({ provider: 'physical', modelId: 'model' }) });

it('captures cross-realm definition arrays and nested state without relaxing ordinary JSON admission', async () => {
  const input = vm.runInNewContext(`[{ provider: 'adaptive', id: 'auto', name: 'Automatic', thinkingLevels: ['low', 'high'],
    route: () => ({ provider: 'physical', modelId: 'model', state: { values: [1, { done: true }] } }) }]`);
  const captured = captureVirtualDefinitions(input);
  const result = await captured[0]!.route({ provider: 'adaptive', modelId: 'auto', reason: 'direct', thinkingLevel: 'low', messages: [] });
  expect(result.state).toEqual({ values: [1, { done: true }] });
  expect(Object.isFrozen(result.state)).toBe(true);
  const data = vm.runInNewContext('({ values: [1, 2] })');
  expect(() => snapshotData(data, { bytes: 1024, nodes: 10, depth: 4 })).toThrow(/acyclic/);
});

it('never invokes accessor or proxy hooks while rejecting malformed definitions', () => {
  const read = vi.fn(() => 'auto');
  const accessor = Object.defineProperty(model(), 'id', { get: read });
  expect(() => captureVirtualDefinition(accessor)).toThrow(/accessors/);
  expect(() => captureVirtualDefinition(new Proxy(model(), { ownKeys: () => { read(); return []; } }))).toThrow();
  const array = ['low']; Object.defineProperty(array, '0', { get: read });
  expect(() => captureVirtualDefinition({ ...model(), thinkingLevels: array as never })).toThrow(/thinking/);
  expect(read).not.toHaveBeenCalled();
});

it.each([
  { provider: 'bad/provider' }, { id: ' model' }, { name: 'bad\u0000name' }, { contextWindow: Infinity }, { maxTokens: 0 },
  { thinkingLevels: ['high', 'high'] }, { thinkingLevels: ['unknown'] }, { unknown: true },
])('refuses invalid virtual metadata %j', invalid => {
  expect(() => captureVirtualDefinition({ ...model(), ...invalid } as VirtualModelDefinition)).toThrow();
});

it('bounds callback state and rejects nested hooks, classes, cycles and sparse arrays', () => {
  const read = vi.fn();
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const state of [Object.defineProperty({}, 'value', { get: read }), new Date(), cycle, new Array(2), 'x'.repeat(256 * 1024)]) {
    expect(() => captureModelRoute({ provider: 'physical', modelId: 'model', state })).toThrow();
  }
  expect(read).not.toHaveBeenCalled();
});
