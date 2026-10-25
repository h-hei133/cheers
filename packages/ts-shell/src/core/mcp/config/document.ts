import fs from 'node:fs';
import { resolveUserDataFile } from '../../paths/userHome.js';
import { resolveProjectConfigFile } from '../../paths/project.js';
import { CONFIG_MAX_BYTES, parseConfigText } from '../../../config/syntax.js';
import type { ConfigSnapshot } from '../../../config/document.js';
import { readTextFile } from '../../workspace/files.js';
import { isRecord } from '../../values/record.js';
import { isMcpEnableOverride, mcpServerDefinition, mcpServerName } from './definition.js';
import type { McpConfigScope, ScopedMcpServerConfig } from '../types.js';

export class McpConfigLoadError extends Error {
  readonly doNext: string;
  constructor(readonly configPath: string, cause: unknown) {
    super(`MCP config is invalid at ${configPath}: ${cause instanceof Error ? cause.message : 'unreadable document'}`);
    this.name = 'McpConfigLoadError';
    this.doNext = `Fix or remove ${configPath}, then run /mcp refresh all.`;
  }
}
export function isMcpConfigLoadError(error: unknown): error is McpConfigLoadError { return error instanceof McpConfigLoadError; }
export function getMcpConfigPaths(workspaceRoot: string): string[] {
  return [resolveUserDataFile('mcp.json'), resolveProjectConfigFile(workspaceRoot, 'mcp.json')];
}
export function mcpConfigPath(root: string, scope: McpConfigScope): string {
  return getMcpConfigPaths(root)[scope === 'user' ? 0 : 1]!;
}

export function readMcpDocument(target: string, validate = true): ConfigSnapshot | undefined {
  try {
    const text = readTextFile(target, CONFIG_MAX_BYTES);
    if (text === undefined) {
      try { fs.lstatSync(target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
      throw new Error('unreadable document');
    }
    return parseMcpDocument(target, text, validate);
  } catch (error) { throw error instanceof McpConfigLoadError ? error : new McpConfigLoadError(target, error); }
}

export function parseMcpDocument(target: string, text: string, validate = true): ConfigSnapshot {
  try {
    const values = parseConfigText(text);
    if (values.mcpServers !== undefined && !isRecord(values.mcpServers)) throw new Error('Expected an mcpServers object.');
    if (validate && Object.keys(values.mcpServers ?? {}).length > 256) throw new Error('MCP configuration exceeds 256 servers.');
    for (const [name, definition] of Object.entries(values.mcpServers ?? {})) {
      mcpServerName(name);
      if (validate && !isMcpEnableOverride(definition)) mcpServerDefinition(definition);
    }
    return { text, values };
  } catch (error) { throw new McpConfigLoadError(target, error); }
}

/** Project definitions replace user definitions; an enabled-only override retains its source identity. */
export function loadMcpConfigs(root: string, allowProjectScope: boolean, replacement?: { scope: McpConfigScope; text: string }): Record<string, ScopedMcpServerConfig> {
  const merged: Record<string, ScopedMcpServerConfig> = Object.create(null);
  const projectPath = allowProjectScope ? mcpConfigPath(root, 'project') : undefined;
  for (const scope of ['user', 'project'] as const) {
    if (scope === 'project' && !allowProjectScope) continue;
    const target = scope === 'project' ? projectPath! : mcpConfigPath(root, scope);
    const document = replacement?.scope === scope ? parseMcpDocument(target, replacement.text) : readMcpDocument(target);
    for (const [name, definition] of Object.entries(document?.values.mcpServers ?? {})) {
      if (isMcpEnableOverride(definition)) {
        if (scope !== 'project' || !Object.hasOwn(merged, name)) throw new McpConfigLoadError(target, new Error('An enabled-only override requires a user server definition; remove the project override before deleting its user definition.'));
        merged[name] = { ...merged[name]!, enabled: definition.enabled, overridePath: target };
      } else merged[name] = { ...mcpServerDefinition(definition), scope, sourcePath: target };
    }
  }
  if (projectPath !== undefined && mcpConfigPath(root, 'project') !== projectPath) throw new McpConfigLoadError(projectPath, new Error('configuration source changed; retry acquisition'));
  return merged;
}
