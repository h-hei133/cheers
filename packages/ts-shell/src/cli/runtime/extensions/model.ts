import { setModel } from '../../../core/commands/model/selection.js';
import { modelRequest } from '../../../core/commands/model/target.js';
import { currentSessionProviderScope, extensionModelReference } from '../../../core/catalog/providers.js';
import { isThinkingPreference } from '../../../core/models/effort.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { configurationAdmission, publishReloadModel } from '../../../core/shell/configuration.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { readLogicalModel } from '../../../session/model/logical.js';
import { readSessionModelEdit, readSessionModelStrict, type SessionModelReceipt } from '../../../session/model/state.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { ExtensionThinkingError, isExtensionModel, type ExtensionThinkingUpdate } from '../../../extensions/runtime/model.js';
import type { ExtensionHostBridge } from '../../../extensions/runtime/inProcessLoader.js';
import type { ThinkingPreference } from '../../../core/models/effort.js';
import { currentExtensionInvocation } from '../../../extensions/runtime/context.js';
import { sameValue } from '../../../config/values.js';
import { loadCatalog } from '../../../core/models/catalogStore.js';
import { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { prepareSessionHooks } from '../../../core/hooks/prepare.js';
import type { ToolGateOptions } from '../../../turn/tools.js';
import { reloadPreferences } from './preference.js';

type Preference = { readonly level: ThinkingPreference } | { readonly model: string };

/** Publish through the normal session preference writer and local operation owner. */
export function sessionModelSetters(context: ShellRuntimeContext, runtime: ShellSessionRuntime, check: () => void,
  host: () => ExtensionHostBridge, hookApproval?: () => ToolGateOptions['escalationPromptHandler']):
  Required<Pick<ExtensionHostBridge, 'setModel' | 'setThinkingLevel'>> {
  const update = async (preference: Preference, requestSignal: AbortSignal) => {
    requestSignal.throwIfAborted();
    check();
    const candidate = reloadPreferences.get(context);
    const reload = candidate && candidate.host === host() && candidate.signal === currentExtensionInvocation()?.reloadStartup
      && runtime.commands.current?.kind === 'extension-reload' ? candidate : undefined;
    if (reload?.running || (!reload && runtime.isRunning())) throw new ExtensionThinkingError('Finish the current session operation before changing the model preference.');
    reload?.verify();
    const { cwd, projectRoot, session: { id: sessionId } } = context;
    const publication = context.configuration.current;
    const configured = configurationAdmission(context);
    const logicalConfigured = configurationAdmission(context, { deferredModel: true });
    const operation = async (signal: AbortSignal) => {
      signal.throwIfAborted();
      let receipt: SessionModelReceipt | undefined;
      let applied: typeof publication | undefined;
      const verifyPreference = () => {
        if (!receipt || !sameValue(readSessionModelEdit(sessionId), receipt.after)
          || !sameValue(loadCatalog(), publication.catalog)) throw new ExtensionThinkingError('The saved model publication changed.');
      };
      const checkReload = () => {
        requestSignal.throwIfAborted();
        reload?.check();
        if (!sameValue(loadCatalog(), publication.catalog)) throw new ExtensionThinkingError('The model catalog changed during extension reload.');
      };
      const admission = (checkConfig: () => string | undefined, expected = () => publication) => () => {
        if (signal.aborted || requestSignal.aborted || context.configuration.current !== expected()
          || runtime.commands.current?.controller.signal !== signal) return 'Extension model operation expired.';
        try { check(); if (reload) checkReload(); return checkConfig(); }
        catch { return 'Extension model operation expired.'; }
      };
      const checkPhysical = admission(configured);
      const checkLogical = admission(logicalConfigured);
      const hooks = reload && prepareSessionHooks({ workspaceRoot: cwd, allowUntrustedHooks: publication.config.allowUntrustedHooks,
        escalationPromptHandler: hookApproval?.(),
        admission: admission(() => (readLogicalModel(sessionId) ? logicalConfigured : configured)(), () => applied ?? publication),
      }, new HookDispatcher());
      const callbackSignal = hooks && AbortSignal.any([signal, requestSignal]);
      let status: ExtensionThinkingUpdate['status'] | undefined;
      const command: CommandContext = { cwd, projectRoot, sessionId, signal,
        runtimeConfig: publication.config,
        resolveConfigTarget: context.resolveConfigTarget,
        readConfiguration: () => context.configuration.current,
        admission: checkPhysical, logicalModelAdmission: checkLogical,
        ...(hooks && callbackSignal ? { modelHooks: { dispatch: payload => hooks.dispatch({ ...payload, workspaceRoot: cwd }, { signal: callbackSignal }) } } : {}),
        ...(reload ? { modelPublication: { publishState: reload.publishState, committed: (value: SessionModelReceipt) => {
          receipt = value;
          reload.committed(verifyPreference);
        } } } : {}),
        refreshRuntimeConfig: () => {
          status = 'saved';
          const refusal = (readLogicalModel(sessionId) ? checkLogical : checkPhysical)();
          if (refusal) throw new ExtensionThinkingError(refusal);
          const verify = () => {
            checkReload();
            reload?.verify();
            check();
            verifyPreference();
          };
          if (reload && !receipt) throw new ExtensionThinkingError('The saved model publication could not be verified.');
          const result = reload && receipt ? publishReloadModel(context, publication, receipt, verify) : refreshShellRuntimeConfig(context);
          if (result.status === 'applied') {
            if (reload) {
              const accepted = context.configuration.current;
              if (accepted.requested !== result.after || accepted.revision !== result.revision) throw new ExtensionThinkingError('The accepted model publication changed.');
              reload.accept(publication, accepted);
              applied = accepted;
              context.promptIdentity = undefined;
            }
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
      if (reload && applied) {
        requestSignal.throwIfAborted();
        reload.verify();
        verifyPreference();
        if (context.configuration.current !== applied) {
          throw new ExtensionThinkingError('The model preference changed during extension reload.');
        }
      }
      return status;
    };
    if (!reload) return runtime.commands.run(operation, 'command', requestSignal);
    reload.running = true;
    try { return await operation(reload.signal); }
    finally { reload.running = false; }
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
