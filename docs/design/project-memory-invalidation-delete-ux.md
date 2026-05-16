# Project Memory Invalidation / Delete UX

Route 84 closes the explicit local memory lifecycle loop before any memory
auto-injection work. It builds on Route 82 explicit save and Route 83
deterministic recall/wake-up preview.

## Reference Scan Summary

MemPalace uses two relevant lifecycle patterns:

- Knowledge-graph facts are invalidated by setting an end timestamp
  (`valid_to` / `ended`) rather than erasing the fact from history.
- MCP `kg_invalidate` validates temporal input, records the resolved end time,
  and returns a compact operation result.
- Re-mined closets are purged by stable `source_file` before fresh index lines
  are written, so stale index pointers are removed as a snapshot operation.
- The source-adapter RFC allows deletion tombstones
  (`version="__deleted__"`) so core can purge drawers for a deleted source
  without treating deletion as normal new content.

Coding-agent references point to simpler user-visible discipline:

- ClaudeCode memory prompts tell agents to update or remove memories that are
  wrong or outdated, and to remove relevant entries when users ask to forget.
- Gemini CLI keeps `/memory` commands explicit and user-visible for show, add,
  reload, list, and inbox review rather than silently changing memory context.
- opencode has cache invalidation surfaces, but no project-memory lifecycle
  semantics to copy.

Borrowed concepts: explicit invalidation, timestamped lifecycle metadata,
reason/audit trail, and tombstones. Not borrowed: MemPalace backend storage,
ChromaDB, MCP tools, startup hooks, automatic mining, or verbatim drawer
semantics.

## Route 82 / 83 Baseline

The local project memory store is explicit and non-default. It saves only
approved safe summaries through `/memory save ...`, then Route 83 reads those
records through `/memory recall`, `/memory search`, and `/memory wake`.

No route loads memory automatically into prompts. No route has a default global
store path, provider/model call, vector DB, ChromaDB, startup cache, sidebar UI,
or cross-session automatic loading.

## Lifecycle Model

Soft invalidation is the normal stale-record control:

- `/memory invalidate <record-id> [reason...]` requires an explicit record id.
- The local JSONL store appends a no-content lifecycle tombstone.
- Folded records expose `invalidatedAt`, `invalidationReason`, and
  `invalidatedBySourceCommand`.
- `list()` excludes invalidated records by default.
- `list({ includeInvalidated: true })` and `get(id)` can inspect invalidation
  metadata for tests/status paths.

Hard delete is supported for the local JSONL store:

- `/memory delete <record-id> [reason...]` requires an explicit record id.
- The store rewrites the JSONL file to remove the record and prior lifecycle
  entries for that id, then appends a no-content delete tombstone.
- Deleted records never appear in normal recall/wake-up or explicit
  include-invalidated retrieval.
- The tombstone preserves that a deletion occurred without retaining
  `memoryText`.

Missing records are blocked clearly. There is no bulk invalidation, no automatic
cleanup, and no stale sweep.

## Recall And Wake-Up Filtering

Normal retrieval calls `store.list()` and therefore excludes invalidated and
deleted records. Wake-up preview uses the same retrieval path, so stale records
cannot enter L0/L1 preview sections.

An internal/test retrieval option can explicitly include invalidated records for
inspection. Deleted records are not returned by any retrieval path.

Ranking remains deterministic and local. Lifecycle filtering does not add
semantic search, provider rerank, embeddings, vector DB, ChromaDB, or backend
abstraction.

## Command UX

User-facing commands stay small:

- `/memory` reviews candidates.
- `/memory save ...` persists approved safe candidates.
- `/memory recall <query>` and `/memory search <query>` retrieve saved records.
- `/memory wake` renders a preview.
- `/memory invalidate <record-id> [reason...]` excludes a record from normal
  recall/wake-up while preserving inspectable audit metadata.
- `/memory delete <record-id> [reason...]` removes local record content and
  leaves only a no-content tombstone.

Lifecycle output shows operation, record id, reason, timestamp, store mode,
recall/wake-up effect, and explicit "Auto-injected: no". It does not show raw
content or provider material.

## Safety And Redaction

Lifecycle surfaces redact secret-looking tokens, raw-content markers, and hidden
reasoning markers. Invalidation/delete reasons are compacted and sanitized
before persistence. Lifecycle tombstones do not store `memoryText`, raw file
content, raw recovery content, provider credentials, provider config, hidden
reasoning, or raw content blobs.

The route does not change SessionManager schema, provider/MCP behavior, package
scripts, default gates, edit runtime behavior, recovery behavior, or atomic
rollback.

## Why Auto-Injection Remains Deferred

Invalidation/delete controls are a prerequisite for safer memory loading, but
they are not themselves an injection policy. Future-turn use still needs an
explicit opt-in design for when records are loaded, how much is loaded, how
stale records are surfaced, and how the user can inspect or disable loading.

Route 84 therefore keeps:

- no memory auto-injection
- no cross-session auto-loading
- no startup cache
- no sidebar UI
- no automatic recovery
- no provider/model calls

## Next-Route Criteria

Choose Route 85 opt-in wake-up/future-turn injection only if lifecycle commands
remain simple and focused validation continues to prove invalidated/deleted
records cannot enter recall or wake-up.

If lifecycle behavior exposes store corruption, concurrency, or audit gaps,
choose memory store lifecycle hardening before injection.
