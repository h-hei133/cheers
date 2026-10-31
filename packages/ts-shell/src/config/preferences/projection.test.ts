import { expect, it } from 'vitest';
import { credentialSchema, connectionSchema, listSchema, objectSchema } from '../schema.js';
import { origin, traceValue } from '../provenance/model.js';
import { createPreferenceSchema, PreferenceDocumentError } from './contract.js';
import { joinPreferences } from './documents.js';
import { projectPreferenceOrigins } from './projection.js';

const authFile = { path: '/synthetic/auth.json', revision: 'auth-revision', source: 'user' as const };
const settingsFile = { path: '/synthetic/config.json', revision: 'settings-revision', source: 'user' as const };

it('maps preference order to connection identity and retains credential origins with exact summaries', () => {
  const raw = { providerCredentials: { openai: { apiKey: 'synthetic-secret', model: 'old-provider', thinkingEffort: 'low' } },
    providerConnections: [{ id: 'second', provider: 'openai', apiKey: 'synthetic-second', model: 'old-second' },
      { id: ' first ', provider: 'google', apiKey: 'synthetic-first', model: 'old-first', thinkingEffort: 'high', serviceTier: 'priority' }],
    modelPreferences: { providers: { openai: { model: 'new-provider' } },
      connections: [{ id: 'first', provider: 'google', thinkingEffort: null }, { id: 'second', provider: 'openai', model: 'new-second' }] } };
  const trace = { providerCredentials: traceValue(raw.providerCredentials, objectSchema({ openai: credentialSchema, google: credentialSchema }), 'user', authFile),
    providerConnections: traceValue(raw.providerConnections, listSchema(connectionSchema(['openai', 'google'])), 'user', authFile),
    modelPreferences: traceValue(raw.modelPreferences, createPreferenceSchema(['openai', 'google']), 'user', settingsFile), theme: origin('user', settingsFile) };
  const projected = projectPreferenceOrigins(joinPreferences(raw), raw.modelPreferences, trace);
  expect(projected.modelPreferences).toBeUndefined();
  expect(projected.theme).toBe(trace.theme);
  expect(projected.providerCredentials.children?.openai.children?.apiKey).toBe(trace.providerCredentials.children?.openai.children?.apiKey);
  expect(projected.providerCredentials.children?.openai.children?.model.files).toEqual([settingsFile]);
  expect(projected.providerCredentials.children?.openai.children?.thinkingEffort).toBeUndefined();
  expect(projected.providerConnections.children?.['0'].children?.model.files).toEqual([settingsFile]);
  expect(projected.providerConnections.children?.['1'].children?.thinkingEffort.files).toEqual([settingsFile]);
  expect(projected.providerConnections.children?.['1'].children?.model).toBeUndefined();
  expect(projected.providerConnections.children?.['1'].children?.serviceTier).toBeUndefined();
  expect(projected.providerConnections.children?.['1'].children?.id).toBe(trace.providerConnections.children?.['1'].children?.id);
  expect(projected.providerConnections.files).toEqual([authFile, settingsFile]);
  expect(projected.providerConnections.shadowedFiles).toContainEqual(authFile);
  expect(JSON.stringify(projected)).not.toMatch(/synthetic-secret|synthetic-first|old-provider|new-second|second|first/);
  expect(trace.providerConnections.children?.['1'].children?.model.files).toEqual([authFile]);
});

it('creates preference-only provider origins and removes deleted leaf origins for empty owners', () => {
  const envelope = { providers: { openai: { model: 'selected' }, google: {} }, connections: [{ id: 'one', provider: 'openai' }] };
  const raw = { providerConnections: [{ id: 'one', provider: 'openai', apiKey: 'synthetic', model: 'deleted', thinkingEffort: 'low' }], modelPreferences: envelope };
  const trace = { providerConnections: traceValue(raw.providerConnections, listSchema(connectionSchema(['openai', 'google'])), 'user', authFile),
    modelPreferences: traceValue(envelope, createPreferenceSchema(['openai', 'google']), 'user', settingsFile) };
  const projected = projectPreferenceOrigins(joinPreferences(raw), envelope, trace);
  expect(projected.providerCredentials.children?.openai.children?.model.files).toEqual([settingsFile]);
  expect(projected.providerCredentials.children?.google.sources).toEqual(['default']);
  expect(projected.providerConnections.children?.['0'].children?.model).toBeUndefined();
  expect(projected.providerConnections.children?.['0'].children?.thinkingEffort).toBeUndefined();
  expect(projected.providerConnections.files).toEqual([authFile]);
  expect(() => projectPreferenceOrigins({ providerConnections: [] }, envelope, trace)).toThrow(PreferenceDocumentError);
});
