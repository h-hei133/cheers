import { McpClassifiedError, classifyMcpFailure } from './errorTaxonomy.js';

export const MCP_CATALOG_TIMEOUT_MS = 30_000;
export const MCP_CATALOG_BYTES = 4 * 1024 * 1024;
export const MCP_CATALOG_TOOLS = 10_000;

export type McpCatalogLimitKind = 'deadline' | 'bytes' | 'tools';

export class McpCatalogLimitError extends McpClassifiedError {
  readonly kind: McpCatalogLimitKind;

  constructor(kind: McpCatalogLimitKind) {
    const message = kind === 'deadline' ? 'MCP tool catalog timed out'
      : kind === 'bytes' ? 'MCP tool catalog exceeds size limit'
        : 'MCP tool catalog exceeds tool limit';
    super(classifyMcpFailure({
      failureClass: kind === 'deadline' ? 'timeout-cancelled' : 'protocol',
      detail: message,
    }));
    this.name = 'McpCatalogLimitError';
    this.kind = kind;
  }
}
