import { discoverOAuthServerInfo } from '@modelcontextprotocol/sdk/client/auth.js';
import { loadMcpConfigs, mcpConfigPath } from '../../../core/mcp/config/document.js';
import { pathIdentity, readTextFile } from '../../../core/workspace/files.js';
import { CONFIG_MAX_BYTES } from '../../../config/syntax.js';
import { parseSyntax } from '../../../core/commands/syntax/parse.js';
import { mcpSyntax } from '../../../core/commands/mcp/syntax.js';
import { runPreparedTool } from '../../../turn/invoke.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { redactReportText } from '../../../core/security/redaction.js';
import type { ToolDefinition } from '../../../tools/types.js';
import type { LocalCommandResult } from '../../../core/commands/types.js';
import type { McpConfigHost } from '../config.js';
import { checkTarget } from '../policy.js';
import { McpAuthService, scopedAuthFetch } from './service.js';
import { readCredentials } from './store.js';
import { validateDiscovery } from './record.js';

/** Explicit authentication uses the same prepared approval and hook path as configuration. */
export async function runMcpAuthCommand(args: readonly string[], host: McpConfigHost): Promise<LocalCommandResult> {
  const parsed = parseSyntax(mcpSyntax, args); const options = host.gate();
  let attempted = false; let persisted = false;
  try {
    if (!parsed.ok || !['auth', 'logout'].includes(parsed.action.name)) throw new Error('Invalid MCP authentication arguments.');
    checkTarget(mcpConfigPath(host.root, 'user'), options, false);
    if (host.trusted()) checkTarget(mcpConfigPath(host.root, 'project'), options, false);
    const name = parsed.args[0]!; const config = loadMcpConfigs(host.root, host.trusted())[name];
    if (!config || config.transport !== 'http' || !config.url) throw new Error('MCP authentication requires an existing HTTP server.');
    if (parsed.action.name === 'auth' && (config.enabled === false || Object.keys(config.headers ?? {}).some(key => key.toLowerCase() === 'authorization')))
      throw new Error('Enable this server and remove its static Authorization header before OAuth sign-in.');
    if (parsed.action.name === 'auth' && !host.onAuthorizeUrl) throw new Error('This host cannot present an interactive MCP authorization URL.');
    const sources = [config.sourcePath!, ...(config.overridePath ? [config.overridePath] : [])].map(target => ({ target, text: readTextFile(target, CONFIG_MAX_BYTES), identity: pathIdentity(target) }));
    const service = new McpAuthService(name, config); checkTarget(service.target, options);
    const baseline = readCredentials(service.target);
    const current = () => {
      try {
        checkTarget(service.target, options); host.signal?.throwIfAborted();
        if (JSON.stringify(loadMcpConfigs(host.root, host.trusted())[name]) !== JSON.stringify(config)
          || sources.some(source => pathIdentity(source.target) !== source.identity || readTextFile(source.target, CONFIG_MAX_BYTES) !== source.text)) return 'MCP authentication source changed.';
        return undefined;
      } catch { return 'MCP authentication authority or source is unavailable.'; }
    };
    const before = () => current() ?? (pathIdentity(service.target) !== baseline.identity || readTextFile(service.target, 64 * 1024) !== baseline.text ? 'FILE_CONTENT_CHANGED: MCP authentication baseline changed.' : undefined);
    const discovery = parsed.action.name === 'auth' ? validateDiscovery(await discoverOAuthServerInfo(config.url, { fetchFn: scopedAuthFetch(config.url, before, host.signal) })) : undefined;
    let published: ReturnType<typeof readCredentials> | undefined;
    const endpoint = new URL(config.url); endpoint.search = '';
    const tool: ToolDefinition = { name: 'mcp_auth', description: 'Explicitly sign in to or remove credentials for one MCP server.', argsSchema: { type: 'object' },
      resultAdmission: () => current() ?? (persisted && (!published || pathIdentity(service.target) !== published.identity || readTextFile(service.target, 64 * 1024) !== published.text) ? 'MCP current credential publication is unverified.' : undefined),
      prepare: () => ({ targets: [{ path: service.target, operation: 'write' }],
        permissionArgs: { path: service.target, server: name, operation: parsed.action.name },
        preview: `${parsed.action.name} ${JSON.stringify(name)} (scope=${config.scope})\nMCP endpoint: ${endpoint.href}\n${discovery ? `OAuth issuer: ${discovery.authorizationServerUrl}\nBrowser consent uses PKCE and a state-validated loopback callback. ` : 'Logout replaces credentials with a private revocation record that fences pending sign-in and renewal. '}Credentials are stored privately for this exact definition source and issuer. This does not test the connection or retry any operation.`,
        execute: async () => {
          try {
            const refusal = before(); if (refusal) throw new Error(refusal);
            attempted = true;
            if (discovery) await service.login(discovery, host.onAuthorizeUrl!, current, host.signal);
            else service.logout(current);
            persisted = true; published = readCredentials(service.target);
            await host.changed(name);
            return { success: true, output: `MCP credentials ${discovery ? 'saved' : 'removed'} for ${JSON.stringify(name)}; connection not tested. Explicit /mcp test starts discovery.`, metadata: { status: 'persisted' } };
          } catch { return { success: false, error: attempted ? `MCP authentication outcome is unverified${persisted ? '; credentials were published but connection cleanup is unverified' : '; verified credentials were not confirmed'}. No operation was automatically retried.` : 'MCP authentication was refused before dispatch.',
            metadata: { status: attempted ? 'unverified' : 'unchanged', ...(persisted ? { publication: 'persisted' } : {}) } }; }
        } }), execute: async () => ({ success: false, error: 'Explicit prepared authentication approval is required.' }),
    };
    const result = await runPreparedTool(tool, {}, { ...options, admission: before }, host.signal, undefined, 'MCP authentication', { eventKey: 'mcpAuthentication' });
    return { kind: 'local', output: result.output, report: { version: 1, title: 'MCP authentication', facts: { status: String(result.metadata?.status ?? 'unchanged'), connection: 'not-tested' },
      lines: result.output.split('\n').map(text => ({ kind: 'text', spans: [{ text, role: 'text' }] })) } };
  } catch { return { kind: 'local', output: neutraliseForDisplay(redactReportText('MCP authentication could not be prepared; inspect the server definition, trust, permissions and OAuth discovery metadata. No credential publication was confirmed.', 480)) };
  }
}
