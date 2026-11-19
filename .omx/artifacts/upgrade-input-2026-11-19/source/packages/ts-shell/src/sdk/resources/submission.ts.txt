import {SubmissionQueue} from '../../cli/interactive/inputQueue.js';
import {attachInputQueue} from '../../cli/runtime/inputQueue.js';
import type {ShellRuntimeContext} from '../../core/shell/runtimeContext.js';
import type {ShellSessionRuntime} from '../../core/shell/sessionRuntime.js';
import {configurationAdmission} from '../../core/shell/configuration.js';

/** Reload startup uses the same pending submission owner as other session hosts. */
export function attachSdkSubmissionQueue(context: ShellRuntimeContext, runtime: ShellSessionRuntime): {close(): void; wait(): Promise<void>} {
  const queue = new SubmissionQueue(() => context.session, () => {});
  let closed = false, pending: Promise<void> | undefined;
  let failure: {readonly error: unknown} | undefined;
  const drain = (): void => {
    if (closed || pending || runtime.isRunning() || configurationAdmission(context)()) return;
    const prompt = queue.shift();
    if (prompt === undefined) return;
    const attachments = queue.takeAttachments();
    pending = runtime.executePrompt(context.session.id, prompt, {outputMode:'print', inputSource:queue.takeSource() ?? 'sdk', ...(attachments ? {attachments} : {})})
      .then(() => undefined, error => {failure ??= {error}; throw error;}).finally(() => {pending = undefined; drain();});
    void pending.catch(() => {});
  };
  const detach = attachInputQueue(runtime, {control:queue.control, enqueue:(text, attachments, source) => queue.push(text, attachments, source), drain});
  return {
    close:() => {closed = true; queue.release(); detach();},
    wait:async () => {
      do {
        const current = pending;
        try {await current;} catch { /* The original failure receipt remains on this queue owner. */ }
        if (pending === undefined) break;
      } while (pending);
      if (failure) throw failure.error;
    },
  };
}
