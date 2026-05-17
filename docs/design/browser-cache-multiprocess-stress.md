# Browser Cache Multiprocess Stress

Status: Route 110 implemented candidate.
Date: 2026-05-17

## Scope

Route 110 adds bounded real CLI child-process stress evidence for the explicit
sanitized browser receipt/action cache. It builds on Route 109 lock, recovery,
integrity, repair, retention, and compaction behavior without adding default
cache persistence, automatic replay, external network, dynamic skill discovery,
MCP launch, Playwright dependency, provider/model calls, package scripts,
SessionManager schema changes, or raw evidence persistence.

## Reference Scan Summary

Files inspected: OpenHands chat/event surfaces, Inspect AI scan compaction and
resume flow, mini-swe-agent trajectory save/inspector tests, Stagehand README,
Playwright MCP README, opencode persisted-cache utility, and Claude Code
keybinding watcher notes.

Implications:

- Durable evidence should be a replay/report artifact, not hidden runtime
  state.
- Invalid or corrupt trajectory/log files should be represented as safe
  failures or skipped counts.
- Compact/recovery flows should preserve enough index state to resume safely
  without raw content.
- Cache reuse must remain explicit and bounded; self-healing and external
  network execution are separate routes.
- Reports should summarize process status, lock state, integrity, and skipped
  counts rather than raw child-process output.

No implementation code was copied from reference repositories.

## Route 109 Baseline

Route 109 left the cache with:

- explicit cache root or manifest only
- JSONL records containing sanitized receipts/cache entries
- lock/lease files under the explicit cache root
- atomic same-directory temp-file plus rename writes
- recovery reads that skip corrupt/unsafe lines
- integrity status and concise cache surface
- compact and repair commands
- deterministic lock-file simulations

Route 110 adds real CLI child-process evidence around those primitives.

## Stress Goals

The minimum multi-process behaviors to prove before broader browser execution:

- concurrent execute-write processes can share one explicit cache root
- cache status and replay can run while another process holds a write-like lock
- compact blocks safely while a real child process holds a busy lock
- stale locks can be recovered by real CLI maintenance commands
- repair removes corrupt/unsafe lines and preserves valid records
- final cache integrity is not unsafe or corrupted after bounded stress
- reports remain redacted and concise

## Scenario Model

`browserCacheMultiprocessScenarioModel.ts` defines pure scenario/result types:
process steps, roles, timing metadata, lock summary, integrity summary,
assertion summary, and final stress status. It does not spawn processes.

Roles are writer, replayer, status-reader, compactor, repairer, and
lock-holder. Steps with the same group id run concurrently; groups run in
order.

## Fixtures And Runner

`browserCacheMultiprocessFixtures.ts` creates temp-only project, home, cache,
external runner manifest, runner script, CLI env, stale lock fixture, and
lock-holder child process specs. Fixtures use local/test runner scripts only.

`browserCacheMultiprocessRunner.ts` reuses the existing real CLI process
harness. It launches bounded child processes, supports concurrent groups,
collects exit/timing/output line counts, inspects cache integrity and lock
state after the run, and returns a structured stress result. A small startup
delay is used only for lock-holder groups so the child lock process can create
the lock before maintenance commands run.

## Timeout And Concurrency Budget

Route 110 focused scenarios use 2-4 child processes per concurrent group and
short per-process timeouts. The lock-holder path uses a bounded hold window and
then removes its lock. If future stress becomes flaky, reduce process count and
prefer deterministic lock timing over broad long-running stress.

## Integrity Assertions

Reusable stress assertions check:

- no raw secret/raw-content markers in process output
- no unsafe or corrupted final integrity
- no unexpected process timeout
- replayable records exist after execute-write stress
- corrupt/unsafe skipped counts return to zero after repair
- lock state is missing or safely reported after the run

## Report Model

`browserCacheMultiprocessReport.ts` renders a compact report with scenario id,
status, process counts, roles, exit summary, lock status, integrity status,
valid/active/replayable counts, skipped counts, duplicate/over-budget counts,
and fixed safety lines for explicit-only persistence, no raw evidence, no
automatic replay, and no provider/model calls.

The report never prints raw stdout/stderr, cache lines, runner output, secrets,
HTML, screenshots, OCR, or hidden reasoning.

## Scenario Coverage

Route 110 scenarios cover:

- concurrent real CLI execute-write processes against one cache root
- status and replay while a lock-holder child process simulates an in-flight
  write
- compact blocked by a busy lock held by a real child process
- stale lock recovery through real CLI repair
- repair after corrupt and unsafe cache lines
- final post-stress integrity checks

## Out Of Scope

Still out of scope until a dedicated route:

- external-network browser execution
- Stagehand-like self-healing
- dynamic skill discovery or runner registry
- MCP server launch
- Playwright package dependency
- provider/model calls
- persistent browser sessions
- package/default gate changes
- broader CLI lifecycle rewrite

## Route 111 Recommendation

Recommended Route 111: browser replay UX/report polish, because cache
hardening and bounded multi-process stress now have focused evidence.

Alternative Route 111 choices:

- browser action self-healing design, only if explicit local/test replay output
  remains stable enough
- external-network browser execution design, only after local persistent replay
  and multiprocess cache behavior remain stable
- deeper cache concurrency stress, only if broader process counts or platforms
  need additional evidence
