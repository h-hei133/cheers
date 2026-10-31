import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { createPreferenceSchema, PreferenceDocumentError } from './contract.js';
import { extractPreferences, joinPreferences, stagePreferences, stripPreferences } from './documents.js';
import { preferredEffort } from '../../core/models/effort.js';
import { resolveConfigReferences } from '../references.js';

describe('model preference documents', () => {
  it('accepts only fixed provider owners and preference fields with existing reference traversal', () => {
    const schema = createPreferenceSchema(['openai', 'google']);
    const ajv = new Ajv({ strict: true });
    ajv.addKeyword({ keyword: 'environment', schemaType: 'boolean', valid: true });
    const validate = ajv.compile(schema);
    expect(validate({ providers: { openai: { model: '$$RAW_MODEL', thinkingEffort: null } },
      connections: [{ id: 'one', provider: 'google', model: '$$CONNECTION_MODEL', serviceTier: 'flex' }] })).toBe(true);
    expect(resolveConfigReferences({ providers: { openai: { model: '$$RAW_MODEL' } },
      connections: [{ id: 'one', provider: 'google', model: '$$CONNECTION_MODEL' }] }, schema, { bytes: 0 }))
      .toEqual({ providers: { openai: { model: '$RAW_MODEL' } }, connections: [{ id: 'one', provider: 'google', model: '$CONNECTION_MODEL' }] });
    for (const value of [
      { providers: { unknown: { model: 'model' } } }, { providers: { openai: { apiKey: 'synthetic' } } },
      { connections: [{ id: 'one', provider: 'openai', baseUrl: 'https://example.invalid' }] },
      { connections: [{ id: 'one', provider: 'openai', thinkingEffort: 'unavailable' }] },
    ]) expect(validate(value)).toBe(false);
  });

  it('owns only matching records without mutating raw credential and transport data', () => {
    const value = { theme: 'dark', providerCredentials: { openai: { apiKey: 'synthetic-key', model: 'legacy', thinkingEffort: 'high', serviceTier: 'priority' } },
      providerConnections: [{ id: ' two ', provider: 'openai', apiKey: 'synthetic-two', baseUrl: 'https://two.invalid/v1', model: 'legacy-two' },
        { id: 'one', provider: 'google', apiKey: 'synthetic-one', model: 'untouched' }],
      modelPreferences: { providers: { openai: { model: '${UNRESOLVED_MODEL}', thinkingEffort: null } },
        connections: [{ id: 'two', provider: 'openai', model: 'owned-two' }] } };
    const before = structuredClone(value);
    expect(joinPreferences(value)).toEqual({ theme: 'dark', providerCredentials: { openai: { apiKey: 'synthetic-key', model: '${UNRESOLVED_MODEL}', thinkingEffort: null } },
      providerConnections: [{ id: ' two ', provider: 'openai', apiKey: 'synthetic-two', baseUrl: 'https://two.invalid/v1', model: 'owned-two' },
        { id: 'one', provider: 'google', apiKey: 'synthetic-one', model: 'untouched' }] });
    expect(value).toEqual(before);
  });

  it('uses empty owned records to suppress every legacy leaf while preserving ordinary inheritance', () => {
    const joined = joinPreferences({ providerCredentials: { openai: { model: 'provider-model', thinkingEffort: 'high' } },
      providerConnections: [{ id: 'one', provider: 'openai', model: 'old-model', thinkingEffort: 'low', serviceTier: 'flex', apiKey: 'synthetic' }],
      modelPreferences: { connections: [{ id: 'one', provider: 'openai' }] } });
    const connections = joined.providerConnections as Array<{ thinkingEffort?: 'high' | null }>;
    const providers = joined.providerCredentials as { openai: { thinkingEffort?: 'high' | null } };
    expect(joined.providerConnections).toEqual([{ id: 'one', provider: 'openai', apiKey: 'synthetic' }]);
    expect(preferredEffort(connections[0], providers.openai)).toBe('high');
    const explicit = joinPreferences({ ...joined, modelPreferences: { connections: [{ id: 'one', provider: 'openai', thinkingEffort: null }] } });
    expect(preferredEffort((explicit.providerConnections as typeof connections)[0], providers.openai)).toBeNull();
    expect(joinPreferences({ ...joined, modelPreferences: { providers: { openai: {} } } }).providerCredentials).toEqual({ openai: {} });
  });

  it('supports a provider preference without synthesizing credentials or a connection', () => {
    expect(joinPreferences({ modelPreferences: { providers: { openai: { model: 'preferred', thinkingEffort: null } } } }))
      .toEqual({ providerCredentials: { openai: { model: 'preferred', thinkingEffort: null } } });
    expect(joinPreferences({ modelPreferences: { providers: { openai: {} } } })).toEqual({ providerCredentials: { openai: {} } });
  });

  it.each([
    { providerConnections: [{ id: 'one', provider: 'openai' }], modelPreferences: { connections: [{ id: 'one', provider: 'google' }] } },
    { providerConnections: [], modelPreferences: { connections: [{ id: 'private-orphan', provider: 'openai' }] } },
    { providerConnections: [{ id: 'one', provider: 'openai' }, { id: ' one ', provider: 'google' }], modelPreferences: {} },
    { providerConnections: [{ id: 'one', provider: 'openai' }], modelPreferences: { connections: [{ id: 'one', provider: 'openai' }, { id: ' one ', provider: 'openai' }] } },
  ])('refuses orphan, mismatched and duplicate normalized identities without reporting values', value => {
    expect(() => joinPreferences(value)).toThrow(PreferenceDocumentError);
    expect(() => joinPreferences(value)).toThrow('invalid or ambiguous ownership');
  });

  it('extracts preference owners and strips only preference leaves, preserving an exact logical round trip', () => {
    const logical = { theme: 'dark', providerCredentials: { openai: { apiKey: 'synthetic', model: '${RAW_MODEL}', thinkingEffort: null }, google: {} },
      providerConnections: [{ id: ' one ', provider: 'openai', apiKey: 'synthetic-one', model: 'first', thinkingEffort: 'low', serviceTier: 'flex', future: true },
        { id: 'two', provider: 'google', accountAuth: { google: { token: 'synthetic' } } }] };
    const before = structuredClone(logical);
    const modelPreferences = extractPreferences(logical);
    expect(modelPreferences).toEqual({ providers: { openai: { model: '${RAW_MODEL}', thinkingEffort: null } },
      connections: [{ id: 'one', provider: 'openai', model: 'first', thinkingEffort: 'low', serviceTier: 'flex' }] });
    const stripped = stripPreferences(logical);
    expect(stripped).toEqual({ theme: 'dark', providerCredentials: { openai: { apiKey: 'synthetic' }, google: {} },
      providerConnections: [{ id: ' one ', provider: 'openai', apiKey: 'synthetic-one', future: true },
        { id: 'two', provider: 'google', accountAuth: { google: { token: 'synthetic' } } }] });
    expect(joinPreferences({ ...stripped, modelPreferences })).toEqual(logical);
    expect(logical).toEqual(before);
    expect(extractPreferences({ theme: 'dark' })).toEqual({});
    expect(stripPreferences({ modelPreferences, theme: 'dark' })).toEqual({ theme: 'dark' });
  });

  it('keeps existing empty owners after leaf deletion without inventing credential-only owners', () => {
    const logical = { providerCredentials: { openai: { apiKey: 'synthetic' }, google: {} },
      providerConnections: [{ id: 'one', provider: 'openai', apiKey: 'synthetic-one' }, { id: 'two', provider: 'google' }] };
    expect(extractPreferences(logical)).toEqual({});
    const previous = { providers: { openai: { model: 'removed' }, google: {} },
      connections: [{ id: 'one', provider: 'openai', thinkingEffort: 'low' }, { id: 'removed', provider: 'google', model: 'gone' }] };
    expect(extractPreferences(logical, previous)).toEqual({ providers: { openai: {}, google: {} },
      connections: [{ id: 'one', provider: 'openai' }] });
    expect(extractPreferences({ providerCredentials: { google: {} }, providerConnections: [] }, previous))
      .toEqual({ providers: { google: {} } });
    const stripped = stripPreferences(logical);
    expect(joinPreferences({ ...stripped, modelPreferences: extractPreferences(logical, previous) })).toEqual(logical);
  });

  it('preserves source preferences during staging without reverting desired credential or transport edits', () => {
    const current = { providerCredentials: { openai: { apiKey: 'old-key', model: 'old-provider', thinkingEffort: 'high' }, anthropic: { apiKey: 'removed-slot', model: 'removed-provider' } },
      providerConnections: [{ id: ' one ', provider: 'openai', apiKey: 'old-connection', baseUrl: 'https://old.invalid', model: 'old-model', serviceTier: 'flex' },
        { id: 'removed', provider: 'openai', model: 'removed-model' }] };
    const final = { providerCredentials: { openai: { apiKey: 'new-key', model: 'new-provider' }, google: { apiKey: 'new-provider', model: 'new-google' } },
      providerConnections: [{ id: 'one', provider: 'openai', apiKey: 'new-connection', baseUrl: 'https://new.invalid', model: 'new-model' },
        { id: 'added', provider: 'openai', apiKey: 'newly-added', model: 'added-model' }] };
    const stage = stagePreferences(final, current);
    expect(stage).toEqual({ providerCredentials: { openai: { apiKey: 'new-key', model: 'old-provider', thinkingEffort: 'high' }, google: { apiKey: 'new-provider' },
      anthropic: { apiKey: 'removed-slot', model: 'removed-provider' } },
      providerConnections: [{ id: 'one', provider: 'openai', apiKey: 'new-connection', baseUrl: 'https://new.invalid', model: 'old-model', serviceTier: 'flex' },
        { id: 'added', provider: 'openai', apiKey: 'newly-added' }, { id: 'removed', provider: 'openai', model: 'removed-model' }] });
    // A settings-write failure leaves every previous owned record readable.
    expect(() => joinPreferences({ ...stage, modelPreferences: extractPreferences(current) })).not.toThrow();
    const joined = joinPreferences({ ...stage, modelPreferences: extractPreferences(final) });
    expect((joined.providerConnections as Array<{ id: string; model?: string }>)[0].model).toBe('new-model');
    expect(stripPreferences(final).providerConnections).toHaveLength(2);
    expect(current.providerCredentials.anthropic).toEqual({ apiKey: 'removed-slot', model: 'removed-provider' });
    expect(() => stagePreferences({ providerConnections: [{ id: 'removed', provider: 'google' }] }, current)).toThrow(PreferenceDocumentError);
    expect(stagePreferences({}, current)).toEqual(current);
  });
});
