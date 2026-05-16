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
