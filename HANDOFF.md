# HANDOFF.md — Project Pitfalls & Operational Guardrails

This file records non-obvious technical pitfalls, environment hazards, and operational lessons discovered during development.
**Rule**: Read this file before starting a new task to avoid repeating past mistakes. When you hit and resolve a non-obvious trap during a task, append a concise entry (Symptom / Root Cause / Rule) before finishing. Keep entries factual and actionable; do not use this file as a task log or changelog.

---

## Pitfalls & Guardrails

### Nested Skill Loaders Must Retain The Enclosing Source Observer
- **Symptom**: A cold extension manifest bypasses preview byte tracking, a local observer replaces the enclosing observer, or callback rejection becomes ordinary withheld content and publishes a partial estimate.
- **Root Cause**: The shared discovery owns acquisition but returned decoded text; observer state belonged only to the outer loader, and broad fallback did not distinguish observation admission failure.
- **Rule**: Pass raw bytes from the existing verified reader to observers before parsing. Retain enclosing and distinct local observers, deduplicate the same function, and recheck cancellation between callbacks. Propagate fixed observation errors through loader/extension fallback without private callback text. Preserve warm inventory validation and account for its synchronous reads separately. Metadata-equality fixtures must pin actual target stats, not only one exported revision function while an internal reader uses the original.

### Prompt Source Bytes And Async Expiry Need Separate Checks
- **Symptom**: Equal decoded text hides changed raw source bytes, a post-read admission failure is skipped as an unreadable file, or a periodic check republishes an expired estimate.
- **Root Cause**: Metadata alone does not bind loaded content; UTF-8/BOM/frontmatter/budget transformations lose raw-byte identity. A pending read can cross the preview lifetime, and abort does not imply settlement.
- **Rule**: Capture bounded raw-byte digests from the actual loader read before transformation, keep admission callbacks outside I/O fallback catches, and recheck the original alias around serial verified-handle reads. Withdraw expired/timed-out estimates while retaining the pending slot until settlement; periodic checks never extend the original expiry and frame reads remain filesystem-free. Keep untracked source coverage and cumulative I/O costs explicit.

### Unbuttoned Motion Is Not A Release Or A Selection
- **Symptom**: Hover reports complete a drag or clear the editor selection; a hover test passes its color assertion with an empty background sequence.
- **Root Cause**: Mouse motion with button bits 3 was decoded as release, pointer routing shared gesture handling, and color-disabled fixtures make bgOpen empty.
- **Rule**: Decode unbuttoned motion independently and route only to the active capture. Keep hover identity separate from focus/preview, clear it across pane or geometry changes, and restore any-motion reporting at the terminal owner boundary. Verify rendered bands with a fixed palette and nonempty background sequence, restore palette state, and test Enter still targets the keyboard selection.

### Hidden Sidebars Still Need Focus-Lifecycle Updates
- **Symptom**: A panned sidebar keeps its active category offscreen after Tab returns from a narrow content page, or content wheel spans overwrite sidebar spans on the same row.
- **Root Cause**: The narrow renderer returned before updating the sidebar viewport; a row-indexed single span cannot describe both panes.
- **Rule**: Update viewport focus and geometry even while the narrow sidebar is hidden. Keep a per-row collection of painted spans, pan without changing category or preview, reveal on keyboard return/reopen, and retire old pane hits after panning. Preserve a visible identity anchor on category reorder and clamp on removal.

### Wheel Targets Include Painted Non-Clickable List Rows
- **Symptom**: Wheel over settings content is ignored while section focus disables setting clicks, or a stale report moves focus after a window-changing keyboard action.
- **Root Cause**: Click admission alone does not describe the painted list region. A list wheel also needs navigation-domain transfer and nonwrapping selection, while cached geometry expires after focus changes can scroll its window.
- **Rule**: Register painted wheel spans independently from click-focus spans, preserving disabled activation. Transfer section/category focus into content rows without applying, stop at focusable ends, and retire both maps on source/filter/navigation/window changes. Test exact focused identity, preview calls, disabled browsing and zero saves; multi-select renders checkboxes rather than a cursor arrow. Pointer fixtures must select the intended pane before resolving same-name labels.

