# Browser Action Cache And Explicit Replay

Status: Route 107 implemented candidate.
Date: 2026-05-17

## Scope

Route 107 adds a receipt-backed browser action cache and explicit replay
prototype for local/test browser actions. It connects Route 104 receipts and
Route 106 skill-managed execution without expanding browser authority.

It adds sanitized action cache entries, an explicit in-memory cache supplied by
command/harness context, replay policy and planning with current-gate
revalidation, replay execution over existing local/test executor bridges,
`/browser replay status`, `/browser replay <receipt-id>`, replay receipt
linkage, and sidebar/report/harness summaries.

It does not add automatic replay, cache persistence, external network,
dynamic discovery, MCP launch, Playwright dependency, provider/model calls,
SessionManager schema changes, package/default gate changes, browser session
persistence, or raw page/runner output.

## Reference Scan Summary

Bounded scan inputs:

- Stagehand: `packages/core/lib/v3/cache/AgentCache.ts`,
  `packages/core/lib/v3/cache/utils.ts`, `packages/core/lib/v3/v3.ts`,
  `packages/core/lib/v3/agent/tools/act.ts`,
  `packages/core/lib/v3/agent/tools/fillform.ts`
- Playwright MCP: `tests/click.spec.ts`, `tests/core.spec.ts`,
  `tests/fixtures.ts`, `tests/capabilities.spec.ts`
- OpenHands: trajectory/download constants and chat event rendering helpers
- Inspect AI: branch, anchor, sandbox event, and model rendering files
- mini-swe-agent: minimal command/action trajectory and run report patterns

Findings:

1. Stagehand separates live execution, cache storage, replay steps, and
   self-healing. Route 107 borrows the explicit cache-entry and replay-plan
   shape, but does not implement persistence or self-healing.
2. Stagehand avoids storing large/raw payloads for replay. Route 107 caches
   only sanitized receipt/evidence summaries.
3. Playwright MCP exposes browser actions as named tool calls with bounded
   result snapshots. Route 107 keeps replay scoped to receipt-backed
   local/test actions and does not launch an MCP server.
4. OpenHands separates action and observation event surfaces. Route 107 mirrors
   that through sidebar/report summaries without raw runner stdout/stderr.
5. Inspect AI transcript concepts distinguish replay/branch markers from live
   unique events. Route 107 links replay receipts to source receipts/cache
   entries instead of overwriting original evidence.

## Cache Model

`browserActionCacheEntry.ts` derives `BrowserActionCacheEntry` only from a
sanitized `BrowserExecutionReceipt`. Cached fields include source receipt id
and status, action kind, execution mode, runner/manifest references, optional
skill runner reference, local fixture target, sandbox/allowlist/confirmation
snapshots, evidence summary, replay readiness snapshot, redactions, warnings,
and created time.

Entries reject raw HTML markers, raw-content markers, secret-looking values,
hidden reasoning, screenshot/OCR/base64 markers, provider/model calls, and any
receipt that does not exclude raw content.

`browserActionCache.ts` is explicit and in-memory only. It supports add/get/
list/clear/summary, replaces duplicate source receipts deterministically, caps
entries by max-entry budget, hides developer-only/unsafe entries by default,
and has no global default instance or persistence.

## Replay Policy

`browserReplayPolicy.ts` allows replay only when the cache entry exists, the
source receipt executed successfully, replay readiness is `replay-ready`, the
target is local-fixture scoped, the action is observe/extract/local navigate,
the mode is local/test scoped, a current runner or skill binding is available,
and current sandbox/allowlist/confirmation records are present.

It blocks external URLs, unsafe evidence, timeout/malformed/unsafe receipts,
state-changing actions, missing runner/binding, stale readiness, and missing
current gate decisions. A replay-ready receipt is evidence, not authority.

## Planner And Executor

`browserReplayPlanner.ts` turns an explicit replay request plus cache entry
into a plan with source receipt, cache entry, action, runner mode, target,
revalidation summary, expected evidence, blockers, warnings, next action, and
`willExecute`.

`browserReplayExecutor.ts` consumes only allowed plans. Before executing, it
reruns the existing browser runtime preflight with the current sandbox,
network allowlist, confirmation records, execution policy, and supplied
executor kind. It then reuses the supplied local/test browser executor and
creates a new browser execution receipt whose source is `replay`, with
`replaySourceReceiptId` and `replayCacheEntryId` linkage.

## Command UX

`/browser replay status` reports in-memory cache state and explicitly says
persistence and automatic replay are disabled.

`/browser replay <receipt-id>` requires an explicit cache entry and current
runner context. Missing entries return `replay-not-found`; blocked entries
render blockers without execution. Successful replay renders a new replay
receipt id and keeps `Executed: yes/no` accurate.

## Sidebar, Reports, And Harness

Sidebar command adaptation labels replay output as `Browser replay`. Scenario
reports include compact replay command status. Harness scenarios cover
external-runner replay, skill-managed replay, blocked external/unsafe/
malformed/timeout entries, replay status, and safe report summaries.

The cache intentionally does not cross process boundaries. Execute-then-replay
continuity is tested in process unless a future route adds explicit safe
persistence.

## Deferred Boundaries

Still deferred: persistent action cache, automatic replay, self-healing,
external-network replay, dynamic skill discovery or runner registry, MCP
browser server launch, Playwright package dependency, and provider/model replay
planning.

## Route 108 Recommendation

Recommended Route 108: browser replay UX/report polish if replay output is too
verbose. Alternative Route 108 options are browser action self-healing design,
external-network browser execution after local replay remains stable, or a
persistent action cache decision only if explicit in-memory cache is
insufficient and safe.
