# Background wait through the original CLI

Addition 20.49 fixes three concrete defects: bash advertised taskWait while the initial discovery snapshot omitted it, cancellation was described as the full configured timeout, and synchronous completion leaked the returned subscription and newly installed timers. The wait now returns its wake reason, reads the current task state and releases synchronous registration before installing any timer. The unused periodic abort check was removed; it never emitted progress.

Target was inspected first. Read-only reference `oh-my-pi` at `b0756921ed231869ea92feef0056629a429d3fe1`, `packages/coding-agent/src/tools/wait.ts`, marks wait essential, separates abort/timeout wakes, clears timers/listeners and creates a progress interval only when an update callback exists. The target adopts initial reachability and cleanup decisions while keeping its single-task runner, 300-second cap and Node 20.3 Promise construction. It does not introduce a global message/service wait owner.

The original registry/discovery tests pass 24 cases in two files. Baselines and independent reversals fail five wait cases and one initial-discovery case. Three and nine cases excluded by their reversal filters are unselected, not passing evidence. `reverse.py` uses the exact original commit and restores bytes in finally. A subsequent wording refinement says no stop was requested, avoiding a claim that another owner could not have stopped the process; final focused tests, build and CLI runs use that final source. `build.json` independently compares the compiler input list and digest and counts owner callables at 11 and 16, unchanged from the original sources.

Archived logs remove trailing whitespace and extra final blank lines to satisfy diff hygiene; test names, assertions, counts and exit evidence are retained.

Each final mode runs the actual Node CLI through the existing PTY relay, with one small saved session and one real Node background child. Loopback HTTP selects the original bash and taskWait tools. Real Alt+P input selects allow-all for this isolated run. First wait times out after one second without stopping the child. Second wait is interrupted using Ctrl+C; Linux process start identity confirms the original child remains active. Third wait watches the same job for at least 16 seconds before the fixture release file allows the child to exit. Durable journal completion, exit code zero and original persisted tool output are checked. Three wait subscriptions release, the ordinary host notice subscription remains, and no additional dispatch occurs. Each mode uses six completion requests and three readiness requests, then Ctrl+D exits zero and the PTY's cooked input flags are restored.

`regular-receipt.json` and `fullscreen-receipt.json` are final evidence. Earlier `*-short-receipt.json` runs had a 1.5-second final hold and a different build; they are not substituted for final source evidence. Startup failure used an unsupported permission-scope flag whose following value became an initial prompt. First wait failure reached Tool taskWait not found; a diagnostic repeat confirmed the exact refusal. These receipts retain bounded public observations only, and runtime scratch was removed. `failure-classification.json` separates setup and product failures.

Run serially from the repository root with no other heavy verification running:

```sh
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-background-wait/pty.mjs regular
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-background-wait/pty.mjs fullscreen
```

The harness checks the current manifest, loads only that build, caps each CLI at 45 seconds and 2 MiB, isolates HOME/profile/project and preserves no real provider state. Receipts are initially written to `.tmp/background-wait/` and must be archived before cleaning it. The fixture child polls its release file; product taskWait waits on completion events and does not poll or sleep. The probe's output summaries contain no user transcript, provider bodies or credentials. The observer wraps original operations and leaves their behavior in place; its small synchronous receipt writes affect timings.

This establishes local Linux CLI reachability and a bounded real-process wait path. It does not establish physical terminal pixels, production-duration task behavior, the 60-second promotion boundary, actual provider choice, cross-platform cleanup, full capacity, independent review or overall Phase 20 acceptance. No full suite, executable or 20,000-message probe was run.
