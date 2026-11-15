import type { CommandContext } from '../../../../core/commands/types.js';
import { observeCatalogContributions } from '../../../../core/catalog/contributions.js';

/** Refresh changed publications and revalidate an open owner after a failed read. */
export function watchModels<T>(context: CommandContext, load: () => Promise<T>, publish: (value: T) => void,
  observedRevision?: number, onFailure?: () => void): () => void {
  let revision = observedRevision ?? context.readConfiguration?.().revision;
  let generation = 0, acceptedGeneration = 0;
  let active = true, pending = false, retry = false;
  const closeContributions = context.cwd ? observeCatalogContributions(context.cwd, () => { generation++; }) : () => {};
  const timer = setInterval(() => {
    if (!active || pending) return;
    let current: number | undefined;
    try { current = context.readConfiguration?.().revision; }
    catch { retry = true; onFailure?.(); return; }
    if (current === revision && generation === acceptedGeneration && !retry) return;
    const capturedGeneration = generation;
    pending = true;
    void load().then(rows => {
      if (!active) return;
      const latest = context.readConfiguration?.().revision;
      if (!active || latest !== current || capturedGeneration !== generation) return;
      revision = current;
      acceptedGeneration = capturedGeneration;
      retry = false;
      publish(rows);
    }).catch(() => { if (active) onFailure?.(); })
      .finally(() => { pending = false; });
  }, 500);
  timer.unref?.();
  return () => { active = false; clearInterval(timer); closeContributions(); };
}
