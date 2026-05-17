# Browser Persistent Receipt Cache

Status: Route 108 implemented candidate; Route 109 hardening implemented candidate.
Date: 2026-05-17

## Scope

Route 108 adds an explicit sanitized persistent browser receipt/action cache for
local/test cross-process replay. It builds on Route 107's in-memory action
cache and explicit replay command without adding default persistence,
automatic replay, external network, dynamic discovery, MCP launch, Playwright
dependency, provider/model calls, SessionManager schema changes, or raw
evidence persistence.

## Reference Scan Summary

Stagehand separates cached action metadata from live execution and keeps
self-healing as a distinct runtime concern. Route 108 adapts only the explicit
cache metadata idea and keeps self-healing deferred.

OpenHands, Inspect AI, and mini-swe-agent store durable action/evidence records
as replay/report artifacts rather than raw hidden runtime state. Route 108 uses
JSONL records with sanitized receipt and cache-entry summaries, tombstones for
delete/invalidate, and explicit health/report surfaces.

Playwright MCP reinforces the browser evidence boundary: snapshots and tool
results need careful scoping and should not become arbitrary browser state.
Route 108 stores no raw page HTML, raw runner stdout/stderr, screenshots, OCR,
secrets, credentials, or hidden reasoning.

## Persistence Decision

Persistent cache is available only when an explicit cache root or manifest is
provided. No env/config means no persistent cache. The CLI bridge accepts:

- `PRIVATE_AGENTS_BROWSER_RECEIPT_CACHE_ROOT`
- `PRIVATE_AGENTS_BROWSER_RECEIPT_CACHE_MANIFEST`

The manifest must name a non-global explicit root, allowed operations, scope,
max record budget, safe-summary-only redaction, and cleanup policy.

## Cache Record Schema

`browserPersistentReceiptCache.ts` defines sanitized records:

- record version
- receipt id
- active/invalidated/deleted status
- sanitized `BrowserActionCacheEntry`
- sanitized `BrowserExecutionReceipt`
- evidence summary
- replay readiness snapshot status
- source, timestamps, redactions, warnings
- `rawEvidenceStored: "no"`
- provider/model calls set to `none`

Active records are created only from replay-ready sanitized receipts. Unsafe
content markers, raw HTML, screenshot/OCR/base64 markers, secrets, provider
credentials, and hidden reasoning reject the record before persistence.

## Store And Health

`browserReceiptCacheStore.ts` uses an explicit local JSONL file under the
manifest root. It supports write, get, list, invalidate, delete, and health.
Invalidation and deletion append sanitized tombstones; deleted records do not
keep active receipt/cache-entry content as the latest record.

`browserReceiptCacheHealth.ts` and `browserReceiptCacheSurface.ts` render
configured/missing/invalid state, record counts, replayable records,
invalidated/deleted counts, corrupted/skipped count, readability/writability,
and explicit-only persistence.

## Cross-Process Replay Model

`/browser execute` writes replay-ready receipts to the persistent cache only
when an explicit `browserReceiptCacheStore` exists. Failed cache writes surface
as cache warnings/status and do not claim browser execution failed.

`/browser replay <receipt-id>` first uses in-memory cache when available, then
falls back to the explicit persistent cache. Persistent records do not bypass
policy: replay still requires current runner, sandbox, allowlist,
confirmation, and runtime preflight.

`/browser replay status` shows both in-memory action cache state and persistent
receipt cache health when configured.

## Invalidation And Delete

The optional UX is intentionally narrow:

- `/browser replay cache status`
- `/browser replay cache invalidate <receipt-id>`
- `/browser replay cache delete <receipt-id>`

Both mutation commands require explicit cache context and manifest operations.
They append sanitized tombstones and do not output raw cache content.

## Route 109 Hardening Note

Route 109 adds explicit cache lock/lease handling, atomic temp-file plus rename
writes, recovery reads, integrity scans, retention, repair, and compaction for
the Route 108 JSONL cache. The cache remains explicit-only and sanitized-only;
replay still revalidates current runner, sandbox, allowlist, confirmation, and
runtime preflight.
