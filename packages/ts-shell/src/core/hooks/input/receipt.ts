import type {HookDispatcher} from '../hookDispatcher.js';
import type {ImageContent} from '../../../model-adapters/multimodal.js';

const receipts = new WeakMap<object, {readonly sessionId: string; readonly workspaceRoot: string; readonly text: string;
  readonly images: readonly ImageContent[] | undefined; readonly signal: AbortSignal; readonly check: () => void; readonly hooks: HookDispatcher;
  readonly hooksCurrent: () => boolean; readonly onConsumed?: () => void}>();
export interface InputAdmissionReceipt {readonly kind: 'input-admission'}

/** Only the owning pre-submit path can issue a receipt; data fields cannot forge admission. */
export function inputAdmissionReceipt(input: {readonly sessionId: string; readonly workspaceRoot: string; readonly text: string;
  readonly images?: readonly ImageContent[]; readonly signal: AbortSignal; readonly check: () => void; readonly hooks: HookDispatcher;
  readonly onConsumed?: () => void}): InputAdmissionReceipt {
  input.check(); input.signal.throwIfAborted();
  const receipt = Object.freeze({kind:'input-admission' as const}); receipts.set(receipt, {...input, images:input.images, hooksCurrent:input.hooks.captureRegistration()});
  return receipt;
}

/** Run-hook skip requires the original effective submission and operation signal. */
export function readInputAdmission(receipt: InputAdmissionReceipt | undefined, input: {readonly sessionId: string;
  readonly workspaceRoot: string; readonly text: string; readonly images?: readonly ImageContent[]; readonly signal: AbortSignal}): HookDispatcher | undefined {
  if (receipt === undefined) return undefined;
  const saved = receipts.get(receipt);
  if (!saved || saved.sessionId !== input.sessionId || saved.workspaceRoot !== input.workspaceRoot || saved.text !== input.text
    || saved.images !== input.images || saved.signal !== input.signal) throw new Error('Prompt input admission does not match this run.');
  if (!saved.hooksCurrent()) throw new Error('Prompt input hook registration changed.');
  saved.check(); input.signal.throwIfAborted();
  return saved.hooks;
}

/** The turn owns the one actual hook skip; callers cannot authorize it with a boolean. */
export function consumeInputAdmission(receipt: InputAdmissionReceipt | undefined, input: {readonly sessionId: string;
  readonly workspaceRoot: string; readonly text: string; readonly images?: readonly ImageContent[]; readonly signal: AbortSignal;
  readonly hooks?: HookDispatcher}): HookDispatcher | undefined {
  const hooks = readInputAdmission(receipt, input);
  if (hooks && input.hooks && hooks !== input.hooks) throw new Error('Prompt input hook owner changed.');
  if (receipt) {
    const saved = receipts.get(receipt); receipts.delete(receipt); saved?.onConsumed?.();
  }
  return hooks;
}
