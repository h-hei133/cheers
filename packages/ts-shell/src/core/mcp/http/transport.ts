import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { McpClassifiedError, classifyMcpFailure } from '../errorTaxonomy.js';
import { mcpFetch, type McpHttpAuthorization } from './fetch.js';
import { mcpHttpUrl } from './policy.js';
import type { ScopedMcpServerConfig } from '../types.js';
import type { Admission } from '../../network/admission.js';
import { McpHttpRequests } from './requests.js';
import type { RequestId } from '@modelcontextprotocol/sdk/types.js';

/** Never turn a 401 or lost response into a replay of an already dispatched operation. */
export class McpHttpTransport extends StreamableHTTPClientTransport {
  failure?: McpClassifiedError;
  private readonly requests: McpHttpRequests;
  constructor(config: ScopedMcpServerConfig, admission?: Admission, authorization?: McpHttpAuthorization) {
    const requests = new McpHttpRequests();
    super(mcpHttpUrl(config.url!), { fetch: mcpFetch(config.url!, { admission, authorization, headers: config.headers, authRequired: config.authRequired, requests }),
      reconnectionOptions: { initialReconnectionDelay: 1_000, maxReconnectionDelay: 1_000, reconnectionDelayGrowFactor: 1, maxRetries: 0 } });
    this.requests = requests;
  }
  override async start(): Promise<void> {
    const onerror = this.onerror;
    const onmessage = this.onmessage;
    this.onerror = error => { this.failure = safeHttpFailure(error); onerror?.(this.failure); };
    this.onmessage = message => { this.requests.settle(message); onmessage?.(message); };
    try { await super.start(); } catch (error) { throw this.failure = safeHttpFailure(error); }
  }
  override async send(...args: Parameters<StreamableHTTPClientTransport['send']>): Promise<void> {
    const [message] = args;
    if (Array.isArray(message)) throw safeHttpFailure(new Error('MCP HTTP batches are unsupported.'));
    this.requests.open(message);
    if ('method' in message && message.method === 'notifications/cancelled') this.requests.cancel(message.params?.requestId as RequestId);
    try { await super.send(...args); } catch (error) { throw this.failure = safeHttpFailure(error); }
  }
  override async close(): Promise<void> { this.requests.close(); await super.close(); }
}

export function safeHttpFailure(error: unknown): McpClassifiedError {
  const unauthorized = error instanceof UnauthorizedError || error instanceof StreamableHTTPError && error.code === 401
    || error instanceof Error && error.message === 'MCP authentication is required.';
  return new McpClassifiedError(classifyMcpFailure({ failureClass: unauthorized ? 'permission-denied' : 'server-unavailable',
    detail: unauthorized ? 'MCP authentication is required; run /mcp auth for this server, then explicitly retry.'
      : `MCP HTTP request failed${error instanceof StreamableHTTPError && error.code ? ` (HTTP ${error.code})` : ''}; no operation was replayed.` }));
}
