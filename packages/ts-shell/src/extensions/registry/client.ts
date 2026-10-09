import { verify } from 'node:crypto';
import { requestBrowser } from '../../core/network/connection.js';
import { requestScope, withinRequest } from '../../core/network/request.js';
import { isOffline } from '../../core/network/policy.js';
import { classifyBlockedHost, isPublicAddress } from '../../core/security/egressGuard.js';
import { isRecord } from '../../core/values/record.js';
import { sourceUrl } from './sources.js';
import { canonical, name, page, release, text, version } from './validation.js';
import type { CatalogPage, ExtensionSource, Release } from '../model.js';

export const ARCHIVE_BYTES = 8 * 1024 * 1024;
export async function registryBytes(source: ExtensionSource, input: string, maxBytes: number, signal?: AbortSignal, configuredOffline = false): Promise<Buffer> {
  if (isOffline({ configuredOffline })) throw new Error('Registry is offline; no request was sent.');
  const base = sourceUrl(source.url); const url = new URL(input, `${base.toString().replace(/\/$/, '')}/`);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`) || url.username || url.password || url.hash) throw new Error('Registry destination differs from the explicitly selected source.');
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(base.hostname);
  const scope = requestScope(15_000, signal);
  try {
    const response = await requestBrowser(url.toString(), { maxBytes, headers: { 'accept-encoding': 'identity' } }, scope, {
      admitUrl: value => value === url.toString(), admitAddress: address => isPublicAddress(address) || (loopback && classifyBlockedHost(address)?.class === 'loopback'),
    });
    if (response.status >= 300 && response.status < 400) throw new Error('Registry redirect refused; register and review its destination explicitly.');
    if (!response.ok) throw new Error(`Registry HTTP ${response.status}.`);
    const body = await withinRequest(response.arrayBuffer(), scope); scope.check();
    if (body.byteLength > maxBytes) throw new Error('Registry response exceeded its limit.');
    return Buffer.from(body);
  } catch (error) {
    if (error instanceof Error && /^Registry /.test(error.message)) throw error;
    throw new Error(signal?.aborted ? 'Registry request cancelled.' : 'Registry transport failed or exceeded its bound.');
  } finally { scope.dispose(); }
}
async function signed(source: ExtensionSource, url: string, signal?: AbortSignal, offline?: boolean): Promise<unknown> {
  if (!source.trust) throw new Error('Registry is untrusted; select an independent public trust anchor.');
  let envelope: unknown;
  try { envelope = JSON.parse((await registryBytes(source, url, 512 * 1024, signal, offline)).toString('utf8')); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('Malformed registry JSON.'); throw error; }
  if (!isRecord(envelope) || envelope.keyId !== source.trust.keyId || typeof envelope.signature !== 'string' || envelope.signature.length > 256 || !isRecord(envelope.payload)) throw new Error('Untrusted registry signature envelope.');
  if (!verify(null, Buffer.from(canonical(envelope.payload)), source.trust.publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Untrusted registry signature.');
  return envelope.payload;
}
export async function search(source: ExtensionSource, query: string, cursor?: string, signal?: AbortSignal, offline?: boolean): Promise<CatalogPage> {
  text(query, 256); if (cursor) text(cursor, 512);
  const parameters = new URLSearchParams({ q: query, limit: '20', ...(cursor ? { cursor } : {}) });
  const result = page(await signed(source, `v1/search?${parameters}`, signal, offline));
  if (cursor && result.nextCursor === cursor) throw new Error('Registry pagination cursor repeated.');
  return result;
}
export async function details(source: ExtensionSource, packageName: string, signal?: AbortSignal, offline?: boolean): Promise<readonly Release[]> {
  name(packageName); const value = await signed(source, `v1/packages/${encodeURIComponent(packageName)}`, signal, offline);
  if (!isRecord(value) || value.protocol !== 'extension-registry/v1' || value.name !== packageName || !Array.isArray(value.versions) || value.versions.length > 32) throw new Error('Malformed registry package details.');
  const versions = value.versions.map(release);
  if (versions.some(entry => entry.manifest.name !== packageName) || new Set(versions.map(entry => entry.manifest.version)).size !== versions.length) throw new Error('Registry package identity is inconsistent.');
  for (const entry of versions) { const url = new URL(entry.url, `${source.url.replace(/\/$/, '')}/`); if (url.origin !== sourceUrl(source.url).origin) throw new Error('Package destination differs from the selected source.'); }
  return versions;
}
export async function exact(source: ExtensionSource, packageName: string, pinned: string, signal?: AbortSignal, offline?: boolean): Promise<Release> {
  version(pinned); const release = (await details(source, packageName, signal, offline)).find(entry => entry.manifest.version === pinned);
  if (!release) throw new Error('Exact extension version is unavailable.');
  return release;
}
