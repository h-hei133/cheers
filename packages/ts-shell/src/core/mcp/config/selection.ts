import { assertAdmission, type Admission } from '../../network/admission.js';
import { isMcpConfigLoadError } from '../config.js';
import { McpGatewayBlockedError } from '../status.js';
import type { ScopedMcpServerConfig } from '../types.js';

/** Keep a selected definition and its original operation owner through reconnect. */
export function mcpSelectionAdmission(load: () => Record<string, ScopedMcpServerConfig>, name: string,
  expected: ScopedMcpServerConfig | undefined, admission: Admission | undefined, signal?: AbortSignal): Admission {
  return () => {
    signal?.throwIfAborted();
    assertAdmission(admission);
    if (expected) {
      let current: ScopedMcpServerConfig | undefined;
      try { current = load()[name]; }
      catch (error) {
        if (!isMcpConfigLoadError(error)) throw error;
        throw new McpGatewayBlockedError({ message: error.message, blockerKind: 'environment-not-ready',
          mcpFailureClass: 'config', doNext: error.doNext });
      }
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) {
        throw new McpGatewayBlockedError({ message: 'MCP server definition changed; reopen the server picker.',
          blockerKind: 'unknown', mcpFailureClass: 'config', doNext: 'Reopen /mcp and select the current server definition.' });
      }
    }
    assertAdmission(admission);
    signal?.throwIfAborted();
    return undefined;
  };
}
