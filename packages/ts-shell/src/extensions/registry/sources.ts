import { createPublicKey } from 'node:crypto';
import { resolveUserDataFile } from '../../core/paths/userHome.js';
import { profilePathOverride } from '../../core/paths/profile/context.js';
import { withFileLock, writeJsonFileAtomic } from '../../session/store/sessionFileStore.js';
import { isRecord } from '../../core/values/record.js';
import { readTextFile } from '../../core/workspace/files.js';
import { canonical, digest, name, text } from './validation.js';
import type { ExtensionSource, TrustAnchor } from '../model.js';

const SOURCE_CHARACTERS = 256 * 1024;

export function sourceFile(): string { return profilePathOverride('CHEERS_MARKETPLACES_FILE') || resolveUserDataFile('marketplaces.json'); }
export function sourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname))) throw new Error('Sources require HTTPS or an explicitly selected loopback HTTP address.');
  return url;
}
export function trustAnchor(keyId: string, publicKey: string, provenance: string): TrustAnchor {
  text(keyId, 64); text(provenance, 2048);
  if (publicKey.length > 4096) throw new Error('Public trust key is too large.');
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 SPKI public key is required.');
  return { keyId, publicKey: key.export({ type: 'spki', format: 'pem' }).toString(), fingerprint: digest(key.export({ type: 'spki', format: 'der' })), provenance };
}
export function readSources(): ExtensionSource[] {
  let value: unknown;
  try {
    // Trust registrations must be ordinary UTF-8 files with bounded acquisition.
    const raw = readTextFile(sourceFile(), SOURCE_CHARACTERS * 4);
    if (raw === undefined) return [];
    if (raw.length > SOURCE_CHARACTERS) throw new Error();
    value = JSON.parse(raw);
  } catch { throw new Error('Marketplace source registry could not be read.'); }
  if (!Array.isArray(value) || value.length > 64) throw new Error('Marketplace source registry must be a bounded list.');
  const sources = value.map(entry => {
    if (!isRecord(entry)) throw new Error('Invalid source registration.');
    const result: ExtensionSource = { name: name(typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : entry.name), url: text(entry.url, 2048), ...(entry.description !== undefined ? { description: text(entry.description) } : {}), ...(entry.isDefault !== undefined ? { isDefault: entry.isDefault === true } : {}) };
    if (!entry.trust) return result; // Legacy URLs remain registered, never trusted.
    if (!isRecord(entry.trust)) throw new Error('Invalid trust anchor.');
    if (typeof entry.trust.publicKey !== 'string') throw new Error('Invalid public trust key.');
    const trust = trustAnchor(text(entry.trust.keyId, 64), entry.trust.publicKey, text(entry.trust.provenance, 2048));
    if (trust.fingerprint !== entry.trust.fingerprint) throw new Error('Source trust fingerprint changed.');
    return { ...result, trust };
  });
  if (new Set(sources.map(source => source.name)).size !== sources.length) throw new Error('Duplicate source registration.');
  return sources;
}
export function sourceIdentity(source: ExtensionSource): string { return digest(canonical(source)); }
export function changeSources(change: (current: ExtensionSource[]) => ExtensionSource[] | undefined): boolean {
  return withFileLock(`${sourceFile()}.lock`, () => { const next = change(readSources()); if (!next) return false; writeJsonFileAtomic(sourceFile(), next); return true; });
}
export function selectedSource(selected: string): ExtensionSource {
  const source = readSources().find(entry => entry.name === selected);
  if (!source) throw new Error('Select a registered marketplace source.');
  sourceUrl(source.url);
  return source;
}
