/** Coalesced invalidation after a mutation finishes; observers cannot veto owner writes. */
export function createStateChanges() {
  const listeners = new Map<string, Set<() => void>>();
  const pending = new Set<string>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const scopes = [...pending]; pending.clear();
    for (const scope of scopes) {
      const current = listeners.get(scope);
      for (const listener of [...current ?? []]) {
        if (!current?.has(listener)) continue;
        try { listener(); } catch { /* Read-side invalidation must not fail a committed mutation. */ }
      }
    }
  };
  return {
    subscribe: (scope: string, listener: () => void) => {
      const current = listeners.get(scope) ?? new Set<() => void>();
      const callback = () => listener();
      current.add(callback); listeners.set(scope, current);
      return () => {
        current.delete(callback);
        if (!current.size && listeners.get(scope) === current) { listeners.delete(scope); pending.delete(scope); }
      };
    },
    notify: (...scopes: Array<string | undefined>) => {
      for (const scope of scopes) if (scope !== undefined && listeners.has(scope)) pending.add(scope);
      if (pending.size && !scheduled) { scheduled = true; queueMicrotask(flush); }
    },
  };
}
