import { createHash } from 'node:crypto';
import { isRecord } from '../../core/values/record.js';
import type { ExtensionManifest, Release, CatalogPage } from '../model.js';
import { captureFlag } from '../runtime/flag.js';
import { mcpStdioLaunch } from '../../core/mcp/config/stdio.js';
import { mcpServerName } from '../../core/mcp/config/definition.js';
import { MAX_EXTENSION_MCP_SERVERS } from '../runtime/mcp.js';
import { captureProviderEndpoint, MAX_EXTENSION_PROVIDERS } from '../runtime/provider.js';
import { rendererType } from '../runtime/renderer.js';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function manifestForInspection(value: ExtensionManifest): ExtensionManifest {
  if (!value.mcpServers) return value;
  return { ...value, mcpServers: value.mcpServers.map(server => ({
    ...server, args: server.args.map(() => '[configured argument omitted]'),
  })) };
}
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
  if (scripts.some(entry => !/\.(?:sh|js|mjs|ts)$/.test(entry.path))) throw new Error('Only isolated shell or in-process JS/TS scripts are supported.');
  const skills = list(value.skills).map(entry => ({ path: relativePath(entry.path) }));
  const commands = list(value.commands).map(entry => {
    if (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || entry.aliases.length > 8)) throw new Error('Malformed command aliases.');
    return { name: name(entry.name), description: text(entry.description), script: name(entry.script), ...(entry.aliases ? { aliases: (entry.aliases as unknown[]).map(name) } : {}) };
  });
  const tools = list(value.tools).map(entry => ({ name: name(entry.name), description: text(entry.description), script: name(entry.script) }));
  const flags = value.flags === undefined ? undefined : list(value.flags).map(entry => {
    const flag = captureFlag(entry);
    if (entry.type === undefined) throw new Error('An installed extension flag requires its type.');
    return { ...flag, script: name(entry.script) };
  });
  const mcpServers = value.mcpServers === undefined ? undefined : list(value.mcpServers).map(entry => ({
    name: mcpServerName(name(entry.name)), ...mcpStdioLaunch(entry.command, entry.args),
  }));
  if (mcpServers) {
    if (mcpServers.length > MAX_EXTENSION_MCP_SERVERS) throw new Error('Extension MCP server registration limit exceeded.');
    unique(mcpServers.map(entry => entry.name));
  }
  const providers = value.providers === undefined ? undefined : list(value.providers).map(entry => ({
    ...captureProviderEndpoint(entry.name, entry.runtime, entry.baseUrl), script: name(entry.script),
  }));
  if (providers) {
    if (providers.length > MAX_EXTENSION_PROVIDERS) throw new Error('Extension provider registration limit exceeded.');
    if (providers.some(entry => entry.name.length > 64)) throw new Error('Installed extension provider names are limited to 64 characters.');
    unique(providers.map(entry => entry.name));
    unique(providers.map(entry => JSON.stringify([entry.runtime, entry.baseUrl])));
    if (providers.some(entry => !scripts.some(script => script.name === entry.script && /\.(?:js|mjs|ts)$/.test(script.path)))) {
      throw new Error('Installed extension providers require a declared JavaScript or TypeScript script.');
    }
  }
  const messageRenderers = value.messageRenderers === undefined ? undefined : list(value.messageRenderers).map(entry => ({
    customType: rendererType(entry.customType), script: name(entry.script),
  }));
  if (messageRenderers) {
    unique(messageRenderers.map(entry => entry.customType));
    if (messageRenderers.some(entry => !scripts.some(script => script.name === entry.script && /\.(?:js|mjs|ts)$/.test(script.path)))) {
      throw new Error('Installed message renderers require a declared JavaScript or TypeScript script.');
    }
  }
  unique(scripts.map(entry => entry.name)); unique(skills.map(entry => entry.path)); unique(commands.flatMap(entry => [entry.name, ...entry.aliases ?? []])); unique(tools.map(entry => entry.name));
  if ([...commands, ...tools].some(entry => !scripts.some(script => script.name === entry.script))) throw new Error('Unknown extension script.');
  if (flags) {
    unique(flags.map(entry => entry.name));
    if (flags.some(entry => !scripts.some(script => script.name === entry.script && /\.(?:js|mjs|ts)$/.test(script.path)))) {
      throw new Error('Installed extension flags require a declared JavaScript or TypeScript script.');
    }
  }
  const result: ExtensionManifest = { schema: 1, name: name(value.name), version: version(value.version), ...(value.description !== undefined ? { description: text(value.description) } : {}),
    permissions: { workspace: value.permissions.workspace as 'read' | 'write', network: 'none' }, skills, scripts, commands, tools,
    ...(flags ? { flags } : {}), ...(mcpServers ? { mcpServers } : {}), ...(providers ? { providers } : {}),
    ...(messageRenderers ? { messageRenderers } : {}) };
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