### Input Forms Need Remaining Rows And Safe Rejected Prefills
- **Symptom**: A settings editor loses its caret in short windows, cannot type a list newline, or Enter stages an empty value after an oversized prefill was refused.
- **Root Cause**: The form budget used terminal height instead of available chrome rows, modified Enter never reached the shared editor, and validation replaced the constructor's rejection state. Fullscreen differential painting also does not repaint unchanged hints after clearing an already empty field.
- **Rule**: Use the remaining row allocation for ordinary forms, retain the fullscreen viewport allocation, and prioritize the shared editor's caret row before optional headings. Opt in multiline fields while keeping Enter stage and Apply save distinct. Keep rejected-prefill admission until explicit replacement or clear. PTY probes should synchronize on changed value/focus or persisted bytes rather than require unchanged hints to repaint.

### Pointer Focus Must Follow The Painted Navigation Pane
- **Symptom**: Clicking a content row changes the visible selection, but subsequent arrows still move sidebar categories; very short frames can retain a hit target for a row that was clipped away.
- **Root Cause**: OptionModel focus and catalogue navigation domains were updated independently. Hit registration also forced one item even when the viewport had no item capacity.
- **Rule**: Transfer the navigation domain with the clicked category, section or row, preserve the search projection, and retire old hit maps until repaint. Register only painted items. PTY probes must distinguish regular relative output from borrowed alternate-screen frames, retain rows during cursor-only CUP, clear retired screen state and wait for new output after each action.

### Blocked Current Model Reports Need Exact Record Recovery
- **Symptom**: The first current-request row reports blocked credentials but only offers Back, or a failed explicit session binding loses its model label because resolution deliberately omits the target.
- **Root Cause**: The report was separate from the concrete catalogue inspections. Credential resolution is an admission result, so rejected bindings do not always retain their presentation identity.
- **Rule**: Keep a saved explicit target visibly blocked, and link its report only to an existing exact connection/provider/model inspection with unambiguous endpoint metadata. Revalidate admission before entering it; missing/provider-changed records, overrides and pool failures must not choose another relay. Preserve authentication and explicit activation as separate transactions. Keyboard fixtures must synchronize on focused identity or full details, because row notes can truncate and Enter delegates disabled rows through the host's apply callback.

### Context Composition Must Precede Continuity Classification
- **Symptom**: Preview and submission use the same expanded instructions but produce different opening-message digests and context estimates.
- **Root Cause**: Continuity was classified from the raw draft in preview and from the expanded prompt in dispatch. Template discovery also omitted absent personal candidates, so a newly created source could change routing without invalidating the preview.
- **Rule**: Share pure composition preparation, classify continuity from the effective prompt before future-turn injection, and capture candidate directories plus read sources through the existing tracker. Never run command handlers to obtain a preview. PTY fixtures need a real isolated Git root, explicit project arguments and transcript byte comparisons; Ctrl+U clears only the current line of a multiline draft.

### Concrete Connection Login Eligibility
- **Symptom**: Failed connection rows are focusable but offer no recovery, or a canonical provider catalogue offers builtin login for a custom relay.
- **Root Cause**: Setup state was overwritten by missing-credential projection; recovery only admitted absent connections. Catalogue runtime identity does not establish the selected connection's endpoint identity.
- **Rule**: Preserve pending/error state, admit explicit credential setup for those rows, and check the concrete endpoint against builtin auth policy. Delegate to the existing connect transaction, retain old records, return the newly created exact connection and require separate session activation. PTY probes must synchronize on connection identity because a same-model current-request report may be focused first.

### Settings Outcome Before Long Provenance
- **Symptom**: A configuration save succeeds but a long explicit-input path pushes the effective-value mismatch beyond the visible footer; the source itself is truncated in a row note.
- **Root Cause**: Single-row notes have a width ceiling and status footers have a fixed line budget. Putting the entire origin before the result hides the information needed to assess the save.
- **Rule**: Put saved-versus-effective outcome before long provenance. Provide bounded read-only inspection through the existing wrapped editor, retain pending edits on return, and verify user/project targets and explicit-input bytes separately through actual keyboard/terminal paths.


