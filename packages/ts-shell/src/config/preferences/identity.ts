import { isRecord } from '../../core/values/record.js';
import { normalizeConnectionId } from '../values.js';
import { PREFERENCE_KEYS, PreferenceDocumentError, type ConnectionPreference, type ModelPreferences, type Preference } from './contract.js';

export type RawDocument = Record<string, unknown>;

/** Copy raw preference declarations; expansion belongs to the validated user layer. */
export function preference(record: RawDocument): Preference {
  const result: Record<string, unknown> = {};
  for (const key of PREFERENCE_KEYS) {
    if (!Object.hasOwn(record, key) || record[key] === undefined) continue;
    const value = record[key];
    if (key === 'thinkingEffort' ? ![null, 'low', 'medium', 'high'].includes(value as null | string) : typeof value !== 'string') {
      throw new PreferenceDocumentError();
    }
    result[key] = value;
  }
  return result as Preference;
}

export function providerRecords(value: unknown): Record<string, RawDocument> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new PreferenceDocumentError();
  return Object.fromEntries(Object.entries(value).map(([provider, record]) => {
    if (!isRecord(record) || ['__proto__', 'constructor', 'prototype'].includes(provider)) throw new PreferenceDocumentError();
    return [provider, record];
  }));
}

/** Normalized IDs are unique across providers, matching the active-ID contract. */
export function connectionRecords(value: unknown): RawDocument[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new PreferenceDocumentError();
  const seen = new Set<string>();
  return value.map(record => {
    if (!isRecord(record) || typeof record.id !== 'string' || typeof record.provider !== 'string'
      || !record.provider.trim()) throw new PreferenceDocumentError();
    const id = normalizeConnectionId(record.id);
    if (!id || seen.has(id)) throw new PreferenceDocumentError();
    seen.add(id);
    return record;
  });
}

export function preferenceEnvelope(value: unknown): ModelPreferences | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'providers' && key !== 'connections')) throw new PreferenceDocumentError();
  const providers = providerRecords(value.providers);
  const connections = connectionRecords(value.connections);
  for (const record of [...Object.values(providers), ...connections]) {
    if (Object.keys(record).some(key => !PREFERENCE_KEYS.includes(key as typeof PREFERENCE_KEYS[number])
      && !(connections.includes(record) && (key === 'id' || key === 'provider')))) throw new PreferenceDocumentError();
    preference(record);
  }
  return { ...(value.providers !== undefined ? { providers: Object.fromEntries(Object.entries(providers).map(([key, record]) => [key, preference(record)])) } : {}),
    ...(value.connections !== undefined ? { connections: connections.map(record => ({ id: normalizeConnectionId(record.id as string)!,
      provider: record.provider as string, ...preference(record) } satisfies ConnectionPreference)) } : {}) };
}

export function matchingConnection(records: readonly RawDocument[], id: string, provider: string): RawDocument | undefined {
  return records.find(record => normalizeConnectionId(record.id as string) === normalizeConnectionId(id) && record.provider === provider);
}

export function withoutPreferences(record: RawDocument): RawDocument {
  const result = { ...record };
  for (const key of PREFERENCE_KEYS) delete result[key];
  return result;
}
