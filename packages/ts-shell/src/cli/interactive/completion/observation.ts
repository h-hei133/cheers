import path from "node:path";
import { observeDirectory } from "./watch.js";

/** Bound subscriptions to paths reported by an owner read, without a second scan. */
export function createCatalogObservation() {
  const watchers = new Map<string, () => void>();
  let changed: (() => void) | undefined;
  let generation = 0;
  const stop = () => {
    generation++;
    changed = undefined;
    for (const close of watchers.values()) close();
    watchers.clear();
  };
  const read = <T>(reader: (track: (target: string) => void) => T): T => {
    const revision = ++generation;
    const visited = new Set<string>();
    const track = (target: string) => {
      const absolute = path.resolve(target);
      if (!changed || revision !== generation || visited.size >= 256) return;
      visited.add(absolute);
      if (!watchers.has(absolute) && watchers.size >= 256) {
        const stale = [...watchers.keys()].find(target => !visited.has(target));
        if (stale) { watchers.get(stale)!(); watchers.delete(stale); }
      }
      if (!watchers.has(absolute)) watchers.set(absolute, observeDirectory(absolute, () => changed?.()));
    };
    const finish = () => {
      if (revision !== generation) return;
      for (const [target, close] of watchers) {
        if (!visited.has(target)) { close(); watchers.delete(target); }
      }
    };
    try {
      const result = reader(track);
      if (typeof result === 'object' && result !== null && 'then' in result && typeof result.then === 'function') {
        return Promise.resolve(result).finally(finish) as T;
      }
      finish();
      return result;
    } catch (error) {
      finish();
      throw error;
    }
  };
  return { read, observe: (notify: () => void) => { stop(); changed = notify; return stop; } };
}
