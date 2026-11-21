# HANDOFF.md — Project Pitfalls & Operational Guardrails

This file is the curated, compact index of reusable engineering pitfalls, environment hazards, and operational guardrails for this repository (kept under ~15 KB for fast targeted lookup).

- **Lookup Rule**: Search this file by subsystem keyword (`rg -i "<topic>" HANDOFF.md`) before touching an unfamiliar runtime surface instead of loading raw archive logs.
- **Record Rule**: When you resolve a non-obvious trap (runtime race, build/test hazard, environment quirk), add a concise `Symptom / Root Cause / Rule` entry under the owning domain below. Keep task logs and commit histories out of this file.
- **Archive**: Historical per-batch pitfall entries from 2026 are preserved verbatim in [.wiki/refactor/handoff-archive-2026.md](.wiki/refactor/handoff-archive-2026.md).

---

## 1. Build, Packaging & Toolchain

### Evidence Source Snapshots Must Not Become Discoverable Tests
- **Symptom**: Focused `vitest` runs discover archived test copies or resolve the wrong package's Vitest hooks, producing zero-test failures.
- **Root Cause**: Archived snapshots kept executable `.test.ts` extensions, and running a package Vitest binary from the repo root altered discovery.
- **Rule**: Store archived code snapshots as non-executable text and run package Vitest from the owning workspace (`npm run test -w packages/ts-shell -- <files>`).

### TypeScript Test Launchers Need A Terminal Test Summary
- **Symptom**: Running a `.mts`/`.ts` test through `tsx` with `node --test` can exit 0 on some Node versions without discovering any tests.
- **Root Cause**: Exit status 0 alone does not prove tests executed.
- **Rule**: Require an explicit terminal pass count (`tests N`, `pass N`) alongside exit 0 and validate launcher invocations at the Node `>=20.3.0` floor.

### Never Run Heavy Builds Or Tests Concurrently In WSL2
- **Symptom**: Parallel `tsc`, `vitest`, `build`, or `normproof` runs terminate with exit 137 (`Killed`).
- **Root Cause**: WSL2 bounded RAM triggers the Linux OOM-Killer under concurrent TypeScript/Vitest workers.
- **Rule**: Chain heavy commands serially with `&&`, run Tier-1 sub-second static gates first, batch multiple Vitest targets into one invocation, and never invoke `build`/`vitest`/`normproof` inside delegated subagents.

---

## 2. NormProof & Structural Gates

### Bundle Metadata Limits Need An Actual Consumer
- **Symptom**: Declaring a byte limit in `.normproof/bundle.json` does not enforce it in `normproof judge`.
- **Root Cause**: `bundle.json` is packaging metadata; the collector reads `maxFileBytes` and `resources.accepted` from `.normproof/evidence-manifest.json`.
- **Rule**: Trace every limit to its runtime reader and verify exact overflow behavior through the actual CLI.

### Artifact Bundling Must Normalize Real Paths Without Host Leaks
- **Symptom**: `artifact.json` records `../../../home/<user>/...` in `provenance.inputs`.
- **Root Cause**: Computing `path.relative(source, resolved)` without `realpathSync` on both `source` and `resolved` leaks host paths across symlinks or working-directory mismatches.
- **Rule**: Resolve both source root and every esbuild metafile input via `realpathSync`, reject any input escaping `source`, and assert zero `/home/` or `..` segments in `artifact.json`.

### Capability Evidence Must Retire When Another Task Changes Its Source
- **Symptom**: A verification probe passed, then a later full suite fails while uncommitted edits mutate the shared worktree.
- **Root Cause**: Commit SHA stayed constant while working-tree bytes changed across processes.
- **Rule**: Bind verification evidence to actual source bytes, isolate temporary fixtures inside `.tmp/` or `/tmp/cheers-test/`, and never leave `.tmp-*` files in the repo root.

---

## 3. Process Lifecycle, Sandbox & PTY

### PID Existence Does Not Prove A Terminated Target Is Running
- **Symptom**: A PTY wrapper closes its streams, yet `kill(pid, 0)` still succeeds and fails teardown tests.
- **Root Cause**: Linux retains an exited zombie PID until reaped, and PIDs can be reused.
- **Rule**: Capture the target's start identity while live, then observe absence, identity change, or zombie state within a bounded deadline after wrapper close.

### Sandboxed Hooks Must Expose Non-System `process.execPath`
- **Symptom**: `PreToolUse` / `Stop` hooks fail under `bwrap` when Cheers runs via `nvm` Node or a compiled single-file executable outside `/usr`/`/bin`/`/opt`.
- **Root Cause**: `bwrap` only read-only mounts `sandboxSystemReadRoots` and the workspace; executables under `$HOME` are invisible inside the namespace.
- **Rule**: Pass `readOnlyRoots: [process.execPath]` when planning sandboxed hook commands (`writeGate` / `completionGate`), and log a warning whenever the persistent write-gate stdio worker falls back to one-shot execution.

