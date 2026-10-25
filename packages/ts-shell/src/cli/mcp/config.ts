import path from 'node:path';
import { createHash } from 'node:crypto';
import { CONFIG_MAX_BYTES } from '../../config/syntax.js';
import { patchConfigDocument } from '../../config/patch.js';
import { filePublication } from '../../edit/authority/publication.js';
import { pathIdentity, readTextFile } from '../../core/workspace/files.js';
import { runPreparedTool } from '../../turn/invoke.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { mcpSyntax } from '../../core/commands/mcp/syntax.js';
import { checkTarget } from './policy.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import { redactReportText } from '../../core/security/redaction.js';
import { loadMcpConfigs, mcpConfigPath, readMcpDocument } from '../../core/mcp/config/document.js';
import { isMcpEnableOverride, mcpServerName, parseMcpDefinition } from '../../core/mcp/config/definition.js';
import type { McpConfigScope, ScopedMcpServerConfig } from '../../core/mcp/types.js';

export interface McpConfigHost {
  readonly root: string; readonly trusted: () => boolean; readonly gate: () => ToolGateOptions;
  readonly sourceAccess: (absolute: string) => void; readonly changed: (target?: string) => Promise<void>;
  readonly signal?: AbortSignal;
  readonly onAuthorizeUrl?: (url: string) => void;
}

function report(output: string, status = 'inspected', connection = 'not-tested'): LocalCommandResult {
  const safe = redactReportText(output, 48_000, { preserveLines: true }).split('\n').map(neutraliseForDisplay);
  return { kind: 'local', output: safe.join('\n'), report: { version: 1, title: 'MCP configuration', facts: { status, connection },
    lines: safe.map(text => ({ kind: 'text', spans: [{ text, role: 'text' }] })) } };
}

function summary(name: string, config: ScopedMcpServerConfig): string {
  return `${name}: ${config.enabled === false ? 'disabled' : 'enabled'}; transport=${config.transport}; scope=${config.scope}; source=${JSON.stringify(config.sourcePath)}${config.overridePath ? `; override=${JSON.stringify(config.overridePath)}` : ''}`;
}

function display(config: ScopedMcpServerConfig): string {
  let url = config.url;
  if (url) { try { const parsed = new URL(url); parsed.search = ''; parsed.hash = ''; url = parsed.toString() + (new URL(config.url!).search ? ' [query omitted]' : ''); } catch { url = '[invalid URL]'; } }
  return JSON.stringify({ ...config, url,
    ...(config.args ? { args: config.args.map(() => '[configured argument omitted]') } : {}),
    ...(config.env ? { env: Object.fromEntries(Object.keys(config.env).map(key => [key, '[configured value omitted]'])) } : {}),
    ...(config.headers ? { headers: Object.fromEntries(Object.keys(config.headers).map(key => [key, '[configured value omitted]'])) } : {}),
    mockTools: undefined,
  }, null, 2);
}

export async function runMcpConfigCommand(args: readonly string[], host: McpConfigHost): Promise<LocalCommandResult> {
  const parsed = parseSyntax(mcpSyntax, args);
  if (!parsed.ok) return report(`Invalid /mcp arguments: ${parsed.reason}`, 'unchanged');
  return runConfigOperation(parsed.action.name, parsed.args, host);
}

/** Typed interactive input shares the original validation, approval and publication owner. */
export function addMcpDefinition(scope: McpConfigScope, name: string, definition: unknown, host: McpConfigHost): Promise<LocalCommandResult> {
  return runConfigOperation('add', [scope, name], host, definition);
}

