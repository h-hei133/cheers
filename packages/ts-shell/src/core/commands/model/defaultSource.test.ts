import { expect, it } from 'vitest';
import { modelDefaultSource, modelDefaultSourceLine } from './defaultSource.js';

it.each([
  { name: 'both layers agree', input: { connectionModel: 'same', providerModel: 'same' },
    layer: 'connection', effective: 'same', agrees: true, line: 'Model source: connection, the same value as the provider default.' },
  { name: 'the connection shadows a different provider value', input: { connectionModel: 'connection-model', providerModel: 'provider-model' },
    layer: 'connection', effective: 'connection-model', overridden: 'provider-model',
    line: 'Model source: connection, overriding the provider default provider-model.' },
  { name: 'only the connection holds a default', input: { connectionModel: 'connection-model' },
    layer: 'connection', effective: 'connection-model', line: 'Model source: connection.' },
  { name: 'only the provider holds a default', input: { providerModel: 'provider-model' },
    layer: 'provider', effective: 'provider-model', line: 'Model source: provider default.' },
  { name: 'the provider slot falls back to the account default', input: { accountDefault: 'gpt-5.4' },
    layer: 'account-default', effective: 'gpt-5.4', line: 'Model source: account default.' },
  { name: 'nothing is stored', input: {}, layer: 'unset', effective: undefined, line: undefined },
] as const)('projects $name', ({ input, layer, effective, line, name: _name, ...expected }) => {
  const source = modelDefaultSource(input);
  expect(source).toMatchObject({ layer, ...(effective === undefined ? {} : { effective }), ...expected });
  expect(source.effective).toBe(effective);
  expect(modelDefaultSourceLine(source)).toBe(line);
});

it('treats blank leaves as absent rather than as an empty model', () => {
  expect(modelDefaultSource({ connectionModel: '  ', providerModel: 'provider-model' }))
    .toEqual({ layer: 'provider', effective: 'provider-model' });
  expect(modelDefaultSource({ connectionModel: ' ', providerModel: '' })).toEqual({ layer: 'unset' });
});
