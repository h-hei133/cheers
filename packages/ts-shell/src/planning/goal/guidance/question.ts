import type { Interface as ReadlineInterface } from 'node:readline';
import type { GuidanceQuestionField } from './model.js';

const questions: Record<GuidanceQuestionField, string> = {
  objective: 'What should this goal accomplish?', outcome: 'What observable outcome will you review?',
  constraints: 'What limits must be respected? State none explicitly if there are none.',
};
const pending = new WeakMap<ReadlineInterface, () => void>();
export function cancelGuidanceQuestion(readline: ReadlineInterface): void { pending.get(readline)?.(); }
/** Abort-aware Q&A uses the existing host bridge. Closing/canceling never supplies an answer. */
export function askGuidance(readline: ReadlineInterface, field: GuidanceQuestionField): Promise<string | undefined> {
  return new Promise(resolve => {
    const controller = new AbortController(); let finished = false;
    const settle = (answer?: string): void => {
      if (finished) return; finished = true;
      pending.delete(readline);
      readline.off('SIGINT', cancel); readline.off('close', cancel); controller.abort(); resolve(answer);
    };
    const cancel = (): void => settle();
    pending.set(readline, cancel);
    readline.once('SIGINT', cancel); readline.once('close', cancel);
    try { readline.question(`${questions[field]}\n`, { signal: controller.signal }, answer => settle(answer)); }
    catch { settle(); }
  });
}
