import { createHash } from 'node:crypto';
import { isRecord } from '../../core/values/record.js';
import type { ExtensionSource } from '../model.js';
import { registryBytes, registryUrl } from './client.js';
import { sourceUrl } from './sources.js';
import { text, version } from './validation.js';

const PUBLIC_REGISTRY = 'https://registry.npmjs.org';

export interface NpmRelease {
  readonly packageName: string;
  readonly version: string;
  readonly integrity: string;
  readonly url: string;
}

export function npmPackageName(value: unknown): string {
  const name = text(value, 214);
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error('Invalid npm package name.');
  return name;
}

export function npmRegistry(registry = PUBLIC_REGISTRY): ExtensionSource {
  return { name: 'npm', url: sourceUrl(text(registry, 2048)).href.replace(/\/$/, '') };
}

export function npmIntegrity(value: unknown): string {
  if (typeof value !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value)
    || Buffer.from(value.slice(7), 'base64').toString('base64') !== value.slice(7)) {
    throw new Error('A SHA-512 npm package integrity digest is required.');
  }
  return value;
}

export function verifyNpmIntegrity(bytes: Buffer, integrity: string): void {
  const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (actual !== npmIntegrity(integrity)) throw new Error('Npm archive integrity mismatch.');
}

export function npmArchiveUrl(source: ExtensionSource, value: unknown): string {
  const literal = text(value, 2048);
  const url = registryUrl(source, literal);
  if (literal !== url.href || url.search || !url.pathname.endsWith('.tgz')) throw new Error('Npm registry supplied an invalid archive URL.');
  return url.href;
}

export async function exactNpm(source: ExtensionSource, packageName: string, pinned: string, signal?: AbortSignal,
  offline?: boolean): Promise<NpmRelease> {
  const packagePath = encodeURIComponent(npmPackageName(packageName)).replace(/^%40/, '@');
  version(pinned);
  const bytes = await registryBytes(source, `${packagePath}/${encodeURIComponent(pinned)}`, 512 * 1024, signal, offline);
  let selected: unknown;
  try { selected = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Malformed npm release metadata.'); }
  if (!isRecord(selected) || selected.name !== packageName || selected.version !== pinned || !isRecord(selected.dist)) {
    throw new Error('Npm release metadata does not match the exact requested package and version.');
  }
  return { packageName, version: pinned, url: npmArchiveUrl(source, selected.dist.tarball), integrity: npmIntegrity(selected.dist.integrity) };
}
