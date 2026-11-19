import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { dispatchExtensionEvent, getExtensionEventRunners } from '../../../core/hooks/extensionBridge.js';
import type { ExtensionSessionBeforeEvent, ExtensionSessionEvent } from '../../../extensions/events/model.js';
import { sessionCancellation } from '../../../extensions/events/decision.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import { captureTreeResult, mergeTreeResult, validateTreeResult } from '../../../extensions/events/tree.js';
import type { ExtensionBeforeTreeResult } from '../../../extensions/events/model.js';

/** Keep one navigation's decisions and notifications on its original extension audience. */
export function extensionNavigation(context: ShellRuntimeContext, admitted: () => void, signal?: AbortSignal) {
  const root = context.cwd, sessionId = context.session.id;
  const runners = [...getExtensionEventRunners(root, sessionId)];
  const configured = configurationAdmission(context);
  const check = () => {
    admitted();
    for (const runner of runners) runner.admission?.();
    const refused = configured();
    if (refused) throw new Error(refused);
  };
  const admission = () => { check(); return undefined; };
  return {
    check,
    before: async (event: ExtensionSessionBeforeEvent): Promise<boolean> => {
      let cancelled = false;
      const result = await dispatchExtensionEvent(root, sessionId, event.type, Object.freeze(event), {
        runners, admission, ...(signal ? { signal } : {}),
        consume: returned => { cancelled = sessionCancellation(returned); return !cancelled; },
      });
      admitted();
      return !cancelled && !result.cancelled && result.failed === 0;
    },
    beforeTree: async (event: Extract<ExtensionSessionBeforeEvent, { type: 'session_before_tree' }>): Promise<ExtensionBeforeTreeResult> => {
      let decision: ExtensionBeforeTreeResult = { cancel: false };
      const result = await dispatchExtensionEvent(root, sessionId, event.type, Object.freeze(event), {
        runners, admission, ...(signal ? { signal } : {}),
        consume: returned => { decision = mergeTreeResult(decision, captureTreeResult(returned)); return !decision.cancel; },
      });
      admitted();
      if (result.cancelled || result.failed) return Object.freeze({ cancel: true });
      try { return validateTreeResult(decision); }
      catch { return Object.freeze({ cancel: true }); }
    },
    after: async (event: ExtensionSessionEvent): Promise<void> => {
      await dispatchExtensionEvent(root, sessionId, event.type, Object.freeze(event), { runners, admission, ...(signal ? { signal } : {}) });
    },
  };
}