### Startup Metrics Must Follow Real Surface Readiness
- **Symptom**: Benchmarks misreport first-frame latency or PTY probes send input before a view finishes returning.
- **Root Cause**: Prepaint, runtime adoption, and stream flush are separate lifecycle events.
- **Rule**: Synchronize terminal assertions on concrete rendered chrome/focus markers and wait for child process exit and stream close before tearing down fixtures.

---

## 4. Provider Streams, Caching & Metering

### Compatible Streams Can Carry Structured Content Arrays
- **Symptom**: A compatible-protocol stream keeps tool calls while dropping text or reasoning blocks.
- **Root Cause**: Native endpoint envelopes can return structured content arrays skipped by plain-string decoders.
- **Rule**: Select the content decoder at the native endpoint boundary while preserving shared tool assembly and admission checks; test both the native endpoint and a generic control.

### Metering And Cache Retention Must Capture Request-Time Facts
- **Symptom**: Cost, cache-miss estimation, or tiered pricing drifts when models or catalogs reload mid-session.
- **Root Cause**: Re-reading mutable catalogs after completion loses the exact rate schedule and cache window that governed the sent request.
- **Rule**: Capture exact endpoint address, pricing tier, and cache retention window before transport handoff; keep `unknown` / `partial` usage and absent prices visible rather than fabricating zero.

---

## 5. Session Persistence, Concurrency & Recovery

### Multi-File Session Creation And Activation Need Explicit Guards
- **Symptom**: Concurrent session creations overwrite the same ID, or an async pre-switch hook overwrites a newer active selection.
- **Root Cause**: Non-exclusive existence checks race across processes, and registry writes without source/destination CAS clobber competing selections.
- **Rule**: Use non-recursive exclusive `mkdir` + `wx` creation and lock-guarded CAS (`activationId` + `expectedVersion`) on session activation; retain `unknown` outcomes on write/fsync/readback uncertainty instead of faking rollback.
- **Read boundary**: Carry the observed activation into implicit startup admission. Preserve the selection after a snapshot version conflict so startup can retry. Compare export file versions before attaching accounting since a completed transaction may already have removed its marker.

### Async Admission Must Recheck Generation, Grants, And Cancellation After Every `await`
- **Symptom**: A dismissed picker saves stale state, a revoked grant reads attachment content, or a late reload resurrects a closed host/extension.
- **Root Cause**: Capturing permissions, picker closures, or catalog snapshots before an `await` allows stale generations to commit after dismissal, revocation, or reload.
- **Rule**: Bind actions to explicit host/extension generations, recheck admission, cancellation, and live grants after every async boundary, and consume one-shot actions once.

### Reopen & Picker Focus Must Preserve Accepted Values Without Silent Normalization
- **Symptom**: Pressing Enter on an effort/settings/model chooser overwrites a saved preference with the first option when the saved option is unavailable or filtered out.
- **Root Cause**: Falling back to index 0 when the current value is absent from the active list silently mutates user choices.
- **Rule**: Retain unavailable current values as disabled focusable rows, keep selection separate from activation, and pass explicit parent-return callbacks through every nested reconstruction path.

---

## 6. Extensions, SDK & Replay Discipline

### Extension Lifecycle Settlement Must Fence Closing Before Retirement
- **Symptom**: `dispose()` or `/plugin reload` lets late `sendMessage`/`append`/UI callbacks execute against a retired host or drops cleanup errors.
- **Root Cause**: Concurrent `cancel` and `closeExtensions` race with in-flight handlers and swallow `allSettled` rejections.
- **Rule**: Close new host operations synchronously first, await active run settlement, dispatch `shutdown` to the original audience, then retire the generation while surfacing the first cleanup error.

### SDK Reload Validates Saved Presentation Fields
- **Symptom**: SDK resource reload rejects a session after its first saved prompt.
- **Rule**: Use the saved title and activity time when verifying reload metadata. Keep the live session binding and pin saved file versions through replacement.

### Script Model Helpers Require The Host's Media Tool
- **Symptom**: A script calling a model helper invokes an unrelated tool that has the same name as a media tool.
- **Rule**: Require the captured host media definition before dispatch. Keep the nested call on the ordinary permission path.

### Discovery Shutdown Must Match The Owner's Abort Reason
- **Symptom**: Closing MCP misreports a cancelled handshake as a cleanup failure.
- **Rule**: Match rejection to the captured cancellation reason. Join transport disposal and report any separate cleanup failure.

### Read-Only Inspections And Review Notes Never Grant Write Authority
- **Symptom**: A model review, advisor note, or imported report bypasses ordinary tool preparation or approval boundaries.
- **Root Cause**: Conflating advisory evidence with execution authority.
- **Rule**: Keep dry-run, preview, permission-pending, denied, blocked, approved-for-write, and write-success states distinct; all workspace mutations must flow through prepared, approved edit/execution owners.