async function runConfigOperation(action: string, values: readonly string[], host: McpConfigHost, definitionInput?: unknown): Promise<LocalCommandResult> {
  const options = host.gate();
  try {
    const refused = options.admission?.(); if (refused) throw new Error(refused);
    if (action === 'list' || action === 'show') {
      checkTarget(mcpConfigPath(host.root, 'user'), options, false);
      if (host.trusted()) checkTarget(mcpConfigPath(host.root, 'project'), options, false);
    }
    const configs = action === 'list' || action === 'show' ? loadMcpConfigs(host.root, host.trusted()) : Object.create(null) as Record<string, ScopedMcpServerConfig>;
    if (action === 'list') return report(['MCP definitions (no connections opened)', ...Object.entries(configs).map(([name, config]) => summary(name, config))].join('\n'));
    if (action === 'show') {
      const config = configs[mcpServerName(values[0]!)]; if (!config) throw new Error('MCP server was not found.');
      checkTarget(config.sourcePath!, options, false);
      if (config.overridePath) checkTarget(config.overridePath, options, false);
      return report(`${summary(values[0]!, config)}\nArguments, environment/header values and URL queries are omitted.\n${display(config)}`);
    }
    const scope = values[0] as McpConfigScope; const name = mcpServerName(values[1]!);
    if (!['add', 'edit', 'remove', 'enable', 'disable'].includes(action) || scope !== 'user' && scope !== 'project') throw new Error('Unsupported MCP configuration operation.');
    if (scope === 'project' && !host.trusted()) throw new Error('MCP project configuration changes require a trusted workspace.');
    const target = mcpConfigPath(host.root, scope); checkTarget(target, options);
    const targetIdentity = pathIdentity(target);
    const snapshot = readMcpDocument(target, false);
    const servers = { ...(snapshot?.values.mcpServers as Record<string, unknown> ?? {}) };
    const exists = Object.hasOwn(servers, name);
    let dependency: string | undefined;
    let source: { path: string; text: string; identity: string } | undefined;
    if (action === 'add' || action === 'edit') {
      if (action === 'add' ? exists : !exists) throw new Error(action === 'add' ? 'An MCP definition already exists in this scope; use edit.' : 'No MCP definition exists in this scope.');
      let text: string;
      if (definitionInput !== undefined) text = JSON.stringify(definitionInput);
      else {
        const input = path.resolve(host.root, values[2]!); host.sourceAccess(input);
        const content = readTextFile(input, 32 * 1024); if (content === undefined) throw new Error('MCP definition input file was not found.');
        text = content; source = { path: input, text, identity: pathIdentity(input) };
      }
      servers[name] = parseMcpDefinition(text);
    } else if (action === 'remove') {
      if (!exists) throw new Error('No MCP definition exists in this scope.');
      delete servers[name];
    } else if (exists && !isMcpEnableOverride(servers[name])) servers[name] = { ...(servers[name] as Record<string, unknown>), enabled: action === 'enable' };
    else {
      checkTarget(mcpConfigPath(host.root, 'user'), options, false);
      Object.assign(configs, loadMcpConfigs(host.root, host.trusted()));
      if (scope !== 'project' || !Object.hasOwn(configs, name) || configs[name]!.scope !== 'user') throw new Error('No MCP definition exists to enable or disable.');
      dependency = JSON.stringify(configs[name]);
      servers[name] = { enabled: action === 'enable' };
    }
    const next = patchConfigDocument(snapshot, { ...snapshot?.values, mcpServers: servers });
    const validateNext = () => {
      if (scope === 'project' || host.trusted()) checkTarget(mcpConfigPath(host.root, scope === 'user' ? 'project' : 'user'), options, false);
      loadMcpConfigs(host.root, host.trusted(), { scope, text: next });
    };
    validateNext();
    const currentAdmission = () => {
      try {
        checkTarget(target, options);
        if (mcpConfigPath(host.root, scope) !== target) return 'FILE_CONTENT_CHANGED: MCP configuration source changed.';
        return scope === 'project' && !host.trusted() ? 'MCP project trust changed.' : undefined;
      }
      catch (error) { return error instanceof Error ? error.message : 'MCP configuration admission refused.'; }
    };
    const admission = () => {
      const refused = currentAdmission(); if (refused) return refused;
      try {
        if (pathIdentity(target) !== targetIdentity || readTextFile(target, CONFIG_MAX_BYTES) !== snapshot?.text) return 'FILE_CONTENT_CHANGED: MCP configuration baseline changed.';
        if (source) {
          host.sourceAccess(source.path);
          if (pathIdentity(source.path) !== source.identity || readTextFile(source.path, 32 * 1024) !== source.text) return 'FILE_CONTENT_CHANGED: MCP definition input changed.';
        }
        if (dependency !== undefined && JSON.stringify(loadMcpConfigs(host.root, host.trusted())[name]) !== dependency) return 'FILE_CONTENT_CHANGED: inherited MCP definition changed.';
        validateNext();
        return undefined;
      } catch (error) { return error instanceof Error ? error.message : 'MCP configuration input admission refused.'; }
    };
    const definition = servers[name];
    const preview = `${scope} server ${JSON.stringify(name)}: ${action}\n${definition ? display({ ...(definition as ScopedMcpServerConfig), scope, sourcePath: target }) : '(remove scoped entry)'}\nExact next file SHA-256: ${createHash('sha256').update(next).digest('hex')}; ${Buffer.byteLength(next)} bytes.\nArguments, environment/header values are omitted; approval binds exact bytes. Saving does not start a server or approve remote operations.`;
    const result = await runPreparedTool(filePublication(target, next, CONFIG_MAX_BYTES, admission, currentAdmission, 'MCP configuration', preview), {},
      { ...options, admission }, host.signal, undefined, 'MCP configuration publication', { eventKey: 'mcpPublication' });
    const status = String(result.metadata?.status ?? 'unchanged');
    if (status !== 'unchanged') {
      try { await host.changed(); }
      catch { return report(`${result.output}\nMCP runtime invalidation failed; inspect connections before retrying. Persistence and connection cleanup are separate.`, status, 'cleanup-unverified'); }
    }
    return report(result.output + (status === 'unchanged' ? '' : '\nChanged connections were invalidated; explicit /mcp test or /mcp reconnect starts discovery.'), status, status === 'unchanged' ? 'unchanged' : 'not-tested');
  } catch (error) { return report(error instanceof Error ? error.message : 'MCP configuration operation refused.', 'unchanged'); }
}
