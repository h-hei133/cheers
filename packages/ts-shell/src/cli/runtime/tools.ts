import { CoreMcpGateway } from "../../core/mcp/gateway.js";
import { loadToolCatalog, type ToolCatalogInput } from "../../core/tools/catalog.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { CommandContext } from "../../core/commands/types.js";
import { configurationAdmission } from '../../core/shell/configuration.js';
import { assertAdmission } from '../../core/network/admission.js';
import { researchInspectionTools } from './research.js';
import { securityFeatureTools } from './security.js';

/** Resolve on each inspection, including after reload or project navigation. */
export function toolPoolFor(
  context: ShellRuntimeContext,
  supplied?: ToolCatalogInput["mcpGateway"],
): NonNullable<CommandContext["getToolPool"]> {
  return async () => {
    const admission = configurationAdmission(context);
    assertAdmission(admission);
    const workspaceRoot = context.projectRoot ?? context.cwd;
    const owned = !supplied && context.runtimeConfig.enableMcpTools ? new CoreMcpGateway(workspaceRoot) : undefined;
    try {
      return (await loadToolCatalog({ workspaceRoot, runtimeConfig: context.runtimeConfig, admission, featureTools: [...researchInspectionTools(context), ...securityFeatureTools(context)],
        skillOptions: context.skillOptions, mcpGateway: supplied ?? owned })).tools;
    } finally {
      await owned?.close();
    }
  };
}