### Masked Credential Forms Must Precede Prompt Persistence
- **Symptom**: Filling an API-key command draft exposes credentials in terminal output, prompt history or transcript; a painted mask still leaves raw text available to a display consumer.
- **Root Cause**: Ordinary submissions persist and echo the full command before routing. Masking after rendering or sharing the normal editor/history path is too late.
- **Rule**: Keep model credential entry in the bounded input-form owner, map graphemes and caret onto a separate bullet-only display, and pass the key only to the existing credential transaction after explicit submission. Cancel without writing, clear secret undo on Ctrl+U, suppress key summaries and verify actual host/terminal/history output. Reuse the same credential-free endpoint projection as command drafts and retain exact catalogue identity checks.


### Native Model Sign-In Eligibility And Return Transactions
- **Symptom**: Builtin models hide native login, authentication returns to the wrong connection, or a role assignment expires immediately after login.
- **Root Cause**: Builtin catalogues already carry base URLs; native eligibility cannot assume an absent URL. Login publishes configuration and creates a new connection, invalidating the captured model/role transaction. A full-screen result can also truncate publication warnings behind success diagnostics.
- **Rule**: Compare canonical provider and builtin endpoint plus its auth/model contract, exclude custom relays, and reuse the native auth owner. Return with the unique newly added connection identity, fence session/workspace/profile, recapture role transactions and carry fresh context to parents. Put publication uncertainty before the concise success summary; verify disk state, accepted state and explicit model activation separately.

### Automatic Role Browsing Reusing Default Reasoning
- **Symptom**: Choosing a model for an automatic role overwrites its effort with the default request's effort, or blocks a nonreasoning model because the default uses high effort.
- **Root Cause**: Assignment browsing reuses the ordinary model chooser's default preference; treating null with nullish fallback also reintroduces inheritance that the role consumers intentionally stop.
- **Rule**: Carry the role preference explicitly through assignment browsing, preserve it only when the exact target confirms support, and use the role consumers' native provider-decided fallback otherwise. Edit the role through the existing session transaction and recapture it after saving. Verify actual subagent/advisor/summary requests as well as persisted roles and unchanged default preferences.

### Nested Catalogue Escape And Visible Mutation Results
- **Symptom**: Esc in a role assignment browser only changes its navigation domain; a successful save returns to a full-screen catalogue with no visible result.
- **Root Cause**: Catalogue navigation consumes Esc before the explicit parent handler, and transcript notices are hidden while a returned full-screen picker is open.
- **Rule**: Give opt-in parent navigation priority after input/approval/submode handling, retain the original row identity, and carry saved/application outcomes into the returned picker's status. Assert the focused parent row and visible outcome through the actual host; a changed title or persisted value alone does not prove the return path.

### Parent Settings Snapshots After Preview Cancellation
- **Symptom**: A parent settings view can capture a temporary display value while returning from a child preview; non-preview fields lose their staged value after Apply fails.
- **Root Cause**: Function arguments construct the parent before open releases the old preview, and failure retention was conditional on a field having a preview.
- **Rule**: End the child lease before constructing its parent, preserve prior staged values when cancelling a sub-editor, and retain failed staged changes for every field type. Verify display palette separately from accepted theme intent, and require a separate Apply to retry against a refreshed baseline.

### Startup Paint And Raw-Input Handoff
- **Symptom**: Loading has been laid out but its write callback lands after runtime initialization; a key typed during heavy module evaluation is handled by the later host, or a split paste loses its framing on adoption.
- **Root Cause**: Dynamic import evaluation delays stdout/stdin callbacks. Replacing or flushing StdinBuffer at the ownership boundary discards partial escape, paste and grapheme state; keeping it without subscribing to appearance reports loses theme updates.
- **Rule**: Await the early frame's device write before importing the heavy graph, then give pending startup input one poll opportunity before taking the lease. Transfer the same editor, parser and terminal once; retain accepted appearance and partial reports, remove old listeners, and restore the terminal before printing bootstrap errors. Keep no-startup host timing unchanged. Record first write and runtime readiness separately; injected load delays prove ordering, not production latency.

### Prompt Position And Composed Submission Boundaries
- **Symptom**: A second-line slash becomes a functional command after submission/history recall; inline skill markers reach an active turn without expansion, or queued images disappear.
- **Root Cause**: Trimming source before routing changes invocation offsets; direct follow-up delivery bypasses the command preparation owner, and text-only pending entries omit attachments.
- **Rule**: Preserve original source through editor and durable history. Functional commands require source offset zero. Route explicit composed methods through the same preparation boundary after the active turn settles, and retain attachments with the exact pending entry. Persist selected research methods in the native request and render them in every child stage, separately from evidence.

