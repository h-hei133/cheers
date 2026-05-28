# Risk Register

| Risk | Area | Impact | Mitigation | Validation |
|---|---|---|---|---|
| Session schema drift | `metadata.json`, `state.json`, public types | Old sessions fail to load or fields disappear. | Keep schema definitions compatibility-exported; avoid field renames; use codec characterization tests. | Directory substrate, workspace binding, corrupt file, terminal persistence tests. |
| Transcript loss or reorder | `transcript.jsonl` append/read | Replay and continuity lose truth source. | Extract transcript store without changing append order or decode behavior. | Replay plan, recovery snapshot, append-before-model-call barrier tests. |
| Replay parity drift | replay normalization and repair | Resume sends different messages or wrong continuation prompt. | Move replay behind facade; keep idempotent repair and sentinel behavior. | `sessionReplayBuilder.test.ts`, replay repair/idempotency cases. |
| Pending lifecycle truth drift | lifecycle read model | Pending approvals/tools may be compensated incorrectly. | Keep transcript-derived read model authoritative over stale state. | Pending lifecycle and direct-resolution dedupe tests. |
| False success upgrade | continuity/result adapter | `not-run`, `skipped`, `partial`, `not-proven`, `blocked`, or `stopped` could become success-like. | Preserve current terminal-source rule and result truth adapter tests. | Result contract and Route221 anti-false-success gate if touched. |
| Redaction weakening | continuity/presentation facts | Secrets or real-provider paths leak through session surfaces. | Preserve compact/redaction functions and add redaction assertions when presentation moves. | Session presentation tests, CLI surface tests if touched. |
| Approval memory becomes authority | approval memory | Historical approval facts could authorize future writes/commands. | Keep approval memory as evidence/facts only; write/command policy remains outside session manager. | Approval memory tests plus permission/write-gate tests if facts feed policy. |
| Request-scope corruption | permission/request-scope memory | Follow-up prompts attach wrong scope or cache key. | Keep project-root normalization and lineage fields intact. | Legacy permission normalization tests. |
| Project-root rebase corruption | workspace binding and legacy memory | Old rooted paths point to wrong workspace. | Split metadata rebind from continuity rebase with old-session fixtures. | Rebind project root and legacy-root residue tests. |
| Long-session continuity loss | compact retention | Compaction drops handoff, approval, repair, or mutation facts. | Move retention threshold and compact logic as a unit. | Long-session durability and auto-compact tests. |
| CLI/session presentation drift | reentry summaries and surfaces | User-visible session status changes without intent. | Extract presentation projection without string changes unless route owns it. | CLI/session surface and startup surface tests if touched. |
| Recovery eligibility drift | trust-boundary logic | Corrupt or indeterminate sessions may become resumable; good interrupted sessions may be blocked. | Keep eligibility classifier in recovery owner with fixture coverage. | Recovery eligibility and shell recovery tests. |
| Import cycles | moving types out of `SessionManager.ts` | New session modules could keep importing facade, creating cycles. | Move schema/types first; make owner modules import schema, not manager. | Import scan for `from "./SessionManager.js"` in session modules. |
| Over-broad route | combining schema, replay, continuity, approval, presentation | Failures are hard to classify and compatibility is weak. | Follow grouped route order; stop on schema or truth boundary changes. | Focused gates per route before broader tests. |
| Console warning behavior drift | `listSessions` unreadable dirs | CLI output becomes noisy or silent. | Keep warning suppression as explicit presentation/store policy. | Unreadable session directory warning test. |
| Atomic write or lock regression | store extraction | State may tear under concurrent writes. | Move locking and atomic write as one unit with tests. | State persistence and pending lifecycle tests; build. |
| Live provider accidental use | validation | Credentials or provider paths may be exposed. | No live provider for these routes unless a future route explicitly opens it. | Command review; no provider gate. |

## Highest-Risk Areas

1. `buildContinuitySnapshot`: it combines result truth, evidence strings,
   approval memory, write continuity, repair state, verification state, and
   read-continuation facts. It must not be extracted as a generic helper.
2. Pending lifecycle reconciliation: it preserves direct-resolution truth and
   compensates only unresolved lifecycle events.
3. Runtime seed construction: it crosses session replay and runtime recovery.
4. Approval memory: it is useful continuity evidence but not authorization.
5. Legacy working-memory parsing: it is ugly but load-bearing for old sessions.

## Residual Risk After This Audit

This audit did not run tests or build because it did not change runtime code.
Future implementation routes must prove behavior with focused tests before
claiming equivalence.
