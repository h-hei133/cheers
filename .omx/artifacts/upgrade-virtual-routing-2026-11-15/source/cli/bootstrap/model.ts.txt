import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { refreshShellRuntimeConfig } from '../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { sessionVirtualModels } from '../../core/catalog/models.js';
import { parseModelSelection } from '../../core/models/virtual/selection.js';
import { setVirtualModel } from '../../core/commands/model/virtual.js';
import { setModel } from '../../core/commands/model/selection.js';
import { readLogicalModel } from '../../session/model/logical.js';
import { readSessionModelEdit } from '../../session/model/state.js';
import type { CliOptions } from '../options/cliOptions.js';

/** Only the bootstrap owner consumes these launch preferences after persisting them. */
export type StartupModelOptions = Omit<CliOptions, 'model' | 'thinking'> & {
  model?: CliOptions['model'];
  thinking?: CliOptions['thinking'];
};

/** Startup selection is classified only after the current extension generation has published. */
export async function applyStartupModel(context: ShellRuntimeContext, options: StartupModelOptions): Promise<void> {
  const definitions = sessionVirtualModels(context.cwd, context.session.id);
  const parsed = parseModelSelection(options.model, definitions, options.provider);
  const logical = readLogicalModel(context.session.id);
  const command = { cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id,
    runtimeConfig: context.runtimeConfig, readConfiguration: () => context.configuration.current, resolveConfigTarget: context.resolveConfigTarget,
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(context), admission: configurationAdmission(context),
    logicalModelAdmission: configurationAdmission(context, { deferredModel: true }) };
  const effort = options.thinking ? parseModelSelection(`_:${options.thinking}`, []) : undefined;
  const thinkingEffort = effort?.kind === 'physical' ? effort.thinkingEffort : undefined;
  if (parsed.kind === 'virtual') {
    const target = { ...parsed.virtualModel, ...(thinkingEffort !== undefined ? { thinkingEffort } : {}) };
    const baseline = readSessionModelEdit(context.session.id);
    const outcome = await setVirtualModel(target, command, { baseline, definition: parsed.definition });
    if (!outcome.startsWith('Model switched to ') && !outcome.startsWith('Model preference saved for ')) throw new Error(outcome);
    // Once accepted, future selections must not reapply the launch model to credentials.
    options.model = undefined; options.thinking = undefined;
  } else if (logical && options.model) {
    const outcome = await setModel([parsed.model!], command, false, thinkingEffort ?? parsed.thinkingEffort);
    if (!outcome.startsWith('Model switched to ')) throw new Error(outcome);
  } else if (logical && thinkingEffort !== undefined) {
    const outcome = await setVirtualModel({ ...logical, thinkingEffort }, command);
    if (!outcome.startsWith('Model switched to ') && !outcome.startsWith('Model preference saved for ')) throw new Error(outcome);
    options.thinking = undefined;
  }
}