### Picker Reopen And Transcript Terminal-Newline Projection
- **Symptom**: Reopening the same picker retains a completed search; user text ending in a newline cannot be copied through semantic source rows.
- **Root Cause**: Host-owned filtering resets but the picker owner's query projection survives, while rendering keeps a final empty split item that source projection deliberately removes.
- **Rule**: Separate fresh-open lifecycle from mutation reload, and reset query state only on the former. Keep rendered user body rows and semantic source rows in agreement for terminal newlines; do not trim source indentation or content to obtain visual alignment.

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

### 22. A Picker Title Can Precede Selectable Source Readiness
- **Symptom**: A queued back test presses Enter after the overlay is active/title visible, then observes no rewind call under CI load.
- **Root Cause**: Opening publishes the overlay immediately; asynchronous source acquisition/projection and focus settle later. The title does not establish selectable state.
- **Rule**: Before confirming a specific choice, wait for its actual focused stable ID. Preserve separate dismissal-during-loading coverage and the original queue/operation assertions. Metadata fixtures must also respect the per-record byte cap including JSON overhead, independently of the whole-catalogue budget.

### 23. OSC52 Emission Can Precede A Copy Result That Moves Source Rows
- **Symptom**: A fullscreen probe copies one diff side, then clicking the same fixed row for the other side produces no second clipboard sequence.
- **Root Cause**: OSC52 is offered before asynchronous native clipboard attempts settle. The result toast adds chrome and moves the source row; a former source coordinate can now be blank. Transport output alone does not prove the result frame or its geometry is ready.
- **Rule**: Before the next coordinate action, wait for the actual result paint and locate its current source row. For this renderer, consume complete CUP(row,1)…K rewrites, retire incomplete overwrites, and honor its CUP+J erase. Preserve exact ordered source-content assertions; do not replace readiness with a delay or another fixed row.

### 24. External Bearer Credentials Need A Physical Identity Fence
- **Symptom**: An HTTP MCP can keep sending a changed environment credential, silently fall back to OAuth, or direct `/mcp auth` to an external PAT that local storage cannot manage.
- **Root Cause**: Reading an environment variable per request conflates a physical transport with mutable process state; generic auth recovery assumes every 401 is locally managed OAuth.
- **Rule**: Store only the variable name, capture and validate its value when the physical transport is created, recheck it after admission and before dispatch/response use, reject changes without replay or OAuth fallback, and report external auth/logout as unchanged with environment/reconnect guidance. Keep real provider probes separate from strict egress policy failures.

### 25. Generated Network Configuration Can Name An Inactive Controller
- **Symptom**: A controller connection times out despite a running service, or a DNS exception removes fake IPs but returns poisoned public addresses.
- **Root Cause**: The desktop-generated configuration can name its sidecar pipe while the service owns a production pipe. A real-IP exception also retains its upstream resolver; it does not make that resolver trustworthy or route encrypted DNS through a proxy.
- **Rule**: After explicit authorization to change external networking, back up its sources privately, identify the actual live controller, and preserve that endpoint in reload payloads. Verify effective state and OS DNS separately. Use a domain-specific encrypted resolver through the existing proxy route when necessary, preserve TLS checks, and compare its answers before provider dispatch. Do not treat HTTP reload success or a public-looking IP alone as provider connectivity evidence.

### 26. Yielded Verification Still Holds The Serial Execution Slot
- **Symptom**: A later build or test starts while an earlier judge remains running after its tool response yields.
- **Root Cause**: A returned session ID means the process is still active, even if it already printed a verdict fragment.
- **Rule**: Resume that session until an explicit process exit before starting another verification. Prefer one fast-fail `&&` chain for static gates, focused tests and structural checks; never infer completion from output alone.

### 27. Fixture Extractions Can Collide With Existing Shared Helpers
- **Symptom**: A newly extracted CLI fixture overwrites an existing helper, or passes product build while omitting constants used only by tests.
- **Root Cause**: A plausible destination name already belongs to another owner, and the product build excludes tests.
- **Rule**: Check destination existence and all existing consumers before creating a file. Preserve any occupied helper byte-exact, choose an unoccupied responsibility name, and carry every referenced fixture constant with correctly rebased paths. Run focused scenario and original-helper tests; product build alone is insufficient.

