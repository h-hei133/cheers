# Project Memory Retrieval, Wake-Up, And Recall

Route 83 makes explicitly saved project memories usable through deterministic
local retrieval. It builds on the Route 82 explicit local JSONL store and does
not add vector search, provider/model calls, automatic loading, startup cache,
sidebar UI, or MCP memory tools.

## Reference Scan

MemPalace files scanned:

- `/home/wang/projects/mempalace/mempalace/layers.py`
- `/home/wang/projects/mempalace/mempalace/searcher.py`
- `/home/wang/projects/mempalace/website/reference/cli.md`
- `/home/wang/projects/mempalace/website/reference/api-reference.md`
- `/home/wang/projects/mempalace/website/reference/mcp-tools.md`

Coding-agent reference files scanned:

- `/home/wang/projects/source-claudecode/memdir/memoryScan.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/context/memoryContextManager.ts`
- `/home/wang/projects/opencode/packages/opencode/src/command/index.ts`

## MemPalace Concepts To Adopt

Adopt the layered memory idea conceptually:

- L0-like: stable project facts and explicit user preferences.
- L1-like: essential project story, current phase, route decisions,
  capability-state facts, blocked-by-design decisions, and validation patterns.
- L2-like: on-demand recall over saved records.
- L3-like: deeper local search over saved records.

Also borrow the discipline that wake-up output is bounded and that recall/search
is explicit and scoped.

## Concepts Deferred

Deferred:

- ChromaDB, vector DB, embeddings, semantic search, BM25 over external indexes,
  and backend architecture.
- MemPalace palace/wing/room/drawer user surface.
- MCP memory tools.
- Automatic wake-up injection, startup cache, sidebar UI, and background recall.
- Provider/model reranking or summarization.

## Route 82 Store Baseline

Route 82 records are approved safe summaries with source, evidence, route
references, redactions, and timestamps. Route 83 reads those records only. It
does not write memories, change record schema, or choose a default global path.

## Deterministic Retrieval Strategy

`projectMemoryRetrieval.ts` reads records from the supplied store and applies
local deterministic ranking:

- optional filters: candidate kind, retention class, source
- query matching over memory text, structured fact fields, evidence labels,
  route references, kind, retention class, and source
- score from exact query matches, term matches, filter matches, and safe-record
  signal
- deterministic tie-breaker by `createdAt` and record id
- max result limit

If a query is present, a record must actually match the query terms. Safe or
recency signals cannot make an unrelated record appear.

## Wake-Up Preview Strategy

`projectMemoryWakeup.ts` renders a preview, not prompt injection:

- L0-like section: explicit user preferences and stable project facts.
- L1-like section: route decisions, capability state, blocked-by-design
  decisions, validation patterns, and recovery boundaries.

The preview is bounded, deterministic, and clearly says auto-injection and
startup cache are not enabled.

## Recall/Search UX

`/memory recall <query>` and `/memory search <query>` read saved records from
an explicitly supplied local store. `/memory wake` shows the wake-up preview.
`/memory` without those subcommands remains the Route 81 review surface.

The command forms intentionally avoid complex flags. Optional filters use small
`kind:`, `retention:`, `source:`, and `limit:` tokens for tests/dev usage.

## Safety And Redaction

Recall and wake-up output must not expose:

- raw file content markers
- raw recovery content
- secrets or provider credentials
- hidden reasoning markers

Route 83 surfaces only memory record summaries and references. Defensive
rendering redacts secret-looking and raw-content markers even if a malformed
test record is present.

## Non-Auto-Injection Policy

Retrieval remains user-triggered:

- no future-turn auto-injection
- no startup cache
- no cross-session automatic loading
- no provider/model calls
- no persistence writes

Users can manually use recalled facts; the runtime does not inject them into
normal turns.

## Route 84 Options

Recommended next route depends on the next blocker:

- memory invalidation/delete UX if stale records become the safety gap
- opt-in wake-up/future-turn injection if preview is stable and user-controlled
- startup warm context cache only after explicit opt-in semantics are designed

## Route 84 Note

Route 84 adds explicit lifecycle filtering below recall and wake-up:

- invalidated records are excluded from normal recall, search, and wake-up
  preview by default
- an internal/test include-invalidated option can inspect invalidated records
- deleted records never appear in recall, search, wake-up, or
  include-invalidated retrieval
- lifecycle commands do not write prompt context, call providers/models, create
  a startup cache, or enable future-turn memory injection

The Route 83 deterministic ranking rules are unchanged after lifecycle
filtering.

## Route 85 Note

Route 85 keeps recall/search/wake-up as preview commands. Injection requires a
separate explicit command:

- `/memory use` stages wake-up preview content for one next normal turn.
- `/memory use <query>` stages recall results for one next normal turn.
- The future-turn planner reruns wake-up/retrieval against the local store, so
  invalidated and deleted records stay filtered.

Retrieval remains deterministic and local: no provider/model calls, vector DB,
ChromaDB, embeddings, semantic rerank, startup cache, sidebar UI, or automatic
memory injection.

## Route 86 Note

Route 86 keeps recall/search/wake-up ranking deterministic and local, but adds
future-turn injection hardening after `/memory use`:

- the planner reruns retrieval/wake-up and resolves staged record ids before
  injection
- invalidated/deleted records are filtered from injected context
- selected records are deduped by id
- over-budget injected memory context is trimmed without dropping safety
  caveats
- clear structured conflicts block injection; uncertain route status
  differences warn only

## Route 87 Note

Route 87 lets an explicit startup warm cache builder consume active approved
memory records or the wake-up preview as safe summary input. Recall/search and
wake-up remain deterministic, local, and user-triggered. Invalidated/deleted
records must not be cached as active facts, and the warm cache does not enable
startup auto-load, automatic memory injection, provider/model calls, vector DB,
ChromaDB, embeddings, or sidebar UI.
