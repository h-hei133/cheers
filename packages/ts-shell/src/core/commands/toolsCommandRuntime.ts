import { entitySyntax } from "./syntax/entity.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { createCoreToolRegistry } from "../tools/registry.js";
import { toolReport, toolsReport } from "./tools/report.js";
import { reportText } from "./report/projection.js";
import { assertAdmission } from '../network/admission.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { loadCatalog } from '../models/catalogStore.js';
import { resolveProviderCredential } from '../shell/providerCredentials.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../auth/account/target.js';
import { DEFAULT_ENDPOINT_KIND } from '../../provider/endpoints/index.js';

export const toolsSyntax = entitySyntax("tools");

/**
 * /tools — what the model can actually do this turn.
 *
 * Read straight from the registry that builds the request, so the list cannot
 * drift from what is offered: a hand-maintained list of tool names is wrong the
 * first time a tool is added and nobody notices until the model calls something
 * the list denies exists.
 *
 * Plan mode is shown per tool rather than described in prose, because "read-only
 * tools are allowed" is not checkable and this is.
 */

export async function runToolsCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseSyntax(toolsSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /tools arguments: ${parsed.reason}\n${syntaxHelp(toolsSyntax)}` };
  const registry = await readToolPool(context, context.signal);
  const wanted = parsed.args[0];

  if (wanted) {
    const tool = registry.get(wanted);
    if (!tool) {
      return {
        kind: "local",
        output: `No tool named \`${wanted}\`. \`/tools\` lists the ${registry.size} there are.`,
      };
    }
    const report = toolReport(tool, context.cwd);
    return { kind: "local", output: reportText(report), report };
  }

  const report = toolsReport(registry, context.cwd, resolveEndpoint(context));
  return { kind: "local", output: reportText(report), report };
}

function resolveEndpoint(context: CommandContext): string {
  try {
    const publication = context.readConfiguration?.();
    const config = publication?.config ?? context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd);
    const catalog = publication?.catalog ?? loadCatalog();
    const active = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
    const baseUrl = providerCredentialBaseUrl(catalog, active);
    return providerCredentialEndpoint(catalog, active, baseUrl) ?? DEFAULT_ENDPOINT_KIND;
  } catch {
    return DEFAULT_ENDPOINT_KIND;
  }
}

/** Commands and choosers inspect the same current pool; neither executes it. */
export async function readToolPool(context: CommandContext, signal?: AbortSignal) {
  assertAdmission(context.admission);
  signal?.throwIfAborted();
  const pool = await (context.getToolPool ? context.getToolPool(signal) : createCoreToolRegistry());
  signal?.throwIfAborted();
  assertAdmission(context.admission);
  return pool;
}