### 28. Reading A Failed Credential Response Can Leak Or Delay The Error
- **Symptom**: A rejected credential exchange exposes arbitrary response text in its error, or waits indefinitely for an error body or cleanup to finish.
- **Root Cause**: Consuming the failed body before projecting the credential error admits remote XML Message or raw text into the error surface and couples failure reporting to an untrusted stream.
- **Rule**: On HTTP failure, use the shared nonawaited response discard and report only fixed source plus numeric status. Preserve the credential error identity and successful parsing path. Test both exchange routes, zero body consumption, rejected cleanup and cleanup that never settles; requesting cancellation is not proof that cleanup completed.

### 29. A Warm Manager Can Hide Broken Persisted Cache Admission
- **Symptom**: A damaged-index test passes while a fresh process accepts malformed cached fields, throws during sorting, or returns the wrong session identity.
- **Root Cause**: The existing manager keeps a parsed index in memory, so corrupting the file and reusing that manager never exercises disk decoding. An object-only guard also does not establish the summary contract.
- **Rule**: Reopen the actual owner to test persisted cache loading. Bind the decoded summary ID to its index key and validate every consumed field before admission; reject only bad rows and recompute from the source. Check healthy-row reuse and repaired persistence separately. A skipped summary computation is not zero source or stat I/O.

### 30. Project Configuration Directories Can Alias Personal Storage
- **Symptom**: A project save in HOME changes global settings, adopts default-profile MCP definitions, or writes a legacy file after a preferred source appeared.
- **Root Cause**: The workspace configuration directory can be the personal destination, including a destination that does not exist yet while a legacy personal file is selected. An unlocked source check also expires while acquiring the write lock. Watching only the selected filename misses creation of a preferred file in an existing directory.
- **Rule**: Compare project destinations against canonical active and default personal destinations plus selected fallbacks, preserving separate scope when HOME is a workspace. Recheck selected sources during acquisition, inside the existing write lock and before publication; observe all candidates and update trust inspection. Reject dangling selected entries rather than treating them as absent. Keep test HOME and workspace distinct, then add explicit HOME/profile collision tests.

### 31. An Old Extracted Validator Can Misrepresent The Current Package
- **Symptom**: A structural check reports evidence-capacity failures while CI and the current packaged validator accept the same source graph.
- **Root Cause**: A reusable scratch extraction contains an older collector or evaluator despite sharing the same CLI entrypoint bytes; checking that entrypoint alone does not identify the whole tool.
- **Rule**: Run the checked-in validator package through the documented command or extract it into a fresh task directory. Preserve and classify the stale-tool failure, then read the current verdict and obligations. Never narrow the source graph or change product code merely to bypass an obsolete validator limit.

### 32. A Released Loopback Port Does Not Identify The Cancelled Owner
- **Symptom**: A cancelled-login test intermittently receives an HTTP response from its old redirect URL while the cancelled owner published no credentials or token request.
- **Root Cause**: A freed ephemeral port may be reused; fetch resolves for error responses too. A request to that URL after shutdown does not identify the responder or prove the original owner accepted it.
- **Rule**: Verify the captured callback owner's rejected completion and closed lifecycle directly. After a late request, recheck zero credential publication and token exchange; separately verify state mismatch. Keep unobserved response ownership or port reuse as unknown instead of weakening security assertions or diagnosing product acceptance from transport alone.

### Context Preview Cancellation And Non-Consuming Freshness
- **Symptom**: Cancelling a preview starts a second read before the first settles, or a no-pending injection preview is immediately stale.
- **Root Cause**: Abort is only a request; asynchronous reads can still be active. Empty injection getters may return fresh value-equivalent objects, while newly pending generations must still invalidate the preview.
- **Rule**: Retain the pending read slot through promise settlement. Compare empty generation snapshots by value, recheck both compact and memory generations, and never consume them during preview. Bind live history, context selection and roots to a complete bounded disk snapshot; obtain goal context from that same snapshot. Keep metadata freshness and tokenizer estimates explicitly approximate.
