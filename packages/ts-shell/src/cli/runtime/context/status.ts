import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { CliMcpGateway } from '../../../entrypoints/cliMcpModule.js';
import type { PermissionScope } from '../../approval/permissionScope.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { previewContext } from './preview.js';

/** Validate a restored anchor against the current native request shape without sending a request. */
export function contextEstimateFor(context: ShellRuntimeContext, manager: SessionManager, gateway: CliMcpGateway,
  runtime: { getAgentMode(): 'plan' | 'build'; getPermissionScope(): PermissionScope }): NonNullable<CommandContext['contextEstimate']> {
  return async signal => {
    const preview = await previewContext(context, manager, gateway, '', undefined, runtime.getAgentMode(),
      runtime.getPermissionScope(), signal, true);
    try { await preview.verifyContent(signal); return preview.estimate; }
    finally { preview.dispose(); }
  };
}
