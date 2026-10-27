# HANDOFF.md — Project Pitfalls & Operational Guardrails

This file records non-obvious technical pitfalls, environment hazards, and operational lessons discovered during development.
**Rule**: Read this file before starting a new task to avoid repeating past mistakes. When you hit and resolve a non-obvious trap during a task, append a concise entry (Symptom / Root Cause / Rule) before finishing. Keep entries factual and actionable; do not use this file as a task log or changelog.

---

## Pitfalls & Guardrails

### PID Existence Does Not Prove A Terminated Target Is Running
- **Symptom**: A PTY wrapper and its streams close, but a termination test fails because kill(pid, 0) still succeeds.
- **Root Cause**: Linux keeps an exited zombie's PID until reaping; PID reuse also makes the same number identify a different process. A wrapper close alone does not resolve these cases.
- **Rule**: Capture the actual target's start identity while live, then observe absence, identity change or zombie state with a bounded deadline after wrapper close. Keep an active original target as failure. Verify the observer against a controlled zombie and a live process; do not diagnose an unobserved CI residual as zombie or claim that zombie observation proves reaping.

### Reopened Pickers Need Operation Generations And Durable Write Notices
- **Symptom**: A dismissed thinking chooser still saves, or its old pending hook commits after the same picker instance reopens. Dropping every late outcome can also hide a write that completed before a post-switch hook closed the panel.
- **Root Cause**: Mutable current-choice state is reused across browser lifetimes, and UI lifetime is mistaken for the persistence outcome.
- **Rule**: Capture a browser generation and original admission per action; recheck them around admission callbacks and pass them into the existing transaction guard. Gate duplicate pending actions. New explicit opens may reacquire current values, but old generations cannot commit or reopen parents. Preserve the transaction's confirmed write/refusal notice even after the UI retires. Fullscreen partial repaint may retain the input hint without repainting it; synchronize returns on actual changed chrome and then verify the next action.

### Unavailable Saved Choices Must Retain Their Read-Only Focus
- **Symptom**: A role effort saved as high opens on auto after its exact catalogue removes high support; default Enter can overwrite the accepted preference.
- **Root Cause**: The supported-choice list omits the current value, so initialSelection cannot find it and the generic list falls back to the first row.
- **Rule**: Retain an unavailable current value as a disabled, focusable row. Keep it out of accepted write choices and require explicit movement to a supported value. Test default Enter, direct refusal, explicit save and readback with all automatic roles. For PTY byte comparisons, capture state after startup restoration settles and check the model selection separately across startup.

### Evidence Source Snapshots Must Not Become Discoverable Tests
- **Symptom**: A focused Vitest command discovers archived test copies or resolves the wrong package's Vitest hooks, producing zero-test failures.
- **Root Cause**: Evidence snapshots retain executable `.test.ts` names, and invoking a package binary from the repository root changes discovery and module resolution.
- **Rule**: Archive source as non-executable text snapshots and run the owning package's local Vitest from that package directory. Classify discovery/invocation failures before changing product code; preserve their logs separately from behavioral baselines.

### Child Cancellation Must Retire Actions Without Cancelling Its Parent
- **Symptom**: Role actions still save after a panel closes, or returning from a child with Escape leaves its parent unable to save. Disabled-row and input continuations can also lose cancellation tracking.
- **Root Cause**: Local action admission survives host dismissal, while parent and child share a browser controller. Overlay action wrappers copy the picker and lose a WeakMap keyed only by the original object.
- **Rule**: Retire local actions permanently on dismissal and after accepted use; recheck the original admission before constructing children and around writer guards. Transfer the shared controller on explicit parent return, abort it on root close or failed parent construction, and carry opaque owner identity through action wrappers. Test actual host Escape, inspection/input continuation, late callbacks and shutdown; use regular-output observation for regular panels rather than a fullscreen-only parser.

### Catalogue Refresh Fallback Must Observe The Actual Missing Focus
- **Symptom**: Deleting the focused model jumps to the first row, leaves a deleted navigation ID, or announces removal when only a search match disappears.
- **Root Cause**: Stable-ID retention has no owner-specific missing-ID fallback; navigation remembers IDs independently of the displayed filtered list. A default selection callback also runs when a surviving focus is present.
- **Rule**: Reconcile only a missing focus during data refresh using the preceding visible rows; leave ordinary search and surviving manual focus with their original owner. Recheck that the model truly left the full catalogue, choose surviving neighbours by exact ID, remove retired navigation IDs, and keep selection separate from activation. Test empty categories by Enter refusal and owner identity because sidebar and row focus both paint arrows.

### Exact Model Categories Must Follow Their Own Admitted Rows
- **Symptom**: Every relay using one protocol is labelled available when only one has a usable connection, and unavailable relays precede the ready one.
- **Root Cause**: Protocol-level availability aggregates credentials for all of its connections; it cannot determine availability of an exact catalogue category.
- **Rule**: Derive category readiness from its own admitted model rows and preserve stable order within each availability group. Keep blocked models browsable and preserve manual identity across refresh. Catalogue cache writes replace the supplied provider set; ambiguity fixtures must include both conflicting entries.

### Model Details Need Host Ownership And Catalogue-Replacement Identity
- **Symptom**: A detail action or late refresh can apply after its host was replaced, or a deleted/replaced model can remain actionably displayed; a failed reload can also be misreported as deletion.
- **Root Cause**: Picker lifetime, asynchronous action completion and accepted-catalogue identity are separate lifetimes. Previous-visible rows describe focus order, not whether a target still exists after reload.
- **Rule**: Bind details to the current accepted revision and exact record identity, pass a host ownership check through the accepted action, and recheck it after every asynchronous boundary before publishing or applying. Rebuild the view from the reloaded catalogue; use old visible rows only to choose a neighbour, the new catalogue to decide availability, and distinguish a confirmed removal from a refresh failure. Carry the original search/category return origin through nested children and clear transient focus notices only on a later accepted revision.

### Provider Slots Need Effective Resolution Identity
- **Symptom**: A provider-level picker row can remain visually actionable after its ambient credential or endpoint changes; applying it then switches using bytes different from the displayed choice. Treating any credential without a connection ID as equivalent can also make a non-current ambient credential look resumable.
- **Root Cause**: Provider targets persist provider/model/scope only, while the effective source, endpoint and credential are resolved again from environment, CLI and profile state. Absence of a connection ID is not a credential identity.
- **Rule**: Capture a non-persisted digest of the effective provider, model, normalized endpoint, source/auth mode, environment variable, blocked state and complete credential/account identity when rendering an actionable provider slot. Require a valid reviewed token through the picker-target entrypoint, compare it before switching, and exclude deliberate effort edits from the credential digest. Never display, persist or log the digest or its inputs. Keep non-current ambient provider slots disabled unless a named connection owns the cross-provider choice, but project their effective credential source and endpoint through the same resolution used for catalogue metadata, details and configure drafts; provider-slot exactness remains switch-time only unless the persisted session contract later gains a stable credential identity.

### Raw Baselines And Live Return Frames Need Exact Observation
- **Symptom**: A source reversal fails to compile, or a terminal probe sends search text before a detail has returned to the model catalogue.
- **Root Cause**: A filtered Git display is not raw source. Detail and catalogue frames share endpoint text; an Escape may also still be buffered when subsequent text arrives.
- **Rule**: Use raw Git output when restoring source bytes. Synchronize terminal return on the focused model row, then send the next action. After test edits, recheck build freshness because test inputs also belong to the build digest. Theme retry fixtures must implement the original draft's reopen port and distinguish it from fresh host acquisition.

