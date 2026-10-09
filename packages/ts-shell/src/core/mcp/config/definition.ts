import { isRecord } from '../../values/record.js';
import { inspectConfigDocument, parseConfigText } from '../../../config/syntax.js';
import type { McpServerConfig } from '../types.js';

const fields = new Set(['transport', 'enabled', 'command', 'args', 'url', 'env', 'headers', 'scope', 'authRequired']);

export function mcpServerName(value: string): string {
  if (!value || value.length > 128 || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value) || value.includes('__')
    || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('Invalid MCP server name.');
  return value;
}

function strings(value: unknown, field: string): void {
  if (!isRecord(value) || Object.keys(value).length > 64 || Object.entries(value).some(([key, item]) =>
    !key || key.length > 128 || /[\x00-\x1f\x7f]/.test(key) || typeof item !== 'string' || item.length > 8192 || item.includes('\0'))) {
    throw new Error(`Invalid MCP ${field}; expected at most 64 bounded string values.`);
  }
}

/** Validate stored definitions without turning an incomplete connection into a successful one. */
export function mcpServerDefinition(value: unknown, complete = false): McpServerConfig {
  if (!isRecord(value)) throw new Error('Expected an MCP server object.');
  inspectConfigDocument(value);
  if (Object.keys(value).some(key => !fields.has(key) && (complete || key !== 'mockTools'))) throw new Error('Unsupported MCP server field.');
  for (const key of ['enabled', 'authRequired']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`Invalid MCP ${key}.`);
  for (const key of ['command', 'url']) if (value[key] !== undefined && (typeof value[key] !== 'string' || !value[key] || value[key].length > 8192 || /[\x00-\x1f\x7f]/.test(value[key]))) throw new Error(`Invalid MCP ${key}.`);
  if (value.args !== undefined && (!Array.isArray(value.args) || value.args.length > 256 || value.args.some(item => typeof item !== 'string' || item.length > 8192 || item.includes('\0')))) throw new Error('Invalid MCP args.');
  if (value.env !== undefined) strings(value.env, 'env');
  if (value.headers !== undefined) strings(value.headers, 'headers');
  if (value.scope !== undefined && value.scope !== 'user' && value.scope !== 'project') throw new Error('Invalid MCP scope.');
  const transport = value.transport ?? (value.command ? 'stdio' : value.url ? 'http' : undefined);
  if (!['stdio', 'http', 'ws', 'sdk'].includes(String(transport))) throw new Error('Expected an MCP transport or command/URL.');
  if (transport === 'stdio' && (value.url !== undefined || value.headers !== undefined) || transport === 'http' && (value.command !== undefined || value.args !== undefined || value.env !== undefined)) throw new Error('MCP transport fields cannot be mixed.');
  if (transport === 'http' && value.url !== undefined) {
    const url = new URL(value.url as string);
    if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)
      || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('MCP HTTP requires HTTPS or an explicit loopback URL without credentials or fragment.');
  }
  if (complete && (transport === 'stdio' ? !value.command : !value.url)) throw new Error('MCP definition is incomplete.');
  return { ...value, transport } as McpServerConfig;
}

export function parseMcpDefinition(text: string): McpServerConfig {
  if (Buffer.byteLength(text) > 32 * 1024) throw new Error('MCP definition exceeds 32 KiB.');
  return mcpServerDefinition(parseConfigText(text), true);
}

export function isMcpEnableOverride(value: unknown): value is { enabled: boolean } {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.enabled === 'boolean';
}
