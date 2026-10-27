import type { CommandContext } from '../../../../core/commands/types.js';

/** Target inputs may expire while their original browser is still safe to reopen. */
export function modelBrowserOwned(context: Pick<CommandContext, 'signal' | 'admission'>): boolean {
  if (context.signal?.aborted) return false;
  try {
    const refusal = context.admission?.();
    return !context.signal?.aborted && !refusal;
  } catch { return false; }
}
