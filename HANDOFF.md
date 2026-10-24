# HANDOFF.md — Project Pitfalls & Operational Guardrails

This file records non-obvious technical pitfalls, environment hazards, and operational lessons discovered during development.
**Rule**: Read this file before starting a new task to avoid repeating past mistakes. When you hit and resolve a non-obvious trap during a task, append a concise entry (Symptom / Root Cause / Rule) before finishing. Keep entries factual and actionable; do not use this file as a task log or changelog.

---

## Pitfalls & Guardrails

### 1. WSL2 OOM-Killer Crash Under Concurrent Build / Test Execution
- **Symptom**: WSL2 abruptly terminates `vitest`, `tsc`, `node`, or the entire agent process without a JS stack trace (`Killed` / exit 137).
- **Root Cause**: `vitest` worker pools, full-graph `tsc`, and `normproof judge` (10,000+ AST edges) each consume 1.5 GB–4 GB+ peak RSS. Running multiple heavy commands concurrently (via parallel tool calls, background `&` jobs, or multiple subagents running tests simultaneously) exhausts WSL2 memory and triggers the Linux kernel OOM-Killer.
- **Rule**:
  1. **Strict Mutual Exclusion**: Never run `tsc`, `vitest`, `npm run build*`, `npm run test*`, `npm run verify:*`, or `normproof` concurrently. Chain sequential steps with `&&`.
  2. **Subagent Ban**: Delegated subagents (`task`) must NEVER run build, test, or verification commands mid-flight; only the main agent runs verification once after integration.
  3. **Batch & Fast-Fail**: Pass multiple target test files into a single `vitest run a.test.ts b.test.ts` invocation rather than spawning separate processes. Run sub-second static checks (`verify:import-cycles`, `check:*`, `verify:docs-drift:strict`) before heavy suites so failures short-circuit cheaply.

### 2. Local TypeScript ESM Specifier Resolution
- **Symptom**: Runtime or `normproof judge` fails with unresolved module specifiers even when IDE hover works.
- **Root Cause**: Node ESM and the repository's bundler/structural gates require explicit `.js` extensions on relative imports to local TypeScript modules.
- **Rule**: Always end relative imports to local `.ts`/`.tsx` files with `.js` (e.g., `import { foo } from './bar.js'`), and run `npm run verify:import-cycles && npm run verify:docs-drift:strict` before heavy test suites.

### 3. Documentation & Rule Path Drift Gate (`verify:docs-drift:strict`)
- **Symptom**: CI gate `npm run verify:docs-drift:strict` fails after editing `AGENTS.md`, `agent-rules/*.md`, or `.wiki/_index.md`.
- **Root Cause**: `scripts/verify-docs-and-rules-drift.mjs` parses inline backtick paths and fenced code block paths in rule files and verifies they resolve on disk. Mentioning deleted or hypothetical paths in backticks/fences breaks the gate.
- **Rule**: Any repository file or directory path wrapped in backticks or placed on its own line in a fenced block inside `AGENTS.md` or `agent-rules/` must exist on disk. Run `npm run verify:docs-drift:strict` whenever editing rule or index markdown files.

### 4. Node 20.3.0 Runtime Floor Gate (`check:node-floor`)
- **Symptom**: Code passes locally on Node 22/24, but `npm run check:node-floor` or CI fails immediately.
- **Root Cause**: `package.json` and CI enforce `node >=20.3.0`. APIs introduced in Node 21/22+ are missing on the CI runner.
- **Rule**: Never call `Promise.withResolvers`, `Object.groupBy`, `Map.groupBy`, `Array.fromAsync`, `Set.prototype.union`/`intersection`/`difference`, `Symbol.dispose`, `process.getBuiltinModule`, or `fs.globSync`. Run `npm run check:node-floor` before finishing.

### 5. Temporary Diagnostic & PTY Residue in Repository Root
- **Symptom**: `.tmp-*` logs, PTY snapshots, or throwaway scripts accumulate in the repository root and pollute `git status`.
- **Root Cause**: Diagnostic scripts or manual PTY runs write directly to `./.tmp-*` instead of a contained scratch directory and exit without cleanup.
- **Rule**: Place all temporary test homes, logs, and throwaway scripts inside `.tmp/` (gitignored) or `/tmp/cheers-test/`, never as top-level `.tmp-*` files in the repo root. Remove temporary scripts/artifacts before yielding.

