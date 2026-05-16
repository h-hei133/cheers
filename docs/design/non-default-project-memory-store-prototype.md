# Non-Default Project Memory Store Prototype

Route 82 adds the first project memory store prototype after candidate
extraction and session-scoped review. The store is non-default: it writes only
when a caller supplies an explicit local store, and only through an explicit
`/memory save ...` command.

This is not retrieval, wake-up, recall, startup cache, sidebar UI, MCP memory,
or vector search.

## Reference Scan

MemPalace files scanned:

- `/home/wang/projects/mempalace/mempalace/backends/base.py`
- `/home/wang/projects/mempalace/mempalace/palace.py`
- `/home/wang/projects/mempalace/mempalace/miner.py`
- `/home/wang/projects/mempalace/mempalace/config.py`
- `/home/wang/projects/mempalace/mempalace/mcp_server.py`

Coding-agent reference files scanned:

- `/home/wang/projects/source-claudecode/memdir/memoryScan.ts`
- `/home/wang/projects/source-claudecode/memdir/teamMemPrompts.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/commands/memory.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/services/memoryService.ts`
- `/home/wang/projects/opencode/packages/opencode/src/command/index.ts`

## What To Borrow From MemPalace

Borrow concepts, not backend implementation:

- explicit local storage address instead of silent global defaults
- typed store contract with health/status reporting
- record metadata that carries source, evidence, timestamps, and owner command
- append-style local writes for the first prototype
- future invalidation fields rather than immediate delete/update semantics
- local-first posture with no provider/model call required for storage

## What Not To Borrow Yet

Do not borrow:

- ChromaDB, embeddings, vector DB, HNSW, semantic search, or backend selection
- MCP memory tools
- wake-up layers, recall, retrieval injection, or search surfaces
- mining/sweeping automation
- large verbatim-content drawer storage
- automatic startup loading or background extraction

## Route 80/81 Baseline

Route 80 produces memory candidates from compact/context data and labels safety,
retention class, evidence, and redactions. Route 81 adds `/memory` review:
approved/rejected decisions are session-scoped, unsafe candidates cannot be
approved by default, and review does not persist memory.

Route 82 keeps that boundary and adds only an explicit save path for approved
safe candidates.

## Store Prototype Objective

The smallest useful store is a JSONL-backed project-local record store:

- `projectMemoryStoreContract.ts` defines the stable store/record surface.
- `projectMemoryLocalStore.ts` writes records to an explicit root.
- `projectMemorySaveCommandContract.ts` parses `/memory save ...` and
  `/memory status`.
- `projectMemorySaveCommandRunner.ts` enforces review-before-write.
- `projectMemoryStoreSurface.ts` renders status and save results.

No default user/global memory path is created. In normal CLI use, save is
blocked unless the runtime/test harness supplies a store.

## Review-Before-Write Contract

Persistent write requires all of these:

- candidate exists in the current review session
- candidate decision is `approved`
- candidate safety is `safe`
- candidate is not `never-remember` and not `rejected`
- command is explicit: `/memory save <candidate-id>` or `/memory save approved`
- an explicit local store is supplied

Pending, rejected, unsafe, needs-review, raw-content, secret-looking, and hidden
reasoning candidates are blocked.

## Record Schema

Records include:

- id, version, createdAt
- candidateId, candidateKind, retentionClass
- approvedAt and `approvedBySourceCommand: "/memory"`
- memoryText from the candidate summary
- evidence and route/source references
- source packet reference
- safety and redactions
- optional invalidatedAt and invalidationReason

The schema stores summaries and references, not raw file bodies, raw recovery
content, provider credentials, hidden reasoning, or raw content blobs.

## Provenance And Evidence

Provenance is record-local and explicit:

- candidate id ties the stored record back to review state
- approvedAt ties the write to the session decision
- evidence preserves compact/context/test references
- redactions document omitted sensitive material
- store health reports the explicit path and record count

## Invalidation / Deletion

Route 82 only reserves invalidation fields. It does not add delete/update UX,
stale memory sweeps, record replacement, or automatic invalidation. A later
route should define lifecycle management before retrieval relies on records.

## Deferred Until Retrieval / Wake-Up / Recall

Deferred work:

- loading stored records into prompts or context
- retrieval ranking, recall, wake-up, and search
- vector DB or backend abstraction
- MCP memory tools
- startup cache and sidebar memory UI
- cross-session automatic loading
- background save/mining/sweeping

## Next Route Criteria

Choose retrieval/wake-up/recall only after the explicit save path remains safe
under review-before-write tests. If stored records need lifecycle controls
first, choose invalidation/delete UX before retrieval.

## Route 83 Note

Route 83 adds deterministic read-only retrieval on top of this store:

- `/memory recall <query>` and `/memory search <query>` search saved approved
  records.
- `/memory wake` renders a bounded project wake-up preview.
- Retrieval requires an explicit local store supplied by the runtime/test
  harness.

Route 83 does not write memory, choose a default store path, auto-load records,
inject future-turn context, add startup cache/sidebar UI, call providers/models,
or add vector DB/ChromaDB/embedding search.

## Route 84 Note

Route 84 turns the reserved lifecycle fields into explicit local-store controls:

- `/memory invalidate <record-id> [reason...]` appends a no-content tombstone
  and excludes the record from normal lists, recall, search, and wake-up.
- `/memory delete <record-id> [reason...]` removes local record content from
  the JSONL store and leaves only a no-content delete tombstone.
- `get(id)` and explicit include-invalidated test paths can inspect
  invalidation metadata; deleted records are not returned.

The route still does not choose a default store path, auto-load records, inject
future-turn context, add startup cache/sidebar UI, call providers/models, add
MCP tools, or add vector DB/ChromaDB/embedding search.

## Route 85 Note

Route 85 uses the same explicit local store as the source for `/memory use`.
The store remains non-default: if no runtime/test harness supplies it,
`/memory use` blocks clearly. Injection state is in-memory and session-scoped;
the store does not persist pending injection state.

Route 85 does not add a default path, startup auto-load, cross-session
auto-loading, provider/model calls, MCP tools, sidebar UI, startup cache,
vector DB, ChromaDB, or embeddings.
