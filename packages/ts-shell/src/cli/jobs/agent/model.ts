import type { CliProviderRuntimeBridge } from '../../provider/cliProviderRuntimeBridge.js';
import type { CoreMcpGateway } from '../../../core/mcp/gateway.js';

export interface AgentRuntimeInput {
  readonly notice?: (message: string) => void;
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
  readonly mcpGateway?: CoreMcpGateway;
  readonly skillOptions?: { readonly skillPaths?: readonly string[]; readonly noSkills?: boolean };
}