### 6. Chunked Reads Still Allocating And Reading The Entire Navigation Prefix
- **Symptom**: A navigation reader uses 64 KiB descriptor reads but allocates the full byte allowance and reads the remaining body before enforcing a much smaller line limit.
- **Root Cause**: Chunking acquisition alone does not bound allocation or stop unnecessary work. Tree entry admission performed during projection also runs after transcript acquisition.
- **Rule**: Consume complete lines incrementally, stop at the first reached byte/line bound, preserve UTF-8 across chunks, and revalidate the opened source before publishing. Reject an already over-limit tree before opening its transcript. Keep 20k boundary checks in unit mocks/slice logic; never feed 20k messages into a real terminal binary for a PTY probe.

### 7. Built-In Filesystem Spies Missing A Read Boundary
- **Symptom**: Moving source admission after transcript acquisition fails only one of the synchronous/asynchronous regression cases even though both paths read too early.
- **Root Cause**: Spying on the default filesystem object does not reliably observe functions consumed through different module import forms.
- **Rule**: Observe the runtime's transcript read exports when asserting acquisition order. Reverse the ordering and require both sync and async cases to fail on actual read calls; an unchanged rejection message alone does not prove early admission.

### 8. Display Pagination Still Retaining Every Operation Receipt
- **Symptom**: A 40-item undo page or one latest/exact-ID lookup retains the entire decoded operation ledger before selecting its result.
- **Root Cause**: A bounded display slice runs after eager array acquisition. Incremental hashing alone does not remove that array.
- **Rule**: Consume receipts through the shared budgeted scan and retain only the selected page or result. Continue validating every receipt and preserve the full-ledger cursor digest; stopping at a full page or first match can hide a damaged older receipt.

### 9. Fresh CLI Processes Can Reenter Existing Conversation History
- **Symptom**: A loopback provider fixture returns its final answer before exercising the intended tool, or old transcript events satisfy a new process's assertions.
- **Root Cause**: Normal startup can reenter the previous session. Testing whether any historical tool message exists mistakes an earlier turn for the current tool response; a new process does not imply a new transcript.
- **Rule**: Match fixture replies to the current turn, and assert appended transcript events against a captured prefix. When checking approval lifetime, retry the same exact target scope and check the persisted grant store; changing target paths can hide an accidentally retained grant.

### 10. Cross-Page Quotas Retaining A Retired Page's Cancellation
- **Symptom**: Selecting the next session page fails with an abort error after the previous picker closes.
- **Root Cause**: The browse attempt retains a shared byte quota whose checks capture the first page's AbortSignal. Normal page handoff cancels that signal before the next page starts.
- **Rule**: Keep cumulative quota state independent of view cancellation. Each acquisition must check its current page's signal, while later pages keep the same used-byte count. Test the actual listing/picker handoff and quota exhaustion after retiring the previous page.

### 11. Mixed Vitest Runners Failing Before Test Collection
- **Symptom**: Both a new test and an unchanged test fail at `afterEach` with `Cannot read properties of undefined (reading 'on')`, before collecting any tests.
- **Root Cause**: The root runner and the package-local Vitest resolve different runner instances in a workspace with both installed. Hook registration then cannot see the collecting suite.
- **Rule**: Run focused tests from the owning package using its local Vitest executable. Classify collection failures separately from product assertions; do not change product code or dependencies to repair an incorrectly selected runner.

### 12. Cancelling A Refresh Does Not Drain Its Acquisition
- **Symptom**: A burst of native publication events starts many inspections while an older descriptor acquisition is still pending, even though every older AbortController was cancelled.
- **Root Cause**: An abort invalidates the result but does not synchronously settle filesystem promises or release descriptors. Immediately replacing the pending controller loses the resource reservation too early.
- **Rule**: Keep the active acquisition slot until its promise settles. Coalesce later refresh requests into one trailing flag, discard superseded results, and drop queued work on view closure. Test a real opened descriptor held before delivery, then verify both latest-result delivery and closure while queued.

### 13. Cooperative Ledger Reads Exposing Changes To Earlier Receipts
- **Symptom**: A paged history view yields between receipts but can publish a digest containing an earlier receipt that changed after it was hashed.
- **Root Cause**: Descriptor checks cover each individual read. Once the scan yields, they no longer establish that previously consumed sources remain unchanged through the rest of the scan.
- **Rule**: Keep the complete canonical receipt digest and compact source versions for the directory, index, and consumed receipts. Revalidate sources before publishing, recheck admission between acquisitions, and discard cancelled or replaced loads. Treat stat versions as optimistic freshness, not a substitute for content validation or a cross-file transaction.