### Startup Metrics Must Follow The Actual Surface And Configuration Scope
- **Symptom**: A benchmark calls the later model label its first frame, or a configuration test demands an old model catalogue after reopening and accidentally reloads ordinary settings.
- **Root Cause**: Prepaint/adoption changed the lifecycle without updating measurement markers and a fixture dropped the catalogue-only refresh parameter. Listener installation, runtime construction, adoption and stream write completion are different events; process exit can precede stream close.
- **Rule**: Observe the actual Loading editor, record runtime adoption separately, validate unique ordered marks and keep parent/process clock origins separate. Wait for target close and fixture cleanup before the next sample; verify actual PTY termination. Model reopening must pass catalogue scope through the original publication and retain accepted ordinary values. Keep ordinary command pinning tests separate from explicit reopening, and record cache control and absent before/after evidence honestly.

### Prospective Model Effort Must Be Selected Before Its Atomic Switch
- **Symptom**: A configured model blocked by the current reasoning preference offers only Back, or recovery changes the current model's effort before target selection succeeds.
- **Root Cause**: Credential setup and capability recovery share a disabled-row presentation, while the ordinary thinking command edits the active target. Same-name canonical metadata also cannot decide a relay's supported levels.
- **Rule**: Offer a prospective target effort chooser only for capability blocking, use the exact catalogue address, and commit model plus effort through the original model selection transaction. Preserve its hook/constraint/freshness guards and model-specific default reset. Cancel and dismissed loads must not mutate or revive actions; test actual host keys, settings returns and asynchronous hook refusal. Keep visible action names within the real list width.

### Reopening A Model Picker Must Refresh Its Accepted Catalogue
- **Symptom**: An old model detail enters a new credential form with its stale endpoint, or rejects correctly but reopening still displays and recaptures that endpoint; exited details remain callable.
- **Root Cause**: Target closures and child admission have different lifetimes. Capturing both an old accepted catalogue and fresh disk catalogue does not update the accepted publication. A later load can also revive a closed detail owner.
- **Rule**: Recheck the original target admission before constructing children, retire details on exit and consume their actions once, including after admission callbacks close the host. Reopen through the existing configuration publication with a catalogue-only update that preserves ordinary accepted settings and validates active model constraints. Test with the actual runtime publication and external catalogue edits; disk-only fixtures miss this defect. Keep cancelled key entry, real authentication and explicit activation separate.

### Picker Defaults Must Use Accepted Values Without Normalizing Them
- **Symptom**: Opening a boolean, enum or thinking chooser and pressing Enter stages the first value instead of the current value; obsolete or unsupported preferences silently fall back.
- **Root Cause**: Choice focus was derived only for preview fields, and an effort picker did not supply initial focus. Stored/requested values can also differ from the installed effective value.
- **Rule**: Resolve initial focus from the owning effective value or theme intent on each open; inspect unmatched values and retain unsupported active effort as read-only focus. Keep pending Apply separate and test default Enter plus discard/save/reopen with real owners. Navigation Escape tests must cover search, category and close layers before asserting subscription release.

### Parent Returns Must Survive Nested Model Reconstruction
- **Symptom**: A settings child returns to the shell after nested model details, Default browsing, or credential cancellation; a saved role notice disappears on the next Escape.
- **Root Cause**: A back callback patched onto one picker instance is lost when nested owners rebuild the catalogue; session controls are also easy to mistake for file-scoped settings.
- **Rule**: Pass parent returns through the original picker owner and all recursive reconstruction paths, retaining outcome notices. Delegate session choices and runtime refresh to existing owners, identify their scope separately from settings files, and test registry-to-overlay cancel/save/expired paths with the actual configuration publication.

### Search Projection Must Preserve Navigation And Explicit Return Ownership
- **Symptom**: Clearing a search loses category/section focus, Esc closes the catalogue, or returning from model inspection shows only the narrow sidebar despite retaining the model ID.
- **Root Cause**: Search overwrites the navigation domain; a new host filter clears projection state while a shared navigation object still carries the old search mode. Reapplying explicit return focus on every load also steals later manual sidebar navigation.
- **Rule**: Capture the pre-search domain once, retain real section identity, and distinguish clear-to-origin from selected-result navigation. Retire the snapshot on explicit hierarchy movement. Restore model content focus once per explicit open/return after the catalogue is loaded; keep publication refresh separate. Preserve child/parent Escape priority. PTY fixtures must account for stored-value markers, borrowed-screen exit, regular detail output and merged builtin provider ordering.

### Attachment Content Verification Is Separate From Live Read Admission
- **Symptom**: Context preview rereads attachment bodies synchronously on every verification, cancellation cannot interrupt those reads, or an async reader returns content after grants or roots were revoked.
- **Root Cause**: Content digest checks and permission checks shared one synchronous reader; a captured gate options object expires across await. Existing strict UTF-8 attachment digests already bind valid raw bytes, so treating this as missing content verification misclassifies the defect.
- **Rule**: Keep the stored attachment digest and scope contract, reuse the existing asynchronous inspection owner, validate entries serially and retain descriptor settlement on cancellation. Separate metadata/path/live-grant checks from body rereads, obtain current read options at every admission and recheck after await. Preserve pinned ordinary-settings semantics; test actual substrate revocation rather than replacing an equivalent config object. State that frame reads are pure while background metadata/inventory checks still perform I/O.

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

### Read-Only Sources Need Separate Admission And Bounded Layout
- **Symptom**: Wheel is swallowed by a form, a large provenance view is empty, and Enter cannot return after its prefill was refused.
- **Root Cause**: The writable editor cap also gates read-only inspection; whole-source grapheme layout scales with repeated values, while form chrome has no content-local pointer boundary.
- **Rule**: Keep writable/secret caps, admit read-only text separately, and lay out bounded source slices with complete grapheme boundaries and explicit continuation or rejection. Route wheel only over the current painted content and expire hits after motion. Return through the read-only owner even on rejection; test full source reconstruction, pending retention and unchanged file bytes.

### Prompt Code Closures Need Complete Delimiter Boundaries
- **Symptom**: Slash examples inside code activate methods or missing skills, while real skills after a longer legal closing fence disappear from composition.
- **Root Cause**: Searching for the opening marker anywhere in the remaining text closes on an embedded body run or leaves extra closing ticks; inline spans also require equal complete runs.
- **Rule**: Recognize fenced closes only on independent same-character lines with sufficient run length and no trailing prose. Share the existing exact-run inline matcher through a lower owning domain, preserve source offsets and CRLF, and test completion, prepared prompts, previews and durable research stages with two real skills after the example. Keep unfinished prompt literal policy separate from display fallback.

### Memory Preview Generations Do Not Bind Raw Store Bytes
- **Symptom**: A pending injection remains current after an equal-length store change, or cancellation cannot interrupt preview body reads despite generation checks.
- **Root Cause**: The planner tracks injection state and file metadata but decoding/folding drops original bytes; the local store's ordinary read contract is synchronous. A separate facts-inspection command also does not report this injection owner's pending state.
- **Rule**: Propagate optional bounded read options through the existing memory owner, observe actual raw bytes before decoding, and connect asynchronous content verification to the runtime preview. Retain cancellation settlement and profile/session identity checks, leave pending state unconsumed and test the actual view owner. Count health/candidate/lifecycle rereads separately; single-file bounds do not prove cumulative I/O limits.

