import { createHash } from 'node:crypto';
import { isRecord } from '../../core/values/record.js';
import type { ExtensionManifest, Release, CatalogPage } from '../model.js';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function text(value: unknown, max = 256): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Malformed registry text.');
  return value;
}
export function name(value: unknown): string {
  const result = text(value, 64);
  if (!/^[a-z][a-z0-9_-]*$/.test(result)) throw new Error('Invalid extension name.');
  return result;
}
export function version(value: unknown): string {
  const result = text(value, 80);
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(result)) throw new Error('An exact extension version is required.');
  return result;
}
export function relativePath(value: unknown): string {
  const result = text(value, 256);
  if (result.includes('\\') || result.startsWith('/') || result.includes(':') || result.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe extension path.');
  return result;
}
function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 32 || value.some(entry => !isRecord(entry))) throw new Error('Malformed extension capability list.');
  return value as Record<string, unknown>[];
}
function unique(values: readonly string[]): void { if (new Set(values.map(value => value.toLowerCase())).size !== values.length) throw new Error('Duplicate extension capability.'); }
export function manifest(value: unknown): ExtensionManifest {
  if (!isRecord(value) || value.schema !== 1 || !isRecord(value.permissions) || !['read', 'write'].includes(String(value.permissions.workspace)) || value.permissions.network !== 'none') throw new Error('Unsupported extension manifest or permissions.');
  const scripts = list(value.scripts).map(entry => ({ name: name(entry.name), path: relativePath(entry.path) }));
  if (scripts.some(entry => !entry.path.endsWith('.sh'))) throw new Error('Only isolated shell scripts are supported.');
  const skills = list(value.skills).map(entry => ({ path: relativePath(entry.path) }));
  const commands = list(value.commands).map(entry => {
    if (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || entry.aliases.length > 8)) throw new Error('Malformed command aliases.');
    return { name: name(entry.name), description: text(entry.description), script: name(entry.script), ...(entry.aliases ? { aliases: (entry.aliases as unknown[]).map(name) } : {}) };
  });
  const tools = list(value.tools).map(entry => ({ name: name(entry.name), description: text(entry.description), script: name(entry.script) }));
  unique(scripts.map(entry => entry.name)); unique(skills.map(entry => entry.path)); unique(commands.flatMap(entry => [entry.name, ...entry.aliases ?? []])); unique(tools.map(entry => entry.name));
  if ([...commands, ...tools].some(entry => !scripts.some(script => script.name === entry.script))) throw new Error('Unknown extension script.');
  const result: ExtensionManifest = { schema: 1, name: name(value.name), version: version(value.version), ...(value.description !== undefined ? { description: text(value.description) } : {}),
    permissions: { workspace: value.permissions.workspace as 'read' | 'write', network: 'none' }, skills, scripts, commands, tools };
  // Unknown fields are refused: a signed permission must not be silently ignored.
  if (canonical(result) !== canonical(value)) throw new Error('Unknown or noncanonical extension manifest fields.');
  return result;
}
export function release(value: unknown): Release {
  if (!isRecord(value) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)) throw new Error('Malformed pinned extension digest.');
  return { manifest: manifest(value.manifest), digest: value.digest, url: text(value.url, 2048) };
}
export function page(value: unknown): CatalogPage {
  if (!isRecord(value) || value.protocol !== 'extension-registry/v1' || !Array.isArray(value.packages) || value.packages.length > 20 || (value.nextCursor !== null && typeof value.nextCursor !== 'string')) throw new Error('Malformed registry page.');
  const packages = value.packages.map(entry => {
    if (!isRecord(entry) || !Array.isArray(entry.versions) || entry.versions.length > 32) throw new Error('Malformed registry package.');
    return { name: name(entry.name), ...(entry.description !== undefined ? { description: text(entry.description) } : {}), versions: entry.versions.map(version) };
  });
  unique(packages.map(entry => entry.name));
  return { protocol: 'extension-registry/v1', packages, nextCursor: value.nextCursor === null ? null : text(value.nextCursor, 512) };
}
