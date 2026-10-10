import type { CliProviderRuntimeBridge } from '../../provider/cliProviderRuntimeBridge.js';
import type { CoreMcpGateway } from '../../../core/mcp/gateway.js';
import type { ModelChoice } from '../../../core/models/selection.js';
import type { AgentJob } from '../../../workflow/jobs/agent/model.js';

export interface AgentRuntimeInput {
  readonly notice?: (message: string) => void;
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
  readonly mcpGateway?: CoreMcpGateway;
  readonly skillOptions?: { readonly skillPaths?: readonly string[]; readonly noSkills?: boolean };
}

export interface AgentRuntimeOptions {
  readonly worker?: ModelChoice;
  readonly admission?: () => string | undefined;
  readonly reserved?: (job: AgentJob) => void;
  readonly directorId?: string;
}
