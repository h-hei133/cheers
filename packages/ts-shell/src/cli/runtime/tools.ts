import { CoreMcpGateway } from "../../core/mcp/gateway.js";
import { loadToolCatalog, type ToolCatalogInput } from "../../core/tools/catalog.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { CommandContext } from "../../core/commands/types.js";
import { configurationAdmission } from '../../core/shell/configuration.js';
import { assertAdmission } from '../../core/network/admission.js';
import { researchInspectionTools } from './research.js';
import { securityFeatureTools } from './security.js';
import { refreshExtensionsFor } from './extensions.js';
import { sshFeatureTools } from './ssh.js';
import { directorInspectionFor } from './director.js';
import { evaluationFeatureTools } from './evaluation.js';
import { authorizationForMcp } from '../mcp/auth/service.js';

/** Resolve on each inspection, including after reload or project navigation. */
export function toolPoolFor(
  context: ShellRuntimeContext,
  supplied?: ToolCatalogInput["mcpGateway"],
): NonNullable<CommandContext["getToolPool"]> {
  return async signal => {
    signal?.throwIfAborted();
    const admission = configurationAdmission(context);
    assertAdmission(admission);
    refreshExtensionsFor(context);
    const workspaceRoot = context.projectRoot ?? context.cwd;
    const director = directorInspectionFor(context);
    const owned = !supplied && context.runtimeConfig.enableMcpTools ? new CoreMcpGateway(workspaceRoot, undefined, authorizationForMcp) : undefined;
    try {
      return (await loadToolCatalog({ workspaceRoot, sessionId: context.session.id, runtimeConfig: director?.config ?? context.runtimeConfig, admission, signal,
        featureTools: [...researchInspectionTools(context), ...securityFeatureTools(context), ...sshFeatureTools(context), ...evaluationFeatureTools(context), ...director?.tools ?? []],
        skillOptions: context.skillOptions, mcpGateway: supplied ?? owned })).tools;
    } finally {
      await owned?.close();
    }
  };
}
