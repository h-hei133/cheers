/** Input is live during startup dialogs; ordinary submissions await their shared completion. */
export function inputStartup(prepare?: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  let resolve!: () => void, reject!: (error: unknown) => void;
  let started = false, finished = !prepare, failure: { readonly error: unknown } | undefined;
  const ready = prepare ? new Promise<void>((accept, refuse) => { resolve = accept; reject = refuse; }) : Promise.resolve();
  void ready.catch(() => {});
  return {
    ready,
    pending: () => !finished,
    admitted: () => finished && !failure,
    start: (): void => {
      if (started || finished) return;
      started = true;
      void Promise.resolve().then(() => { if (!finished) return prepare!(controller.signal); }).then(() => {
        if (finished) return; finished = true; resolve();
      }, error => { if (finished) return; finished = true; failure = { error }; reject(error); });
    },
    cancel: (): void => { if (finished) return; finished = true; const error = new Error('Input closed before session startup completed.'); failure = { error }; controller.abort(); reject(error); },
  };
}
