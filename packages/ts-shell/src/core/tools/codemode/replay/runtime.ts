/** Install only inside the recording/replay VM, before publishing any script globals. */
export const REPLAY_RUNTIME_SOURCE = `
  if (determinism) {
    const NativeDate = Date;
    const VirtualDate = new Proxy(NativeDate, {
      apply() { return new NativeDate(determinism.startedAt).toString(); },
      construct(target, args, newTarget) {
        return Reflect.construct(target, args.length ? args : [determinism.startedAt], newTarget);
      },
    });
    Object.defineProperty(NativeDate, 'now', { value: () => determinism.startedAt });
    Object.defineProperty(NativeDate.prototype, 'constructor', { value: VirtualDate });
    globalThis.Date = VirtualDate;

    let state = determinism.seed;
    Object.defineProperty(Math, 'random', { value() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    } });

    // Native date formatters can read the current wall clock when called without a date.
    for (const name of ['Intl', 'Temporal', 'WeakRef', 'FinalizationRegistry',
      'SharedArrayBuffer', 'Atomics', 'WebAssembly']) {
      Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false });
    }
  }
`;