### Shared Read Snapshots Need Detached Results And Live Publication Checks
- **Symptom**: A preview rereads one file for every lifecycle ID, or a caller mutates a cached record and changes later snapshot results.
- **Root Cause**: Health, selection and ID lookup each acquire/fold the same source; caching returned object references exposes captured state. A captured reader alone also does not prove the source stayed current until publication.
- **Rule**: Keep a single-operation read-only snapshot in the owning store, share its folded records/ID index and return detached records and diagnostics. Recheck captured cancellation/profile on cached calls, take a new snapshot per preparation and retain final raw-source verification before publishing. Count acquisition and later verification separately; a domain-local reduction is not a whole-request I/O bound.

### Workflow Entry Projection Must Not Acquire Execution Authority
- **Symptom**: A context estimate needs a driver-specific prompt and run-bound tool schema, but invoking the original command would create or arm persisted work.
- **Root Cause**: Entry transformation, identity construction and tool descriptors are embedded in runtime mutation or executable tool factories; ordinary prompt preparation cannot represent the actual first request.
- **Rule**: Extract shared entry/run and descriptor projections in the original workflow domain, with no store/runtime or execution callbacks. Compare them against actual admitted prompts and descriptors, including all methods and optional save. Keep numeric preview withheld until the same prospective identity is handed to actual submission and every original admission/freshness boundary is preserved; an arbitrary equal-length ID does not prove request identity.

### A Command Can See Its Own Controller As An Active Turn
- **Symptom**: A composed workflow passes direct handler tests but real terminal Enter refuses it as busy.
- **Root Cause**: The shared current-controller accessor includes local command controllers; composition runs inside that owner, so a nonnull check mistakes its own operation for unrelated work.
- **Rule**: Admit the current command only when both the controller and supplied signal match its actual owner, check cancellation first, and retain rejection for other commands/model turns. Test through the real command runtime, then verify terminal submission and persisted outcomes. A fullscreen reply prefix can scroll away, and a settled turn can temporarily withdraw its estimate; combine persistence and terminal readiness instead of requiring an immediately numeric gauge.

### An Unconfigured Model Still Has A Specific Catalogue Owner
- **Symptom**: Browsing a relay without credentials shows the context or capability of a same-name official model, or loses declarations already present in its own catalogue.
- **Root Cause**: Blocked request resolution omits the address, and a runtime-only metadata lookup falls back to the canonical provider; a displayed endpoint label cannot restore request identity.
- **Rule**: Resolve display metadata using the selected connection's saved address or the listed provider address, preserve same-address ambiguity, and use only the listed declaration when its address is not configured. Share the capability policy with existing consumers, keep missing data unverified, and verify list/detail/return with same-name models having different limits. This does not authorize activation or establish remote capability.

### Optional Environment Inputs Must Be Absent In Older Vitest Fixtures
- **Symptom**: All settings saves reach disk but configuration publication rejects them, leaving requested/effective values unchanged.
- **Root Cause**: The installed Vitest stringifies `vi.stubEnv(name, undefined)` into the environment value `undefined`; optional numeric inputs then fail configuration validation.
- **Rule**: Register the original environment value with a temporary string, then delete the optional input explicitly and restore with `unstubAllEnvs`. Assert initial configuration validity/admission before exercising saves; classify fixture environment rejection separately from product focus or persistence failures.

### Failed Draft Refresh Can Recapture A Different Save Owner
- **Symptom**: A staged setting is refused after a session or workspace change, but a second Apply saves it; confirming an already-open scope chooser can do the same. A legacy user file stays writable after a preferred file appears.
- **Root Cause**: Retrying through the ambient host captures a new binding and discards the draft's original ownership. Checking only project source selection leaves the user legacy/preferred selector unfenced.
- **Rule**: Refresh retries and scope choices through the original draft, checking its binding, substrate, physical profile and selected user/project source before recapture, inside the existing write lock and before publication. Preserve explicit retry for same-source conflicts, retaining comments and siblings. Cancel or unreadable scope keeps pending and its original scope; a successful scope confirmation discards pending. Report a confirmed write separately from unconfirmed application after a binding change.

### ISO Timestamp Text Is Not A Recency Order
- **Symptom**: Resume defaults to an older session when records use different timezone offsets or fractional seconds, even though each timestamp is valid ISO text.
- **Root Cause**: Lexicographic comparison orders the encoded date and time text, not the represented instant; offsets and fractional precision can reverse the visible date order.
- **Rule**: Compare validated session timestamps by parsed epoch time, with a stable identity tie-break for equal instants. Keep pinned state in presentation ordering and let untouched default focus follow actual recency; reset automatic focus only through an explicit search or scope lifecycle.

### Shortcut Grammars Must Not Leak Owner Action Aliases
- **Symptom**: A top-level authentication shortcut offers no provider or saved-connection completion, or treats an owner action alias such as `remove` as an argument.
- **Root Cause**: The shortcut prepends an action to the full command runtime but projects no shortcut-specific grammar; copying the whole action also carries aliases that are not valid at the shortcut's outer position.
- **Rule**: Derive shortcut hints and argument completions from the owning command action, strip outer-position action aliases, and keep execution delegated to the same owner. Test valid provider/flag positions, saved-connection completion, and invalid leaked aliases separately.

### Read-Only Settings Entries Must Delegate Through Drafts
- **Symptom**: A settings category is missing even though the product has a real status command, or adding it creates a fake editable field or eagerly performs owner I/O.
- **Root Cause**: Settings rows and configuration fields were treated as the same kind of capability, conflating discoverability with writable schema ownership.
- **Rule**: Expose a read-only capability as a searchable, categorized row that returns the canonical command draft and performs no owner read or write until submission. Do not create config keys merely to fill a reference category.

### Snapshot-Producing Commands Are Drivers, Not Modifiers
- **Symptom**: A review command in composed prose loses the user's question or skill instructions, or runs beside another workflow that also claims the task.
- **Root Cause**: The command reads repository state and creates the final model prompt, so treating it as a pure text modifier bypasses evidence collection or permits two owners.
- **Rule**: Declare state-reading prompt builders as one driver that consumes the shared prose, modifiers and skills into its native prompt. Keep its standalone route unchanged, share aliases, and reject a second driver before either handler runs.

### Named Template Discovery Must Preserve Directory Freshness
- **Symptom**: A preview of a body path reads every template body, or a newly added higher-priority template does not invalidate the old estimate.
- **Root Cause**: A full registry walk reads unrelated templates, while an exact-name probe that does not track the containing directory can miss later template discovery or collisions. An `AbortSignal` checked only by an async wrapper cannot interrupt synchronous directory/file work.
- **Rule**: Derive exact template candidates from source tokens, probe only those names without enumerating unrelated entries, and track each candidate root revision. Bound candidate count and raw bytes, and check cancellation between synchronous steps; do not claim an in-flight synchronous read was interrupted.

### Flagless Composition Methods Must Preserve Dash-Prefixed Prose
- **Symptom**: A composed review or prompt template silently drops literal text such as `--keep-this`, while the standalone command preserves it.
- **Root Cause**: The composition planner consumed every following `-` token as a method option before checking whether that method declared an option grammar; the driver later discarded those unowned arguments.
- **Rule**: Enter option parsing only when the method declares flags. Keep dash-prefixed prose in the shared source for flagless drivers/modifiers, while retaining strict rejection of unknown options for methods that do declare flags. Test both a flagless driver and a flagless composable template, plus the strict-flag negative case.

### Completion Lookup Must Not Expand Into Whole-Template Discovery
- **Symptom**: Body-path completion or a leading custom composable template rereads every template body; an oversized same-name template can also hide a built-in or release an extension name.
- **Root Cause**: A single command lookup and a prefix suggestion both constructed the full command registry. Candidate caps applied after collection, and skipping an over-budget higher-priority file could leave lower-priority metadata that dispatch would never use.
- **Rule**: Resolve built-in/catalog/extension ownership before templates. For one invocation, probe only its exact template name; for a prefix, stream directory entries with name, entry, per-file, and total-byte limits and check cancellation between entries. Discover and resolve from highest to lowest priority, shadow lower metadata when the highest file is over budget, and use strict exact lookup during extension collision registration. Test custom composable and unknown names, entry caps, duplicate precedence, budget shadowing, built-in priority, and extension ownership; do not claim an in-flight synchronous read is interruptible.