### 14. Caller Cancellation Settlement Is Not Internal Request Drain
- **Symptom**: A catalogue cancellation test treats the outer promise settling as proof that the gateway's queued acquisition finished, or expects closing a view to kill a shared runtime connection.
- **Root Cause**: The gateway can reject its caller on abort before its internal operation settles. A view owns its request; the runtime owns the shared connection.
- **Rule**: Observe the real inner request's completion and cancellation protocol before claiming drain. Assert connection retention and explicit runtime-owner teardown separately. Combine original command and view cancellation at the shared read owner, while accepted selections use their own lifetime rather than the retired view signal.

### 15. A Bounded Producer Count Can Expand Into Unbounded Row Projection
- **Symptom**: A 200-row report still transforms thousands of omitted labels and details.
- **Root Cause**: One command can expose many named invocations. Capping commands before expansion and rows after mapping does not limit row metadata work.
- **Rule**: Charge the shared row window before expensive field projection, including across producer boundaries. Test one producer with many rows and multiple producers crossing the same limit; preserve exact omission counts separately and state which enumeration/alias work remains outside that bound.

### 16. Source Admission Can Close A View Before Its Result Is Published
- **Symptom**: Closing a loaded picker leaves an offered choice usable, or cleanup clears choices but a pending load repopulates them afterward.
- **Root Cause**: Offered identities have their own lifetime. A loader's final admission callback can synchronously close the view after its cancellation check and before its caller commits those identities. Acceptance also retires the browser signal, so treating every abort as rejected selection breaks accepted reads.
- **Rule**: Clear offers on the existing cancellation hook, invalidate the load generation, and recheck browser/original cancellation immediately before publishing. Keep accepted selection separate. Test closure from inside post-acquisition admission using real sources, including calls without a browser signal.

### 17. Forwarding A Signal Does Not Register A Command Cancellation Owner
- **Symptom**: Supplied-signal tests pass, but cancelling a real interactive read cannot stop its catalogue acquisition; a retired picker can also still return accounting or account results.
- **Root Cause**: The interactive bridge supplies a cancellable operation port, not an already active signal. A handler that never enters that port has no command controller to cancel. View generation checks suppress stale rendering but do not invalidate the picker's own actions. Admission and configuration callbacks can also synchronously abort after an earlier check.
- **Rule**: Enrol asynchronous inspection in the existing command lifetime, combine any original signal, and test the real route/session cancellation boundary. Recheck cancellation after injected callbacks and before acquisition or publication. Preserve accepted work independently of the browser signal, and account for warm extension inventory rereads separately from parsed manifest cache hits.

### 18. Diagnostic Fallbacks Can Hide Command Cancellation
- **Symptom**: Ctrl+C cancels an inner tool inspection, but its debug caller publishes an unavailable report; a summary can also skip the shared reader's admission checks.
- **Root Cause**: A catch-all source fallback treats cancellation and expired admission as ordinary source failure. Adding an owner to both delegate and caller can also create nested registration.
- **Rule**: Keep one command owner across delegated inspection, recheck its signal/admission before fallback, and reuse the shared read owner. Test cancellation through the actual route separately from ordinary unavailable-source behavior.

### 19. A Registered Picker Command Can Still Be Unreachable From The Keyboard
- **Symptom**: An accepted read has a real command controller but terminal Ctrl+C never aborts it, or an idle interrupt only invalidates the result without draining acquisition.
- **Root Cause**: Held input can swallow cancellation keys, and keymap/interrupt dispatch can consider only foreground turn busy state.
- **Rule**: Test Enter and configured interruption through the actual terminal host. Permit interruption actions through held input only for an existing command owner, include it in interruptibility, and await its existing settlement boundary; preserve unrelated held drafts.

### 20. Marker Existence Is Not A Completed Readiness Payload
- **Symptom**: A process cancellation test finds its ready file but later reads empty/truncated JSON.
- **Root Cause**: File creation becomes visible before writeFileSync has written and closed the marker; cancellation can kill the writer in that interval.
- **Rule**: Publish readiness only after the complete payload is written, using a same-directory rename, or wait for a fully validated payload before cancelling. Keep the original process-cleanup assertions.

### 21. Independent Row And Character Caps Can Exceed The Report Envelope
- **Symptom**: A legal catalogue/log/metric snapshot fails the whole report, or a renderable snapshot loses structured persistence.
- **Root Cause**: Display and facts duplicate metadata, multibyte/control expansion changes byte costs, and codec structural nodes differ from a producer row count. A character cap also allows many short logical lines.
- **Rule**: Fit captured metadata using the shared snapshot/text limits, reuse the codec's structure check, retain source totals/status separately from shown/omitted projection, and test text plus codec roundtrip. Retry only typed resource limits; encountered producer/type errors must propagate. Keep source reads and raw accounting outside retries.
