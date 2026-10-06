import path from "node:path";
import { observeDirectory } from "./watch.js";

/** Bound subscriptions to paths reported by an owner read, without a second scan. */
export function createCatalogObservation() {
  const watchers = new Map<string, () => void>();
  let changed: (() => void) | undefined;
  const stop = () => {
    changed = undefined;
    for (const close of watchers.values()) close();
    watchers.clear();
  };
  const read = <T>(reader: (track: (target: string) => void) => T): T => {
    const visited = new Set<string>();
    const track = (target: string) => {
      const absolute = path.resolve(target);
      if (!changed || visited.size >= 256) return;
      visited.add(absolute);
      if (!watchers.has(absolute) && watchers.size >= 256) {
        const stale = [...watchers.keys()].find(target => !visited.has(target));
        if (stale) { watchers.get(stale)!(); watchers.delete(stale); }
      }
      if (!watchers.has(absolute)) watchers.set(absolute, observeDirectory(absolute, () => changed?.()));
    };
    try {
      return reader(track);
    } finally {
      for (const [target, close] of watchers) {
        if (!visited.has(target)) { close(); watchers.delete(target); }
      }
    }
  };
  return { read, observe: (notify: () => void) => { stop(); changed = notify; return stop; } };
}