### Slash-Looking Paths Need A Command-First Fallback
- **Symptom**: At source offset zero, a real file or directory such as `/home` loses its path candidate when a command or alias has the same spelling; accepting a single-component file can then execute or reject it as a slash command.
- **Root Cause**: Command discovery and path discovery inferred semantics from the same leading `/`. A syntactic command match is not proof that an existing path should be hidden, and a path string is not proof that Enter should stop being a command gesture.
- **Rule**: Probe only the exact target for a real file or directory, without directory enumeration. Merge commands before paths for an existing target, keep aliases hidden from discovery but include them in collision checks, and treat exact command/alias Enter separately from Tab path acceptance. Quote single-component absolute files so the accepted path cannot be reparsed as a slash command; preserve slash-delimited files and trailing `/` directories. Test command-only absence, same-name file/alias, prefix-only collision, ordering, and acceptance through the real parser and keymap.

### Context Selection Identity Must Follow The Effective Projection
- **Symptom**: `/shake apply` or `restore` changes which messages are sent, but the status band and `/context` keep showing the previous provider measurement; an empty or stale selection can also invalidate a valid estimate.
- **Root Cause**: Raw `contextSelection` entries and their revision are not the model projection. Stale hashes and non-effectual modes are ignored by `selectModelContext`, and a no-op apply can advance a revision without changing any message.
- **Rule**: Derive measurement identity from hash-valid entries that actually change the projected message. Invalidate only after a real apply/restore, leave no-op and already-empty operations unchanged without consuming admission, and keep empty/stale selections out of the interactive estimate identity. Test apply, restore, stale/empty selection, and no-op behavior with the real command owner; do not treat a revision bump as context content.

### Assembled Request Estimates Must Retain Provenance Without Raw Content
- **Symptom**: `/context` can show request bytes and provider usage but no distinct local count for the actual assembled request, or a report can mistake a full inspection-catalogue estimate for that request.
- **Root Cause**: The request body is discarded after capture while protocol ownership, image placeholders and fixed image allowances live only in the wire estimator; a raw-body character division or retained payload would be either wrong or unsafe.
- **Rule**: Compute the local request estimate at the same capture point as the request bytes, retain only frozen numeric metadata, require valid protocol field ownership, and record image count plus fixed allowance separately. Withhold the estimate for opaque reasoning or incompatible ownership, rethrow unexpected estimator failures, and keep provider usage, assembled-request estimate and inspection-catalogue estimate as distinct report facts.

### Review Previews Must Reuse The Native Git Prompt Without Dispatch Authority
- **Symptom**: A valid dirty-worktree `/review` remains unknown in the context gauge, while naively invoking its handler could enter the generic Git command path and perform a write.
- **Root Cause**: Review is a state-reading workflow driver rather than a pure prompt template. The preview gate admitted only deep research, and the actual review request is forced into plan mode by its `git-review` prompt metadata.
- **Rule**: Admit review explicitly for both standalone and composed inputs, share its focus preparation with dispatch, obtain the prompt from the existing Git workbench snapshot/review methods, and never call the generic `gitCommand`, `runReviewCommand`, or `execute` path. Use the same plan-mode identity as dispatch, propagate cancellation through Git reads, and revalidate the full snapshot fingerprint before publishing an estimate. Treat clean/unreadable trees, a missing workbench, a second driver, and cancellation as unknown rather than fabricating a prompt.

### Preview Snapshots Need One-Use Binding, Disposal And Final Revalidation
- **Symptom**: A review estimate is computed from one Git snapshot, then dispatch silently uses a newer worktree; or an old preview remains consumable after session/configuration changes.
- **Root Cause**: A fingerprint alone does not bind a preview to its live session, configuration, context selection, prompt sources and image attachments, and diff collection can race with worktree mutation. Timer cleanup can also erase the evidence needed to refuse an expired preview.
- **Rule**: Keep the reservation in the Git workbench as an opaque one-use slot. Bind it with a canonical digest of effective session/config/workspace/history/attachment identity, publish only after full preview verification, consume only on the same focus before expiry, and reject binding or fingerprint changes rather than silently refreshing. Carry the full preview guard into consumption, dispose invalidated or timed-out previews immediately, preserve an expired tombstone until successful replacement publication or same-focus consumption, restore the exact standalone slash draft on preparation failure, and recheck the fingerprint after staged/unstaged diff collection. Avoid type-only imports from command contracts into session runtime; the repository cycle gate and NormProof classify that graph differently.

### Preview Reservations Must Revalidate Raw Source Bytes
- **Symptom**: A research estimate is computed from an attachment, memory, instruction or template, but the run starts from changed bytes while the old estimate still appears applicable.
- **Root Cause**: The preview captured a complete content verifier, but the research reservation consumed only request/session/configuration/history/attachment metadata; dispatch could create a fresh run without awaiting raw-byte, injection or image verification, and standalone work had no parent command signal.
- **Rule**: Retain the detached request, image digest and full preview verifier in the one-use research reservation. Consume the entry before awaiting verification, use the command signal (or the session command owner when standalone has none), recheck live context, attachments and reservation state afterward, and leave a stale tombstone until a successful replacement preview. Reject expiry/change/cancellation instead of falling through to a fresh run, and restore `retryDraft` on pre-submission refusal. Do not write run state or ledger entries until admission completes.

### Auth Returns Must Replay Admission, Not Only Identity
- **Symptom**: A cancelled or admission-revoked model sign-in still reopens the model picker when the session, workspace and profile identity happen to remain unchanged.
- **Root Cause**: Post-await validation used `owner.isCurrent()`, which compares identity and roots but does not replay the original admission callback or cancellation signal.
- **Rule**: After every awaited authentication or connection operation, call the original `owner.check()` before returning a continuation. On refusal, retain the safe outcome note without a `next`; success/failure paths may return, while a real host cancellation must leave no active picker and must not reopen the model list. Test deferred sign-in with changed admission and an aborted original signal in both account and key routes.

### Review Invalidation Must Outlive The Failed Replacement
- **Symptom**: After a changed review focus, failed replacement preview, verification failure or automatic controller retirement, `/review` can take a fresh Git snapshot instead of refusing; an older async verification can also publish a reserved prompt after a replacement reservation exists.
- **Root Cause**: Expiry evidence was keyed to one focus and admission had no epoch across the asynchronous content check and diff construction. Automatic retirement also reused explicit disposal, which erased the stale marker.
- **Rule**: Keep review invalidation global to the workbench until a successful replacement review or verified non-review preview. Bind each take to an epoch and recheck it after source verification and prompt/diff construction; keep explicit disposal separate so only an intentional discard clears the slot. Test changed focus, failed replacement review, replacement publication during old verification, and controller automatic versus explicit cleanup.

### Submission Suspension Must Not Look Like Source Drift
- **Symptom**: A user submits a previewed `/review`, but the context controller's busy-state polling invalidates the reservation before dispatch consumes it; a suspended verifier can also report its aborted check as a source change.
- **Root Cause**: Busy identity was treated as a normal automatic identity change, and aborting a pending verifier did not distinguish controller suspension from a real source failure. A reservation take was also cleared before diff and final checks completed.
- **Rule**: Suspend the context controller before setting busy and resume it in the turn's `finally`. Let suspension mark/abort in-flight checks without owner invalidation, but keep real source failures reportable. Retain the review lease through prompt/diff and final checks, and settle it by epoch on every success or failure path.

