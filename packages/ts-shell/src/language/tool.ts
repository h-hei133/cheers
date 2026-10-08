import type { ToolDefinition } from '../tools/types.js';
import type { ExecutionService } from '../runtime/execution/service.js';
import { LanguageError } from './contract.js';
import { LanguageService } from './service.js';
import { resultText } from './projection.js';
import { createScannerToolDefinition } from './scanner.js';
import { TOOL_OUTPUT_LIMIT } from '../core/agent/tools.js';

/** Thin tool adapter; language protocol, sources, lifecycle and proposals have one owner. */
export function createLspToolDefinition(executionService: ExecutionService): ToolDefinition {
  const service = new LanguageService(executionService);
  const scanner = createScannerToolDefinition(executionService);
  return {
    name: 'lsp',
    description: 'Language server intelligence with explicit executable approval: definition, references, hover, symbols, diagnostics and proposed rename. Choose server.command as an absolute installed executable and server.args explicitly; no auto-install or project configuration discovery. Server code runs with OS process permissions. Positions are zero-based UTF-16. Rename returns apply_patch arguments for a separate complete plan approval; it never writes files. backend: scanner explicitly selects the legacy read-only symbol scanner, queried by symbol name.',
    argsSchema: { type: 'object', properties: {
      backend: { type: 'string', enum: ['server', 'scanner'] },
      operation: { type: 'string', enum: ['definition', 'references', 'hover', 'documentSymbol', 'workspaceSymbol', 'diagnostics', 'rename', 'status', 'restart', 'shutdown'] },
      server: { type: 'object', properties: { command: { type: 'string', maxLength: 4096 }, args: { type: 'array', items: { type: 'string', maxLength: 8192 }, maxItems: 32 } }, required: ['command', 'args'], additionalProperties: false },
      filePath: { type: 'string', maxLength: 4096 }, symbol: { type: 'string', maxLength: 4096 },
      line: { type: 'integer', minimum: 0 }, character: { type: 'integer', minimum: 0 },
      newName: { type: 'string', minLength: 1, maxLength: 256 },
    }, required: ['operation'], additionalProperties: false },
    async execute(args, context) {
      if (args.backend === 'scanner') return scanner.execute(args, context);
      try {
        const result = await service.execute(args, context);
        const output = resultText(result);
        if (args.operation === 'rename' && output.length > TOOL_OUTPUT_LIMIT) throw new LanguageError('unsupported', 'Language rename proposal exceeds the complete tool-message limit. Narrow the rename scope or use a local rename workflow; no partial patch proposal was returned.');
        return { success: true, output, metadata: result as Record<string, unknown> };
      } catch (error) {
        const kind = error instanceof LanguageError ? error.kind : context.abortSignal?.aborted ? 'cancelled' : 'denied';
        return { success: false, error: error instanceof LanguageError ? error.message : 'Language operation failed its source or permission checks.', metadata: { backend: 'server', status: kind } };
      }
    },
  };
}
