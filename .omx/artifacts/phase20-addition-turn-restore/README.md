# Turn restore evidence

Baseline: ef4d078d43f2923a02e6d60efe1166ec339633d2. See .wiki/features/phase-20-addition.md section 20.50.

- command.test.ts uses original operation preparation, commit, snapshots and restore; six behavior cases.
- reversal.log/json: original command/service/turnRestore produce six failures; byte restoration checked.
- usage-baseline.log and usage-reversal.log/json: attributed context-reset and usage-gap reject persistence on original usage owner; real manager notice also fails. All three fail independently with undo fix retained.
- tests-final.log and restored-final.log: six files, 76 tests pass; latter runs after independent usage reversal and restoration.
- build-gates-final.log and build.json: five static gates, build and independently recomputed compiler input/digest evidence. Earlier build-gates.log/build evidence predates usage repair.
- regular/fullscreen-receipt.json and corresponding cli-final.log: original Node CLI, real edit operations, unconfirmed/partial/complete restore, fresh disk notice and next HTTP request assertions. Seven completion requests and three readiness requests per mode; no external provider request.
- pty.mjs and observe.mjs: reproducible bounded fixture/observer. 2 MiB output and 45 second deadlines. Observer records original calls, then delegates; synchronous receipt writes affect timing. No raw terminal transcript or provider body retained.
- ci-observation.json: delayed head-bound status; does not assert CI success for either current or failed prior head.

Failure classification:

- baseline.log includes a stale test expectation: authority revoked after rename but before readback is unknown. Corrected fixture; original writer was correct.
- first-cli-failed.log: local report opens Pager, next typed command was consumed there.
- observer-method-failed.log: guessed nonexisting method; corrected observation point.
- pager-owner-failed.log: confirmed Enter consumed by actual Pager.
- partial-state-failed.log/regular-cli.log: real partial file result succeeded but fresh-session metadata was absent.
- usage-publication-failed.json: original addTurn attempt actually threw during strict usage identity validation. Branch projection was not the root cause; assertion retained through repair.

Source comparison is documented, no reference code copied. Focused tests and Linux PTY do not prove production provider selection, a desktop/non-Linux matrix, complete rollback failures or independent review. No whole-workspace snapshot, full suite, executable stress or 20,000-message PTY ran.