### Prose Path Guards Must Branch Before Command Discovery
- **Symptom**: A quoted UNC path gets no prose completion, a directory candidate rereads a prefix-matched template body, or accepting a command-colliding file later composes it as a slash command.
- **Root Cause**: Quoted and unquoted values were checked by separate raw-prefix and decoded-value predicates; collision lookup ran for every slash-prefixed candidate before candidate role was known; source-offset behavior covered only offset zero.
- **Rule**: Strip an outer quote once, then apply one path predicate that includes drive and UNC forms. Filter code, non-Windows escapes and hierarchical URLs before requesting a path catalog. At nonzero source offsets, quote exact command/skill-colliding files, but short-circuit directories before exact command or template discovery. Test the unquoted command composition and the accepted quoted literal separately.

### Quoted Spans Need Authority After A Token Prefix
- **Symptom**: `focus="literal /review text"` executes the embedded `/review`, `--focus'literal /skill:a text'` injects skill `a`, or completion after `path="..."` loses its prefix or suffix.
- **Root Cause**: A literal boolean is not enough. The parser must retain where the quote starts, where it ends and whether it is closed; prose completion otherwise replaces the whole whitespace token. Single quotes also need closure and competing-apostrophe checks so contractions and leading elisions are not mistaken for shells.
- **Rule**: Store the active quote range on the prompt token, consume quoted whitespace as one literal span, and let path completion replace only that range while preserving prefix/suffix. Admit token-leading singles only when closed, allow non-word or pure-option-name prefixes only with a real close, and reject a candidate whose inner apostrophe claims the same close. Prefer double quotes when a completed path contains an apostrophe. Test ASCII/Unicode/space-leading option quotes, `O'Brien`, possessives, `'Twas` followed by another quoted word, unfinished quotes, prefixed paths and suffix preservation.

### Context Measurements Need History And Relay Identity
- **Symptom**: `/context` or compaction displays/reuses a provider measurement from another conversation or relay that shares provider, model and protocol.
- **Root Cause**: The live prompt identity supplied only schema/system digests, and compaction omitted the measured history prefix; `measuredPromptContext` can reject only identity fields both the record and caller can supply.
- **Rule**: Forward live `historyDigest` and derive `endpointId` from the resolved base URL. Treat every recorded protocol/endpoint/history/relay field as unusable when the caller cannot prove the same live field. In compaction, derive the prefix digest from recorded `promptMessageCount` before querying, then append an estimate only for messages after that prefix. Keep legacy identity-free records on the explicit compatibility path and test `/context`, status rendering, compaction append and relay/history mismatches separately.

### Model Rows Must Bind Display To The Exact Resolved Target
- **Symptom**: A model row looks ready and actionable, but Enter closes the picker and the selection owner rejects a different resolved model/endpoint; returning from details after deletion silently focuses the first row, or both canonical and relay categories mark the same connection active.
- **Root Cause**: Row readiness checked credential and availability facts without replaying the exact target admission, a fresh detail-return picker had no previous visible rows for `OptionModel` replacement, and active identity compared runtime fields without catalogue-category identity.
- **Rule**: Run the existing `exactTargetMatches` owner for every actionable row and keep mismatches disabled/focusable. Carry the previous category projection into detail-return fallback and use the exact-ID neighbour rule with a notice. Preserve canonical and relay rows as browse aliases when intentional, but mark only the exact catalogue category active; label the other `alias`. Include exact blocked-current metadata, distinguish filtered-empty text, and baseline subscription watching from the revision captured by the initial load.

### Display-Only Commands Must Publish Through The Accepted Display State
- **Symptom**: `/statusline use cost` writes the preference file but leaves the current band unchanged while claiming it will update on the next frame; `/theme` also looks persistent even though its command changes only the current session.
- **Root Cause**: The command wrote the display preference directly, while the interactive surface reads accepted `configuration.current.config`; status items are restart-applied and are not corrected by an ordinary configuration refresh. Command output therefore described an application path that had no owner.
- **Rule**: Keep the preference writer as the durable owner, then call a host-provided display application port after the write. Bind that port to `ConfigState.recordDisplay` in the interactive route and only claim live application when it succeeds; without the port, report the saved file and fresh-shell behavior. Keep `/theme` explicitly session-only and point lasting persistence to `/settings Appearance`. Test the routed command against the accepted configuration, not just the file bytes.

### Explicit Skill Tokens Also Need A Path-Collision Completion Lane
- **Symptom**: An absolute file named `/skill:review` cannot be completed even when quoted, while raw `/skill:rev` offers only installed skills; an exact skill token can also lose Enter to a same-name path candidate.
- **Root Cause**: `/skill:` was treated as a skill-only namespace before the generic slash-looking path analysis ran, and keymap completeness recognized slash commands but not explicit skill invocations.
- **Rule**: Load path and skill candidates together for `/skill:` tokens, retain quoted `/skill:` values as paths, and quote accepted files so they stay literal. Keep Enter command-first for an exact `/skill:<name>` token and Tab as the explicit path gesture. Test path and skill candidates, quoted completion, and both acceptance gestures.

### Async Model Refreshes Must Revalidate Before Publishing
- **Symptom**: An open model inspector briefly displays a superseded catalogue after its refresh finishes, or publishes rows while the accepted publication is unreadable.
- **Root Cause**: The watcher captures a revision before awaiting its loader but checks only whether the owner is still open afterward.
- **Rule**: Re-read the accepted revision immediately before publication and discard results whose revision changed. Treat a failed final read as a refresh failure, retain the prior observed revision for retry, and keep the pending slot until the old operation settles. Test deferred revision changes, unreadable final publication, recovery and actual inspector drawing.

### Failed Model Refreshes Need Read-Only Cache And Same-Revision Recovery
- **Symptom**: Cached model rows still look actionable after a revision or reload failure, and recovery to the same accepted revision never refreshes the owner.
- **Root Cause**: The root browser omits the watcher's failure callback, and revision equality skips revalidation even after a failed read. Disabled Enter also hands off to inspection rather than suppressing the host callback.
- **Rule**: Publish an explicit failure with cached rows disabled but focusable, mark their facts unverified and guard both selection and inspection. Retry after failed revision reads even if the recovered revision is unchanged; clear the failure only after successful revalidation. Preserve focus and test the actual Enter inspection handoff plus unchanged configuration/session bytes. Initial failed loads must not offer previously unconstructed children.

### Active Forms Need A Row Before The Held Composer Takes The Budget
- **Symptom**: A short terminal displays only the main prompt while keystrokes still edit an invisible settings child.
- **Root Cause**: The form keeps its caret within its supplied budget, but the surface allocates that entire budget to the held composer, suggestions and hints first.
- **Rule**: Project active child input from the real overlay host and reserve one row before allocating other chrome. Keep the held draft intact and remove its pointer geometry while it has no painted rows. Test the actual host and configuration owner through shrink/grow, cancellation, Apply and readback; an isolated InputForm render cannot prove this allocation.

### Filtered Vitest JSON Totals Can Count Unselected Tests As Passed
- **Symptom**: A filtered reversal reports eight expected failures but its JSON totals also claim 158 passes, even though only the eight selected cases ran.
- **Root Cause**: The installed Vitest 0.34 JSON reporter counts filtered tests differently from the default reporter; numPassedTests is not an executed-case count under -t.
- **Rule**: Match reversal failures by assertion name and expected failure groups. Use the default reporter's selected/skipped counts for execution claims, and never promote filtered-out tests to passing evidence.

