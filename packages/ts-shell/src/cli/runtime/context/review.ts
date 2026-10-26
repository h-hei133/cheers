import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { PromptAttachments } from '../../../core/shell/sessionRuntime.js';
import { prepareReviewRequest } from '../../../core/commands/reviewCommandRuntime.js';
import { assertGitSnapshot } from '../../../workflow/git/read/snapshot.js';
import { gitWorkbenchFor } from '../git.js';

/** A new preview invalidates any snapshot reservation from an older draft. */
export function clearReviewPreview(context: ShellRuntimeContext): void {
  gitWorkbenchFor(context)?.clearReviewReservation();
}

/** A verified non-review preview owns the current draft and retires an older stale marker. */
export function clearStaleReviewPreview(context: ShellRuntimeContext): void {
  gitWorkbenchFor(context)?.clearStaleReviewReservation();
}

/** Prepare the same native review prompt without invoking its command handler. */
export async function prepareReviewPreview(
  context: ShellRuntimeContext,
  args: readonly string[],
  composedPrompt: CommandContext['composedPrompt'],
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const request = prepareReviewRequest(args, { composedPrompt });
  if (!request.ok) throw new Error(`Review command request preparation is pending: ${request.reason}`);
  const workbench = gitWorkbenchFor(context);
  if (!workbench) throw new Error('Review request preparation is unavailable.');
  const snapshot = await workbench.snapshot(signal);
  const result = await workbench.review(snapshot, request.focus, signal);
  if (result.kind !== 'prompt') throw new Error(result.output);
  signal.throwIfAborted();
  let reservation: object | undefined;
  return {
    prompt: result.prompt,
    verifyContent: async (checkingSignal: AbortSignal) => {
      checkingSignal.throwIfAborted();
      if (gitWorkbenchFor(context) !== workbench) throw new Error('Review request owner changed.');
      try { await assertGitSnapshot(workbench.git(), snapshot, false, undefined, checkingSignal); }
      catch (error) { if (reservation) workbench.invalidateReviewReservation(reservation); throw error; }
      checkingSignal.throwIfAborted();
    },
    publish: (verifyContent: (checkingSignal: AbortSignal) => Promise<void>, attachments?: PromptAttachments) => {
      signal.throwIfAborted();
      if (gitWorkbenchFor(context) !== workbench) throw new Error('Review request owner changed.');
      const published = workbench.reserveReview(snapshot, request.focus, verifyContent, attachments);
      reservation = published.token;
      return published.expiresAt;
    },
    invalidate: () => { if (reservation) workbench.invalidateReviewReservation(reservation); },
    discard: () => { if (reservation) workbench.clearReviewReservation(reservation); },
  };
}
