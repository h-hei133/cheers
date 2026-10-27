import type { CommandContext } from '../../../../core/commands/types.js';
import type { Option } from '../../../../presentation/tui/chrome/options.js';

/** Refresh an open catalogue only after its accepted configuration publication changes. */
export function watchModels(context: CommandContext, load: () => Promise<readonly Option[]>, publish: (rows: readonly Option[]) => void,
  observedRevision?: number): () => void {
  if (!context.readConfiguration) return () => {};
  let revision = observedRevision ?? context.readConfiguration().revision;
  let active = true, pending = false;
  const timer = setInterval(() => {
    if (!active || pending) return;
    let current: number | undefined;
    try { current = context.readConfiguration!().revision; } catch { return; }
    if (current === revision) return;
    pending = true;
    void load().then(rows => {
      if (!active) return;
      revision = current;
      publish(rows);
    }).catch(() => { /* Existing rows keep their captured admission; reopen can retry. */ })
      .finally(() => { pending = false; });
  }, 500);
  timer.unref?.();
  return () => { active = false; clearInterval(timer); };
}
