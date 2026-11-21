import { setModel } from '../../../core/commands/model/selection.js';
import { modelRequest } from '../../../core/commands/model/target.js';
import { currentSessionProviderScope, extensionModelReference } from '../../../core/catalog/providers.js';
import { isThinkingPreference } from '../../../core/models/effort.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { readLogicalModel } from '../../../session/model/logical.js';
import { readSessionModelStrict } from '../../../session/model/state.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { ExtensionThinkingError, isExtensionModel, type ExtensionThinkingUpdate } from '../../../extensions/runtime/model.js';
import type { ExtensionHostBridge } from '../../../extensions/runtime/inProcessLoader.js';
import type { ThinkingPreference } from '../../../core/models/effort.js';

type Preference = { readonly level: ThinkingPreference } | { readonly model: string };

/** Publish through the normal session preference writer and local operation owner. */
export function sessionModelSetters(context: ShellRuntimeContext, runtime: ShellSessionRuntime, check: () => void):
  Required<Pick<ExtensionHostBridge, 'setModel' | 'setThinkingLevel'>> {
  const update = async (preference: Preference, requestSignal: AbortSignal) => {
    requestSignal.throwIfAborted();
    check();
    if (runtime.isRunning()) throw new ExtensionThinkingError('Finish the current session operation before changing the model preference.');
    const { cwd, projectRoot, session: { id: sessionId } } = context;
    const publication = context.configuration.current;
    const configured = configurationAdmission(context);
    const logicalConfigured = configurationAdmission(context, { deferredModel: true });
    return runtime.commands.run(async signal => {
      signal.throwIfAborted();
      const admission = (checkConfig: () => string | undefined) => () => {
        if (signal.aborted || context.configuration.current !== publication
          || runtime.commands.current?.controller.signal !== signal) return 'Extension model operation expired.';
        try { check(); return checkConfig(); }
        catch { return 'Extension model operation expired.'; }
      };
      const checkPhysical = admission(configured);
      const checkLogical = admission(logicalConfigured);
      let status: ExtensionThinkingUpdate['status'] | undefined;
      const command: CommandContext = { cwd, projectRoot, sessionId, signal,
        runtimeConfig: publication.config,
        resolveConfigTarget: context.resolveConfigTarget,
        readConfiguration: () => context.configuration.current,
        admission: checkPhysical, logicalModelAdmission: checkLogical,
        refreshRuntimeConfig: () => {
          status = 'saved';
          const refusal = (readLogicalModel(sessionId) ? checkLogical : checkPhysical)();
          if (refusal) throw new ExtensionThinkingError(refusal);
          const result = refreshShellRuntimeConfig(context);
          if (result.status === 'applied') {
            const logical = readLogicalModel(sessionId);
            const effective = logical ?? modelRequest(command, result.after);
            if ('level' in preference) {
              if (effective.thinkingEffort === preference.level) status = 'applied';
            } else {
              const reference = extensionModelReference(preference.model);
              if (reference) {
                const saved = readSessionModelStrict(sessionId);
                const request = modelRequest(command, result.after);
                const scope = currentSessionProviderScope(cwd, sessionId, context.configuration.current.catalog, request);
                if (saved?.extensionProvider?.id === reference.id && request.model === reference.model && !scope.admission?.()) status = 'applied';
              } else if (effective.model === preference.model || `${effective.provider}/${effective.model}` === preference.model) {
                status = 'applied';
              }
            }
          }
          return result;
        },
      };
      const outcome = 'level' in preference ? await setModel([], command, false, preference.level)
        : await setModel([preference.model], command, false);
      if (!status) throw new ExtensionThinkingError(redactReportText(outcome, 1024));
      return status;
    }, 'command', requestSignal);
  };
  return {
    setModel: async (model, signal) => {
      if (!isExtensionModel(model)) throw new ExtensionThinkingError('Invalid extension model.');
      return Object.freeze({ status: await update({ model }, signal), model });
    },
    setThinkingLevel: async (level, signal) => {
      if (!isThinkingPreference(level)) throw new ExtensionThinkingError('Invalid extension thinking level.');
      return Object.freeze({ status: await update({ level }, signal), level });
    },
  };
}
