# Input gesture evidence

Feedback 36/37: a repeat paste at the end of its fresh text token expands it within 1200 ms before any text edit; a plain fullscreen composer click positions the caret through the existing source map. Interior token expansion, images, undo, drag copy, double/triple click selection, modal ownership and regular terminal mouse ownership retain their existing contracts.

`final-validation.log` records sequential execution of five static gates, nine focused files (295 tests), 13 selected actual-host tests and a separate publication file (19 tests). It also retains the initial failed publication adjustment; the later successful run and build supersede that attempt. The remaining 371 host tests were excluded by the filter. No local full suite, concurrent heavy processes, subagents, executable build or large PTY fixture was used.

`reversal.mjs` independently removes expiry, text-revision invalidation, host insertion binding, pointer movement rejection and stale-geometry rejection. Each run must fail with AssertionError, and finally restores exact source bytes. The five logs and `reversal.json` retain outcomes and original hashes. `audit.mjs` compares named callable counts to fda6a665 and checks build freshness; PasteStore is 20, projection 3, pointer 16 and chrome keys 3. The inherited host count stays 122 and is recorded as deferred ceiling debt, not a passing structural verdict.

`cli.mjs` runs the original Node CLI through `relay.py`, with a passive observer that delegates every real render, mouse event and turn event. It uses one saved session with one message per mode, isolated home/profile/project, synthetic offline configuration, a 768 MiB heap, 45 s deadline and 2 MiB output cap. It waits for the actual prompt. All input goes through bracketed paste, keyboard bytes or SGR mouse bytes; physical resize uses TIOCSWINSZ/SIGWINCH.

`regular.json` and `fullscreen.json` are the final CLI receipts, bound to `build.json`. They verify immediate repeat, expansion undo, expiry, edit/delete invalidation, unchanged user/project config and models, zero requests, exit zero and restored cooked terminal flags. At 40/80/120 columns fullscreen tests the second cell of a wide glyph, exact edit insertion and drag away/back; it also rejects a release after resize. Regular checks that SGR never invokes the pointer. Small-fixture exit times do not establish performance at user scale.

`before-regular-geometry.json` preserves a harness assumption that document rendering supplies mouse geometry. `before-click-event-sync-fullscreen.json` preserves a race where the preceding caret value satisfied the next click wait before its events ran. The corrected probe waits for both new events and the expected caret. `before-publication-*.json` retain earlier passing receipts/build before the publication test edit required a new build input digest. No product change was made to accommodate these probes.

`prior-ci.json` records failed historical runs for 26d3a53c and fda6a665. Their stale settings chips/side-column/Esc expectations and publication insertion-neighbour assumption are repaired in the current tests. Historical SHA verdicts remain failed. This evidence does not claim the new commit's CI outcome, independent review, real desktop input comfort, another platform, live provider behavior, full Phase 20 acceptance or completion of the active goal.

Reproduce from the repository root, one command at a time:

```sh
rtk proxy node .omx/artifacts/phase20-addition-input-gestures/reversal.mjs
rtk env NODE_OPTIONS=--max-old-space-size=2048 npm run build:ts
rtk proxy node .omx/artifacts/phase20-addition-input-gestures/audit.mjs
rtk proxy node .omx/artifacts/phase20-addition-input-gestures/cli.mjs regular
rtk proxy node .omx/artifacts/phase20-addition-input-gestures/cli.mjs fullscreen
```

Build inputs include tests; run the final focused tests before the build and rerun the build if any input changes. Probe scratch is removed in finally. Formal evidence is force-added under this ignored artifact directory.
