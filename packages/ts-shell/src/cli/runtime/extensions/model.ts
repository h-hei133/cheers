import { setModel } from '../../../core/commands/model/selection.js';
import { modelRequest } from '../../../core/commands/model/target.js';
import { isThinkingPreference } from '../../../core/models/effort.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { readLogicalModel } from '../../../session/model/logical.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { ExtensionThinkingError, type ExtensionThinkingUpdate } from '../../../extensions/runtime/model.js';
import type { ExtensionHostBridge } from '../../../extensions/runtime/inProcessLoader.js';

/** Publish through the normal session preference writer and local operation owner. */
export function sessionThinkingSetter(context: ShellRuntimeContext, runtime: ShellSessionRuntime, check: () => void): NonNullable<ExtensionHostBridge['setThinkingLevel']> {
  return async (level, requestSignal) => {
    if (!isThinkingPreference(level)) throw new ExtensionThinkingError('Invalid extension thinking level.');
    requestSignal.throwIfAborted();
    check();
    if (runtime.isRunning()) throw new ExtensionThinkingError('Finish the current session operation before changing thinking level.');
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
            const effective = logical ? logical.thinkingEffort : modelRequest(command, result.after).thinkingEffort;
            if (effective === level) status = 'applied';
          }
          return result;
        },
      };
      const outcome = await setModel([], command, false, level);
      if (!status) throw new ExtensionThinkingError(redactReportText(outcome, 1024));
      return Object.freeze({ status, level });
    }, 'command', requestSignal);
  };
}
