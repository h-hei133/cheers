import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { prepareReviewRequest } from '../../../core/commands/reviewCommandRuntime.js';
import { assertGitSnapshot } from '../../../workflow/git/read/snapshot.js';
import { gitWorkbenchFor } from '../git.js';

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
  return {
    prompt: result.prompt,
    verifyContent: async (checkingSignal: AbortSignal) => {
      checkingSignal.throwIfAborted();
      if (gitWorkbenchFor(context) !== workbench) throw new Error('Review request owner changed.');
      await assertGitSnapshot(workbench.git(), snapshot, false, undefined, checkingSignal);
      checkingSignal.throwIfAborted();
    },
  };
}
