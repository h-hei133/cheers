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
  return context.runCancellable
    ? context.runCancellable(signal => inspectTools(parsed.args[0], { ...context,
      signal: context.signal ? AbortSignal.any([context.signal, signal]) : signal }))
    : inspectTools(parsed.args[0], context);
}

async function inspectTools(wanted: string | undefined, context: CommandContext): Promise<LocalCommandResult> {
  const registry = await readToolPool(context, context.signal);
  context.signal?.throwIfAborted();

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

  const endpoint = resolveEndpoint(context);
  context.signal?.throwIfAborted();
  const report = toolsReport(registry, context.cwd, endpoint);
  return { kind: "local", output: reportText(report), report };
}

function resolveEndpoint(context: CommandContext): string {
  try {
    const publication = context.readConfiguration?.();
    const config = publication?.config ?? context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd);
    const catalog = publication?.catalog ?? loadCatalog();
    const active = context.resolveConfigTarget?.(config, context.sessionId)
      ?? resolveProviderCredential({ runtimeConfig: config, ...(context.sessionId ? { pool: { sessionId: context.sessionId } } : {}) });
    const baseUrl = providerCredentialBaseUrl(catalog, active);
    return providerCredentialEndpoint(catalog, active, baseUrl) ?? DEFAULT_ENDPOINT_KIND;
  } catch {
    return DEFAULT_ENDPOINT_KIND;
  }
}

/** Commands and choosers inspect the same current pool; neither executes it. */
export async function readToolPool(context: CommandContext, loadSignal?: AbortSignal) {
  const signal = context.signal && loadSignal && context.signal !== loadSignal
    ? AbortSignal.any([context.signal, loadSignal]) : context.signal ?? loadSignal;
  signal?.throwIfAborted();
  assertAdmission(context.admission);
  signal?.throwIfAborted();
  const pool = await (context.getToolPool ? context.getToolPool(signal) : createCoreToolRegistry());
  signal?.throwIfAborted();
  assertAdmission(context.admission);
  signal?.throwIfAborted();
  return pool;
}
