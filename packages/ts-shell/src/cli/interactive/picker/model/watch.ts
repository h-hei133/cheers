import type { CommandContext } from '../../../../core/commands/types.js';

/** Refresh an open owner only after its accepted configuration publication changes. */
export function watchModels<T>(context: CommandContext, load: () => Promise<T>, publish: (value: T) => void,
  observedRevision?: number, onFailure?: () => void): () => void {
  if (!context.readConfiguration) return () => {};
  let revision = observedRevision ?? context.readConfiguration().revision;
  let active = true, pending = false;
  const timer = setInterval(() => {
    if (!active || pending) return;
    let current: number | undefined;
    try { current = context.readConfiguration!().revision; }
    catch { onFailure?.(); return; }
    if (current === revision) return;
    pending = true;
    void load().then(rows => {
      if (!active) return;
      const latest = context.readConfiguration!().revision;
      if (!active || latest !== current) return;
      revision = current;
      publish(rows);
    }).catch(() => { if (active) onFailure?.(); })
      .finally(() => { pending = false; });
  }, 500);
  timer.unref?.();
  return () => { active = false; clearInterval(timer); };
}
