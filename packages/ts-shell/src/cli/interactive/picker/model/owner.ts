import type { CommandContext } from '../../../../core/commands/types.js';

/** Action lifetime is independent of catalogue reads used by an open inspector. */
export class ModelActionOwner {
  private generation = 0;
  private retired = false;
  private pending?: () => boolean;

  open(): void { this.generation++; this.retired = false; this.pending = undefined; }
  close(): void { this.generation++; this.retired = true; this.pending = undefined; }

  begin(signal?: AbortSignal, stillOwned?: () => boolean): (() => boolean) | undefined {
    if (this.retired || this.pending || signal?.aborted) return undefined;
    const generation = this.generation;
    const owned = () => {
      if (this.generation !== generation || this.retired) return false;
      if (signal?.aborted || (stillOwned && !stillOwned())) this.retired = true;
      return !this.retired;
    };
    if (!owned()) return undefined;
    this.pending = owned;
    return owned;
  }

  finish(owned: () => boolean): void {
    if (this.pending !== owned) return;
    this.pending = undefined; this.retired = true;
  }
}

/** Target inputs may expire while their original browser is still safe to reopen. */
export function modelBrowserOwned(context: Pick<CommandContext, 'signal' | 'admission'>): boolean {
  if (context.signal?.aborted) return false;
  try {
    const refusal = context.admission?.();
    return !context.signal?.aborted && !refusal;
  } catch { return false; }
}

/** Recheck the accepted host after choice validation, including inside its original writer. */
export function modelActionAdmission(admission: () => string | undefined, stillOwned: () => boolean): string | undefined {
  const refusal = admission();
  return stillOwned() ? refusal : 'Model selection cancelled. Reopen the model picker.';
}
