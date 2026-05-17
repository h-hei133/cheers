# Browser Persistent Cache Hardening

Status: Route 109 implemented candidate.
Date: 2026-05-17

## Scope

Route 109 hardens the explicit sanitized browser receipt/action cache from
Route 108. The cache remains non-default: it exists only when an explicit cache
root or manifest is supplied, and replay still requires an explicit
`/browser replay <receipt-id>` plus current runner, sandbox, allowlist,
confirmation, and runtime preflight.

This route does not add automatic replay, external network, dynamic skill
discovery, MCP launch, Playwright dependency, provider/model calls, persistent
browser sessions, SessionManager schema changes, package script changes, raw
browser evidence persistence, or raw corrupt record reporting.

## Reference Scan Summary

Files inspected: OpenHands frontend chat/event surfaces, Inspect AI
`src/inspect_ai/_eval/task/scan.py`, mini-swe-agent trajectory save and
inspector tests, Stagehand README, Playwright MCP README, opencode
`packages/app/src/utils/persist.ts`, and Claude Code keybinding watcher notes.

Patterns adapted:

- Inspect AI compacts recorded scan buffers into a resumable snapshot and
  keeps failed work resumable instead of pretending it completed.
- mini-swe-agent trajectory tooling treats invalid trajectory files as
  inspectable failures and keeps durable artifacts simple.
- Stagehand separates repeatable cached actions from live/self-healing
  execution; Route 109 keeps self-healing deferred.
- Playwright MCP documents that allowlists and filesystem options are not broad
  security shortcuts; Route 109 keeps cache records as evidence, not authority.
- opencode uses bounded cache budgets and explicit pruning; Route 109 applies a
  max-record budget without dropping tombstones needed for delete/invalidate
  safety.
- Claude Code watcher notes reinforce atomic write observation; Route 109 uses
  same-directory temp writes plus rename for cache file updates.

No implementation code was copied from reference repositories.

## Route 108 Baseline

Route 108 introduced a sanitized JSONL cache file under an explicit cache root.
It could write replay-ready receipts, read them in a later CLI process, append
invalidated/deleted tombstones, and render cache health. Its main gaps were
single-writer safety, atomic rewrite discipline, corruption recovery,
compaction, retention, and richer status/report summaries.

## Hardening Requirements

Minimum Route 109 requirements:

- one explicit cache root, no global lock or default cache path
- lock/lease guard for write, delete, invalidate, repair, and compact
- temp-file plus rename for cache file updates
- recovery reader that skips corrupt, unknown-version, invalid, and unsafe
  records without surfacing raw lines
- integrity scanner with safe counts, warnings, blockers, and next action
- compaction that keeps the latest record per receipt id and preserves
  tombstones that block deleted/invalidated replay
- retention that prefers replay-ready active records but never drops required
  tombstones solely to satisfy the budget
- CLI status/compact/repair output that remains concise and redacted
- sidebar and scenario reports that summarize cache health without raw content

## Lock And Atomic Write Model

`browserReceiptCacheLock.ts` stores a lock file under the explicit cache root.
Locks include a lock id, owner id, operation, creation time, and expiry time.
Busy locks block writes and maintenance. Stale locks can be replaced
deterministically. Release removes the lock only when the lock id still
matches.

`browserReceiptCacheRecovery.ts` owns the cache file path and atomic write
helper. Store mutations write a complete JSONL payload to a same-directory temp
file and then rename it into place. Write failures return blocked/warning
results instead of claiming cache success.

## Recovery And Integrity

`browserReceiptCacheRecovery.ts` reads JSONL line by line and preserves only
valid sanitized cache records. It counts invalid JSON, invalid records, unknown
versions, unsafe records, and total skipped records. Reports never include the
raw corrupt line or unsafe content.

`browserReceiptCacheIntegrity.ts` classifies cache status as `empty`,
`healthy`, `warning`, `corrupted`, or `unsafe`. It reports valid records,
tombstones, deleted/invalidated records, duplicate active records, stale replay
readiness, over-budget records, redaction violations, warnings, blockers, and
a safe next action.

## Compaction And Retention

`browserReceiptCacheCompaction.ts` plans compaction from recovered valid
records. It keeps the latest record for each receipt id, so a deleted or
invalidated tombstone remains authoritative over older active records. It then
applies retention.

`browserReceiptCacheRetention.ts` enforces `maxRecords` by keeping tombstones
first and keeping newest replay-ready active records before older inactive
records. If tombstones alone exceed the budget, they are kept and the report
warns that tombstones exceed the budget rather than resurrecting deleted
records.

`/browser replay cache repair` rewrites only recovered valid records and
removes corrupt/unsafe lines. `/browser replay cache compact` additionally
deduplicates and applies retention. Both require an explicit writable cache
context and lock.

## CLI And Report Surface

`/browser replay cache status` now includes integrity, lock status, unsafe
skips, duplicate active records, and over-budget counts. Compact and repair
commands report records before/after, records removed, tombstones kept,
explicit-only persistence, no raw evidence, and no automatic replay.

Sidebar command events and scenario reports summarize cache status, integrity,
and compaction counts through safe lines only. They do not persist or expose raw
cache records, corrupt lines, runner stdout/stderr, HTML, screenshots, OCR,
secrets, credentials, or hidden reasoning.

## Scenario Strategy

Route 109 focused tests cover:

- lock acquire, release, busy, and stale replacement
- healthy, corrupt, unsafe, duplicate, tombstone, and over-budget integrity
- repair that removes corrupt/unsafe records without leaking raw content
- compaction that removes duplicates and preserves tombstone semantics
- retention that does not resurrect deleted records
- cache status, compact, and repair command behavior
- replay refusal for unsafe/deleted records after compaction
- execute-write and cross-process replay after compaction
- sidebar/report summaries without raw unsafe content

## Route 110 Recommendation

Recommended Route 110: browser replay UX/report polish if the hardened cache
output is too verbose for routine use.

Alternative Route 110 choices:

- browser action self-healing design, only after cache/replay stability remains
  good under repeated local/test scenarios
- external-network browser execution design, only after local persistent replay
  remains stable
- deeper cache concurrency stress testing, if real multi-process contention
  needs stronger evidence than deterministic lock-file simulations

## Route 110 Multiprocess Stress Note

Route 110 adds bounded real CLI child-process stress around the explicit
persistent cache. It covers concurrent execute writes, status/replay while a
lock-holder child process simulates an in-flight write, compact under busy
lock, stale lock repair, corrupt/unsafe repair, and post-stress integrity
reporting without changing cache defaults or storing raw evidence.
