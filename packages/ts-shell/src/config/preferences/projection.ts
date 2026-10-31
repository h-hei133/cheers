import { composeOrigin, origin, replaceOrigin, type ConfigOrigin, type ConfigProvenance } from '../provenance/model.js';
import { PREFERENCE_FIELD, PREFERENCE_KEYS, PreferenceDocumentError, type Preference } from './contract.js';
import { connectionRecords, matchingConnection, preferenceEnvelope, type RawDocument } from './identity.js';

function recordOrigin(previous: ConfigOrigin | undefined, owned: Preference, incoming: ConfigOrigin | undefined): ConfigOrigin {
  const children = { ...previous?.children };
  for (const key of PREFERENCE_KEYS) {
    if (Object.hasOwn(owned, key) && owned[key] !== undefined) children[key] = replaceOrigin(children[key], incoming?.children?.[key] ?? incoming ?? origin('derived'));
    else delete children[key];
  }
  return composeOrigin(previous ?? incoming ?? origin('default'), children);
}

/** Attribute preference leaves to their actual owner; credentials retain their original trace. */
export function projectPreferenceOrigins(logical: RawDocument, envelopeValue: unknown, provenance: ConfigProvenance): ConfigProvenance {
  const envelope = preferenceEnvelope(envelopeValue);
  const result = { ...provenance }; delete result[PREFERENCE_FIELD];
  if (!envelope) return result;
  const incoming = provenance[PREFERENCE_FIELD];
  if (envelope.providers) {
    const parent = result.providerCredentials;
    const children = { ...parent?.children };
    for (const [provider, owned] of Object.entries(envelope.providers)) children[provider] = recordOrigin(children[provider], owned, incoming?.children?.providers?.children?.[provider]);
    result.providerCredentials = composeOrigin(parent ?? origin('default'), children);
  }
  if (envelope.connections) {
    const records = connectionRecords(logical.providerConnections);
    const parent = result.providerConnections;
    const children = { ...parent?.children };
    envelope.connections.forEach((owned, index) => {
      const record = matchingConnection(records, owned.id, owned.provider);
      if (!record) throw new PreferenceDocumentError();
      const key = String(records.indexOf(record));
      children[key] = recordOrigin(children[key], owned, incoming?.children?.connections?.children?.[String(index)]);
    });
    result.providerConnections = composeOrigin(parent ?? origin('default'), children);
  }
  return result;
}