### Focus Policy Reversals Must Separate Automatic Choice From Missing-Target Fallback
- **Symptom**: Removing one default-selection callback breaks both untouched focus and the recovery of a missing manual target, obscuring which invariant a regression covers.
- **Root Cause**: The same policy supplies the ongoing automatic preference and the fallback when a retained ID disappears.
- **Rule**: Reverse the automatic-preference branch, manual-intent capture and missing-ID fallback separately. Keep a surviving older pinned row in the fixture so an accidental first-row fallback cannot pass as newest-session recovery.

### Prompt Freshness Must Separate Content From Cursor Revisions
- **Symptom**: Moving left then right makes a valid context estimate disappear or cancels its pending read even though the prospective request has not changed.
- **Root Cause**: The editor's textRevision getter returns the general snapshot revision, which intentionally advances on cursor motion to reject stale completion replacements.
- **Rule**: Keep a separate content epoch in the existing editor buffer and advance it for edits, coalesced typing, undo/redo and history replacement. Preserve the general snapshot revision and its cursor-sensitive replacement guard. Verify the actual startup-to-host path with delayed previews, expanded split pastes, cursor movement and resize; allow the stdin parser's combining-cluster hold to settle before asserting a lone typed character.

### Saving Credentials Must Not Implicitly Select Their Connection
- **Symptom**: Saving credentials from a model panel changes the request target before the user selects the model, even when the saved default fields remain unchanged.
- **Root Cause**: Ordinary login also activates its connection and replaces the provider mirror; the credential resolver and logout fallback can independently choose newly saved connections. Native renewal enrollment also assumes every authenticated slot owns the provider mirror.
- **Rule**: Pass an explicit save-only policy through the existing connection writer. Mark those slots ineligible for automatic selection while retaining explicit connection/session/pool selection and legacy fallback. Grant native renewal only after verifying the exact named slot, credential and storage owner; a save-only slot need not replace the mirror. Test empty, provider-profile and active-connection starting states, pending authentication, explicit selection, logout and later renewal separately.

### Structured Form Values Must Stay Literal Across Command Parsing
- **Symptom**: An otherwise valid masked key, model ID or connection label beginning with -- fails to save from the model panel.
- **Root Cause**: The host passes each value as a separate argv token, so strict option parsing interprets leading dashes as syntax rather than form data.
- **Rule**: Bind text values with the existing parser's --name=value form when forwarding structured input to a command owner. Preserve the strict grammar and safe diagnostics for typed commands. Verify exact stored and selected values, including embedded equals and known option names, through the actual host; observe long focused rows within their painted width and assert the full identity in persistence and runtime resolution.

### Quoted Path Insertions Must Decode Before Directory Continuation
- **Symptom**: The first Tab accepts a directory containing a quote or backslash, but the next Tab finds no children; a bare backtick in the accepted name also hides later skill tokens inside a code span.
- **Root Cause**: Prose completion reuses the escaped quote body as the filesystem value, while the shared insertion formatter does not require quotes for backticks. Unconditionally decoding Windows input would instead collapse raw UNC prefixes and separators before special characters.
- **Rule**: Read quoted paths through the existing argument scanner and quote backtick-containing insertions. Preserve raw drive/UNC separators and single-quoted Windows input; double-quoted generated drive/UNC escapes must decode exactly once. Verify directory→child→file acceptance, exact next query, caret inside the closing quote, prefixed quote ranges, unchanged suffixes and later skill tokens. Keep lexical Windows evidence distinct from native filesystem/terminal evidence.

### File References Must Respect Code And Filename Boundaries
- **Symptom**: An `@src` example inside code starts a workspace walk, filenames containing `@` lose their suggestions, and accepting a filename beginning with `@` produces an inert doubled sigil.
- **Root Cause**: The reference fallback ignores the shared prompt code spans and rejects any decoded filename sigil instead of the raw doubled prefix. The formatter also treats a leading filename sigil as ordinary unquoted data.
- **Rule**: Reject code through the existing source token owner before catalog discovery. Keep raw `@@` literal while allowing sigils inside an explicit reference, including quoted leading sigils. Quote accepted filenames beginning with `@` so reparsing preserves their reference identity. Test zero enumeration inside open/closed code, recovery after its real close, exact decoded filenames and untouched suffixes, plus actual host Tab with no submission or network request.

### Consumed Role Actions Need A Parent After Failed Writes
- **Symptom**: A failed role reset, model assignment or effort save closes the nested settings/model chain, even when the writer reports that nothing changed or that its outcome is unverified.
- **Root Cause**: Enter releases the overlay before applying. Role callbacks return a continuation only when `saved` is true, so failure leaves no parent and the host retires the picker lifecycle. Reconstructing the effort parent can also throw when the session becomes unreadable, replacing the original write evidence with a later read failure.
- **Rule**: After an attempted role write, return through the existing fresh parent with the exact writer notice. If the role transaction cannot be captured, fall back to the existing catalogue with that notice and no write authority. Preserve unverified outcomes, retire consumed role/effort callbacks and require an explicit action against a fresh baseline to retry. Cover unchanged, persisted-but-unverified and temporarily unreadable state, sibling roles/default retention, user/project scope, navigation/focus and held drafts through the actual host. Distinguish a released panel from a still-visible but retired form when diagnosing input failures.

### Authentication Results Must Survive Role Baseline Read Failures
- **Symptom**: A connection is saved from a role browser, but a session read failure closes the chain and replaces the authentication result with a later role error.
- **Root Cause**: Authentication and role assignment are separate transactions. The return callback eagerly prepares a new role transaction before returning the saved connection's result; that preparation can throw after authentication has already finished.
- **Rule**: Keep authentication admission and cancellation checks, then guard the fresh role preparation at its owning return boundary. If it cannot be captured, return to the existing role catalogue with the original safe result and publication notice. Keep model selection read-only until a new explicit action can capture current state. Never reinterpret that read failure as an authentication failure, reactivate the old role callback, or retry the credential write. Test both key and account routes through the actual host, including unverified publication and later explicit assignment with unchanged default and sibling roles.

### Initial List Text Must Round Trip Through Its Editor Parser
- **Symptom**: Opening a stored list, pressing Enter without editing, then applying changes quoted names, splits embedded newlines or trims stored whitespace; an allowlist can start offering a real tool as a result.
- **Root Cause**: The list editor joins raw string items with newlines, while its existing parser also accepts outer quotes and JSON arrays and trims each line. Some valid stored arrays therefore cannot be represented by those raw lines.
- **Rule**: Test the proposed initial text through the actual parser and compare the full value with the original. Keep readable lines when they round trip; otherwise use the existing JSON array representation. Preserve parsing and validation contracts, scope, sibling fields and comments. Verify untouched Enter, explicit Apply, reopening and actual tool visibility. Match stored-field markers in host tests and wait for save completion before reopening, using current action rows rather than titles that may also appear in the transcript.

### Rejected Detail Refreshes Still Need Host Ownership And A Parent
- **Symptom**: Enter on a model detail action closes the settings/model chain when its catalogue recheck throws; the same rejected promise can also produce a notice after the accepted host was closed or replaced.
- **Root Cause**: The overlay releases its page before applying. The refresh catch returns only a note and skips the ownership checks used after successful asynchronous completion.
- **Rule**: Recheck the accepted host on rejection, retire the consumed detail and return through its existing parent with the safe failure notice. Reopen against fresh catalogue state and require another explicit action to enter configuration. Test actual Enter, both top-level and nested entrypoints, held drafts and late rejection after close/replacement. Keep long model identities out of painted-row equality assertions unless their full width is available.

