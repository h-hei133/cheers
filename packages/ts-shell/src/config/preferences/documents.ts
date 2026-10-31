import { PREFERENCE_FIELD, PreferenceDocumentError, type ModelPreferences } from './contract.js';
import { connectionRecords, matchingConnection, preference, preferenceEnvelope, providerRecords, withoutPreferences, type RawDocument } from './identity.js';

/** A present owner replaces all legacy leaves, including when its record is empty. */
export function joinPreferences(value: RawDocument): RawDocument {
  const envelope = preferenceEnvelope(value[PREFERENCE_FIELD]);
  const result = { ...value }; delete result[PREFERENCE_FIELD];
  if (!envelope) return result;
  const providers = providerRecords(value.providerCredentials);
  if (envelope.providers) {
    result.providerCredentials = { ...providers, ...Object.fromEntries(Object.entries(envelope.providers).map(([provider, owned]) =>
      [provider, { ...withoutPreferences(Object.hasOwn(providers, provider) ? providers[provider]! : {}), ...owned }])) };
  }
  const connections = connectionRecords(value.providerConnections);
  for (const owned of envelope.connections ?? []) {
    if (!matchingConnection(connections, owned.id, owned.provider)) throw new PreferenceDocumentError();
  }
  if (envelope.connections) result.providerConnections = connections.map(record => {
    const owned = envelope.connections!.find(item => matchingConnection([record], item.id, item.provider));
    return owned ? { ...withoutPreferences(record), ...preference(owned as unknown as RawDocument) } : record;
  });
  return result;
}

/** Empty ownership survives deletion; credential-only records need no settings sidecar. */
export function extractPreferences(logical: RawDocument, previousEnvelope?: unknown): ModelPreferences {
  const previous = preferenceEnvelope(previousEnvelope);
  const providers = providerRecords(logical.providerCredentials);
  const connections = connectionRecords(logical.providerConnections);
  const ownedProviders = Object.entries(providers).flatMap(([provider, record]) => {
    const selected = preference(record);
    return Object.keys(selected).length || previous?.providers && Object.hasOwn(previous.providers, provider) ? [[provider, selected] as const] : [];
  });
  const ownedConnections = connections.flatMap(record => {
    const selected = preference(record);
    return Object.keys(selected).length || previous?.connections?.some(owned => matchingConnection([record], owned.id, owned.provider))
      ? [{ id: (record.id as string).trim(), provider: record.provider as string, ...selected }] : [];
  });
  return { ...(ownedProviders.length ? { providers: Object.fromEntries(ownedProviders) } : {}),
    ...(ownedConnections.length ? { connections: ownedConnections } : {}) };
}

/** Remove only model controls; transport, credentials and unknown record fields survive. */
export function stripPreferences(logical: RawDocument): RawDocument {
  const result = { ...logical }; delete result[PREFERENCE_FIELD];
  if (logical.providerCredentials !== undefined) result.providerCredentials = Object.fromEntries(Object.entries(providerRecords(logical.providerCredentials))
    .map(([provider, record]) => [provider, withoutPreferences(record)]));
  if (logical.providerConnections !== undefined) result.providerConnections = connectionRecords(logical.providerConnections).map(withoutPreferences);
  return result;
}

/** Retain removed owners until settings readback; only final cleanup confirms their deletion. */
export function stagePreferences(finalAuth: RawDocument, currentLogical: RawDocument): RawDocument {
  const staged = stripPreferences(finalAuth);
  const providers = providerRecords(currentLogical.providerCredentials);
  const desiredProviders = providerRecords(staged.providerCredentials);
  if (staged.providerCredentials !== undefined || Object.keys(providers).length) staged.providerCredentials = {
    ...providers, ...Object.fromEntries(Object.entries(desiredProviders)
      .map(([provider, record]) => [provider, { ...record, ...(Object.hasOwn(providers, provider) ? preference(providers[provider]!) : {}) }])),
  };
  const current = connectionRecords(currentLogical.providerConnections);
  const desiredConnections = connectionRecords(staged.providerConnections);
  if (desiredConnections.some(record => current.some(previous => (previous.id as string).trim() === (record.id as string).trim()
    && previous.provider !== record.provider))) throw new PreferenceDocumentError();
  if (staged.providerConnections !== undefined || current.length) staged.providerConnections = [...desiredConnections.map(record => {
    const previous = matchingConnection(current, record.id as string, record.provider as string);
    return { ...record, ...(previous ? preference(previous) : {}) };
  }), ...current.filter(previous => !matchingConnection(desiredConnections, previous.id as string, previous.provider as string))];
  return staged;
}