### An Unfinished Path Quote Must Own Its Whitespace
- **Symptom**: A manually opened single-quoted path stops completing after a space, and a later skill or method marker inside that path can enter preparation.
- **Root Cause**: Leading single quotes require a closing quote to avoid confusing prose apostrophes with literal spans. The scanner therefore splits an unfinished quoted path before completion and submission inspect it.
- **Rule**: Recognize explicit absolute, home, relative, drive and UNC path prefixes as an open single-quote span in the shared source tokenizer. Preserve ordinary apostrophe rules and restore invocation parsing only after a real close. Verify real directory Tab continuation, zero method callbacks while quoted, and both skill bodies after closing; keep Windows lexical evidence separate from native filesystem evidence.

### A Quoted Option Value Does Not Quote Its Unquoted Flag Prefix
- **Symptom**: Composed research silently uses default mode/depth or loses its brief path when an option uses --name="value"; unknown or repeated quoted options can bypass validation as prose.
- **Root Cause**: The composition planner treats any token containing a quote as wholly literal and forwards admitted option tokens without decoding their values.
- **Rule**: Within the declared method option lane, distinguish an unquoted dash prefix from a fully quoted, escaped or code token. Decode admitted options with the existing argument scanner before strict syntax validation, keep internal markers literal and reject unfinished option quotes before request preparation or state creation. Check preview/submission identity, durable research options, both real host Enter routes and exact retry drafts. Host fixtures exercising cancellable drivers must use the actual session command-controller accessor; choose constructor-captured screen mode before construction and assert the actual screen escape sequence.

### File Reference Ranges Must Follow Prose Apostrophe Rules
- **Symptom**: An earlier contraction or possessive hides a later file reference; Tab in an apostrophe-containing filename can delete the text after that reference.
- **Root Cause**: File-reference discovery and replacement reuse the whole-draft command argument scanner, which interprets ordinary prose apostrophes as shell quotes. Guarding only code spans leaves the wrong replacement range intact.
- **Rule**: Derive the reference range and raw prefix from the shared prompt token owner, and use that same token for catalogue discovery and replacement. Decode the isolated prefix only when the source token has a quote or escape; preserve ordinary filename apostrophes. Verify exact edits, Unicode suffixes, later skill tokens, one real workspace enumeration and zero submission/network calls through both actual host modes.

### Plain Path Values Must Retain The Source Token's Literal Classification
- **Symptom**: Manually typing a path through an apostrophe-containing filename yields no candidates even though the source range is correct; generated quoted paths still work.
- **Root Cause**: Prose completion decodes every non-Windows prefix with the command argument scanner. The source tokenizer treats the filename apostrophe as ordinary text, but the second parser removes it as a shell quote.
- **Rule**: Preserve plain source path values and decode only actual quoted syntax, retaining the existing raw Windows separator policy. Verify absolute/home/relative/parent paths through directory→child→file acceptance, exact suffixes and both host modes. Native PTY probes need an independent workspace, final accepted screen mode after ready, and readiness checks that respect clipped menu labels; an empty session need not have a transcript.

### Lost Detail Ownership Must Retire The Action, Not Only Its Result
- **Symptom**: A final model-detail admission read throws after refresh succeeds and closes the settings/model chain; a refusal can also escape after its callback closes the host, and the old detail can be retried directly.
- **Root Cause**: Only refresh has an exception boundary, refusals return before the final ownership check, and a false acceptance guard discards one result without retiring the detail's offered actions.
- **Rule**: Guard final admission reads at the detail owner and return through its existing parent with a safe notice while ownership remains valid. Recheck ownership before publishing any refusal and permanently retire the detail when acceptance is lost, including before a delayed action starts. Verify exception/refusal callbacks that close or replace the actual host, direct old-action retries and late loads, plus both model/settings entrypoints with unchanged configuration/session state.

### Refused Choices Need A Separate Browser Return Check
- **Symptom**: A configuration edit makes an accepted model-detail action expire, and its refusal closes the model/settings chain; automatically returning every refusal would instead reopen cancelled or replaced ownership.
- **Root Cause**: Choice admission combines mutable target inputs with browser identity, while Enter already releases the visible page. A note alone does not retain navigation, and retrying the old object does not acquire a new baseline.
- **Rule**: Retire the consumed detail on every refusal. Let the catalogue owner separately verify the original browser's signal and admission before returning through its existing fresh parent; preserve the original refusal if return verification fails or throws. Recheck host ownership after that callback and require a new explicit action for retry. Test actual disk edits, cancelled/changed owners, callback-driven host replacement and both screen modes without adopting ordinary file settings implicitly.

### A Fresh Role Browser Must Renew Its Assignment Transaction
- **Symptom**: A refused model detail returns to current role candidates, but a new explicit model choice still expires or retains the role's old thinking effort.
- **Root Cause**: Rebuilding catalogue rows reuses the entering role's assign closure and effort; the refreshed list and the guarded writer therefore describe different baselines.
- **Rule**: At the existing detail/authentication return boundary, prepare the role transaction again through its original owner and take the current role effort with it. Do not renew authority in an old callback or on background list refresh. If preparation fails, return to the role catalogue with the original notice and require explicit reopening after state recovers. Keep ordinary configuration pinned through navigation; a later explicit role save still invokes the existing configuration publication contract.

### Accepted Role Menus Must Recheck Host Ownership Around Admission
- **Symptom**: A role menu or effort refusal closes the settings chain; an admission callback can also close or replace the already released host before an old action publishes a result or invokes its child/writer.
- **Root Cause**: Local preview retirement observes visible dismissal, but Enter has already released the visible picker. Refusal returns skip consumption and the accepted host generation is never checked.
- **Rule**: Opt these owners into accepted host checks before the action, after choice admission and after browser-return admission. Permanently retire on refusal or lost ownership; return through the existing parent only when the original browser is still admitted. Test released-host callback effects, delayed action starts, direct retries and late loads, plus actual settings navigation with an external configuration edit and an explicit fresh save.

### Error Recovery Must Revalidate The Original Browser Too
- **Symptom**: A model detail refresh or final admission read fails while the workspace becomes unavailable, and error recovery reopens its old model/settings chain. A return check that closes or replaces the accepted host can also publish an obsolete failure.
- **Root Cause**: Exception catches verify only accepted-host ownership and bypass the browser-return admission used for ordinary refusals. Host generation alone does not establish session/workspace admission.
- **Rule**: Route refresh errors, admission errors and ordinary refusals through the detail owner's same guarded return. Recheck host ownership before and after browser admission; retire the consumed detail and preserve the safe notice, but construct its parent only with verified browser admission. Missing or throwing return checks cannot reopen navigation. Test actual host workspace revocation and fresh explicit reopening after the fixture restores availability.

### Prospective Effort Recovery Must Fence The Actual Writer
- **Symptom**: Expired effort recovery closes the settings/model chain, or a pre-switch hook closes its accepted host but the model still switches. A post-switch close can also reopen an obsolete parent.
- **Root Cause**: The prospective effort owner returns a bare refusal and lacks accepted-host checks; checking only before an asynchronous save does not fence the original transaction. Supplying an ownership callback directly in a test does not prove InteractiveMode forwards it.
- **Rule**: Retire refused or revoked actions, return with a notice through the existing fresh catalogue only when the original browser remains admitted, and pass accepted-host ownership into the original writer's admission. Recheck after admission and before returning. Preserve confirmed transaction notices after closure while suppressing the old parent. Test actual InteractiveMode hook closure/replacement as well as direct host acceptance, before-write rejection and after-write confirmed outcomes.

### Frozen State Can Break Older Vitest Failure Formatting
- **Symptom**: A negative state assertion becomes a failed suite with a read-only nested property error instead of reporting the changed state.
- **Root Cause**: Vitest 0.34's error formatter clones with forceWritable only at the top level; recursive cloning drops that option, and asymmetric-matcher replacement then assigns into frozen nested properties.
- **Rule**: For JSON persistence snapshots, compare their complete serialized values when exercising expected failures. Keep production freezing intact and require the reversal to produce the intended behavioral assertion failures; preserve formatter failures separately rather than counting them as successful reversals.


### A Reopenable Thinking Picker Still Needs Accepted Host Ownership
- **Symptom**: Direct close tests pass, but actual Enter releases the thinking page before a hook closes its host, and the original writer still commits. Refused or completed actions can also reopen an obsolete settings parent.
- **Root Cause**: Browser generations observe previewEnd/onOpen, while the released host requires the separate accepted-generation callback. A correct transaction admission is insufficient when it never receives that callback.
- **Rule**: Opt the picker into accepted ownership and carry it through the original writer admission. Recheck browser admission and host ownership before returning; consume each finished/refused action while allowing only explicit onOpen to acquire a new baseline. Preserve the original writer notice after ownership loss. Test actual InteractiveMode Enter and pre/post hooks, alongside same-instance reopening and delayed accepted actions.

### Filtered Vitest JSON Totals Can Count Unselected Tests As Passed
- **Symptom**: A filtered host run executes 10 tests, but Vitest0.34 JSON reports 215 passed, 4 failed and zero pending for a 219-test file.
- **Root Cause**: The reporter's top-level pass total includes tests whose individual assertion status is skipped.
- **Rule**: Derive executed passes, failures and unselected counts from assertionResults.status and cross-check the selected names. Keep skipped tests out of passing totals. Match reversal failures by the owning file and expected behavior, not by requiring an arbitrary word in every test name.


### Queue Controls Must Carry The Same Attachments And Literal Task Body
- **Symptom**: Ordinary busy submissions retain images, but /queue add or its shorthand silently loses them; task text also loses trailing whitespace before composition.
- **Root Cause**: SubmissionQueue already owns text plus attachments, while the command factory and queue adapter expose only text. The TUI control bridge trims the entire source before the existing literal-body parser sees it.
- **Rule**: Carry optional PromptAttachments through the existing queue factory and adapter into the same pending item, retaining the text-only call shape. Extract controls from raw source without trimming task endings. Test actual Enter while a foreground turn is held, then drain or explicitly retry after unknown skills, budget refusal and interruption; check both skill bodies, image order, source metadata, one delivery and the existing pipe/text controls.

### Queued Commands Can Reenter The Ordinary Router
- **Symptom**: Direct queue controls keep images, but a queued queue command loses them when it runs or restores a refused composition.
- **Root Cause**: The direct TUI control bridge forwards attachments, while the ordinary command router constructs the same queue factory without them. Later execution can reach that second entrypoint.
- **Rule**: Forward the submission's existing attachments through every call into the queue owner. Test the ordinary router and actual Enter with a queued queue command, including missing-skill and budget refusals followed by explicit retry; require complete text, image order and one eventual dispatch.

### Catalogue Refresh Must Not Renew Consumed Model Actions
- **Symptom**: A ready model or preset commits after its accepted host was closed or replaced during a switch hook; a consumed catalogue can also be called again after loading.
- **Root Cause**: Ordinary catalogue actions did not opt into accepted-host ownership. Enter released the visible page before hooks, so later host changes could not reach previewEnd. The catalogue loader also serves open detail refreshes, which have a different lifetime from activation authority.
- **Rule**: Keep action generations and pending/consumed state in the model owner separately from catalogue reads. Pass accepted ownership into each original ready-model/preset writer admission, recheck browser and host before constructing a parent, and retain confirmed writer notices. Only explicit reopening renews actions; old completion cannot retire that new generation. Test actual Enter plus opening a replacement settings panel while a hook waits, pre/post-write outcomes, direct old retries and detail publication controls.

### A Saved Model Choice Does Not Renew Its Browser's Return Admission
- **Symptom**: Prospective effort saves successfully, then PostModelSwitch revokes the workspace while the accepted host generation stays valid; completion still opens the old model/settings parent.
- **Root Cause**: Recovery checks browser admission only before refused saves and checks only host ownership after completed saves. Writer confirmation and permission to reopen the original browser are separate facts.
- **Rule**: Preserve the original save notice, but require affirmative browser admission and recheck accepted host ownership after that callback before constructing the parent. Missing or throwing guards cannot authorize a return. Check the browser's original context rather than the consumed choice baseline, and test revoked and valid returns through both real host entrypoints and screen modes. Resolve projected request targets through the credential resolver instead of asserting a top-level configuration model field.

### Preview Cleanup Can Revoke An Accepted Settings Apply
- **Symptom**: Ending a theme preview closes or replaces the already released host, yet Apply still saves. A revoked delayed action can also leave its original preview active if it returns before cleanup.
- **Root Cause**: Preview end calls the theme follower's refresh callback synchronously; retry reopening is another callback boundary. The save promise's result and the original panel's return authority are separate, even though the current save body runs synchronously.
- **Rule**: Pass accepted host ownership into the detail owner and recheck after preview cleanup and every retry-reopen outcome before invoking the original writer. Consume Apply before reopening or saving, end the original lease on revoked delayed starts, and preserve confirmed/refused save notices while suppressing stale navigation. Verify the actual host opt-in and both before-write cleanup and after-write completion separately.

### Escape Parent Returns Can Be Abandoned During Cleanup
- **Symptom**: Theme cleanup closes or replaces a host during Escape, but the old parent still opens. Suppressing that parent alone can leave the original cancellation controller live.
- **Root Cause**: Return preparation, preview cleanup, change notification and parent construction can reenter the host. The tracked child marks its controller as transferring before cleanup, assuming a parent will always receive it.
- **Rule**: Recheck the original picker/generation after preparation and require only the intended close transition before constructing and opening the parent. Let the existing previewBack port return cleanup for an abandoned transfer; compose it with original-controller abort, including callback exceptions. Keep successful parents live, replacements independent, and delete/rename/denial/approval Escape precedence intact.

### Test Source Changes Can Retire An Otherwise Identical Verified Build
- **Symptom**: A test-only commit passes focused validation, but the real launcher refuses the previous build as stale.
- **Root Cause**: `buildInputDigest` fingerprints all TypeScript sources under `src`, including test files, even when those files are absent from the compiler's emitted input graph. A new build can therefore have a different input/build identity and the same artifact digest.
- **Rule**: Check the verified build before native runtime probes. If test sources changed, rebuild serially under the memory limit when a fresh launcher is needed; preserve both identities and do not bypass freshness checks or misclassify preflight refusal as a product interaction failure. Test-only validation does not itself require a rebuild when no runtime launch follows.

### First-Request Previews Must Include The Started Step
- **Symptom**: With a one-step limit, the draft estimate includes tool schemas that the accepted request omits, and its schema identity cannot match that request.
- **Root Cause**: The preview compared the limit with zero, while the turn owner increments its count on turn_start before dispatch. The first request of a one-step run is already the closing request, including its final-answer instruction.
- **Rule**: Preview the actual first-step policy and reuse the existing closing-message projection. Compare complete serialized bodies, schema/system/history digests and local estimates through the real turn lifecycle at both one and two steps, including dynamic and full catalogues. Match sampling parameters in the fixture before classifying small numeric differences; retain provider aggregate usage as a separate measurement.
