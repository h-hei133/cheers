# Route 84: project memory invalidation and delete UX

## Goal

Add lifecycle control for saved project memories before any memory auto-injection.

Route 82 added explicit local project memory save.
Route 83 added deterministic recall/search/wake-up preview.

Route 84 should add memory invalidation/delete UX:

- users can invalidate saved memory records
- users can delete saved memory records if local store supports it cleanly
- invalidated records no longer appear in normal recall/wake-up results
- recall can optionally include invalidated records only through explicit dev/test option if clean
- invalidation/deletion are explicit user commands
- no automatic memory cleanup
- no cross-session auto-loading
- no future-turn memory auto-injection

This route should close the basic memory lifecycle loop before Route 85 considers opt-in wake-up/future-turn memory injection.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/non-default-project-memory-store-prototype.md
- docs/design/project-memory-retrieval-wakeup-recall.md
- docs/design/memory-candidate-review-approval-ux.md
- docs/design/project-memory-candidate-extraction.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/memory` reviews candidates.
- `/memory approve` and `/memory reject` update session-scoped review state.
- `/memory save` writes approved safe candidates to explicit local store.
- `/memory recall` and `/memory search` read saved records deterministically.
- `/memory wake` renders a wake-up preview.
- no invalidation/delete UX exists yet.
- no memory auto-injection exists yet.

## Reference scan

Do a bounded scan before code edits.

Memory-specialized primary reference:

- MemPalace: /home/wang/projects/mempalace

Coding-agent references:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- MemPalace: inspect at most 8 directly relevant files
- ClaudeCode/opencode/gemini-cli: inspect at most 6 files total
- total default budget: 14 files
- may exceed by 2 only for a directly relevant invalidation/delete/store lifecycle file

MemPalace search focus:

- invalidate
- delete
- remove
- tombstone
- timeline
- knowledge graph
- backend delete
- drawer management
- CLI delete
- MCP delete

Coding-agent search focus:

- memory delete
- memory clear
- forget
- invalidation
- command
- session memory
- project memory

Answer in docs/design/project-memory-invalidation-delete-ux.md:

1. How does MemPalace model deletion, invalidation, or lifecycle state?
2. Which concepts should be borrowed: tombstone, invalidatedAt, reason, audit trail?
3. What should be hard delete versus soft invalidation locally?
4. How should recall/wake-up treat invalidated records?
5. What should remain deferred until memory auto-injection?

Do not introduce vector DB, ChromaDB, MemPalace backend, MCP memory tools, startup cache, sidebar UI, or automatic memory injection in this route.

## This route changes

Allowed:

- docs/design/project-memory-invalidation-delete-ux.md
- docs/design/non-default-project-memory-store-prototype.md, Route 84 note only
- docs/design/project-memory-retrieval-wakeup-recall.md, Route 84 note only
- docs/design/memory-candidate-review-approval-ux.md, Route 84 note only
- docs/design/context-engineering-continuity-baseline.md, Route 84 note only
- docs/design/edit-capability-roadmap.md, concise Route 84 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/projectMemoryInvalidation.ts
- packages/ts-shell/src/core/context/projectMemoryDeleteCommandContract.ts
- packages/ts-shell/src/core/context/projectMemoryDeleteCommandRunner.ts
- packages/ts-shell/src/core/context/projectMemoryDeleteSurface.ts

Allowed if clean:

- extend `/memory` with:
  - `/memory invalidate <record-id>`
  - `/memory delete <record-id>`
  - `/memory forget <record-id>` as alias only if UX stays clear
  - `/memory list` if needed for record ids
- implement soft invalidation first
- implement hard delete only if JSONL/local store can do it safely and tests are simple
- add explicit `includeInvalidated` in internal/test retrieval path only if useful

## This route must preserve

Route-specific boundaries:

- no memory auto-injection
- no cross-session auto-loading
- no automatic memory cleanup
- no vector DB / ChromaDB / embeddings
- no provider/model calls
- no startup cache
- no sidebar UI
- no MCP memory tools
- no package script/default gate changes
- no provider/MCP behavior changes
- no SessionManager schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw file content, raw recovery content, secrets, provider credentials, or hidden reasoning in invalidation/delete output
- `/memory` UX must remain simple

## Tasks

### 1. Design and audit

Create docs/design/project-memory-invalidation-delete-ux.md.

Include:

- MemPalace reference scan summary
- coding-agent reference scan summary
- Route 82/83 memory store + recall baseline
- soft invalidation model
- hard delete decision
- auditability / tombstone model
- recall/wake-up filtering rules
- command UX
- safety/redaction policy
- why auto-injection remains deferred
- next-route decision criteria

### 2. Add invalidation model

Add packages/ts-shell/src/core/context/projectMemoryInvalidation.ts.

Expected concepts:

- invalidation request
- invalidation result
- invalidatedAt
- invalidationReason
- invalidatedBySourceCommand
- tombstone / audit metadata
- delete result if hard delete is implemented

Required behavior:

- explicit record id required
- reason optional but supported
- deterministic clock injection for tests
- invalidation is explicit user action
- no provider/model calls
- no auto cleanup
- no raw content/secrets

Add focused tests.

### 3. Extend local memory store lifecycle

Update projectMemoryLocalStore.ts and store contract if needed.

Required behavior:

- invalidate record by id
- list should exclude invalidated records by default
- list can include invalidated records only with explicit option if useful
- get by id should show invalidated status if record exists
- hard delete only if safe; otherwise document invalidation-only decision
- preserve provenance/evidence metadata
- append-only tombstone is preferred if clean for JSONL
- reject invalidation of missing record clearly
- no vector/search backend changes

Add focused tests.

### 4. Update retrieval and wake-up filtering

Update projectMemoryRetrieval.ts and projectMemoryWakeup.ts.

Required behavior:

- invalidated records do not appear in normal recall/search/wake-up
- invalidated records can appear only with explicit internal/test include option if implemented
- ranking remains deterministic
- wake-up summary excludes invalidated records
- deleted records never appear
- output does not leak raw content/secrets

Add focused tests.

### 5. Add delete/invalidate command contract

Add packages/ts-shell/src/core/context/projectMemoryDeleteCommandContract.ts.

Preferred command forms:

- `/memory invalidate <record-id>`
- `/memory delete <record-id>`
- `/memory forget <record-id>` only as clear alias if desired
- `/memory list` if needed for discovering record ids

Normal user path:

- `/memory` still reviews candidates.
- `/memory recall` recalls.
- `/memory wake` previews.
- `/memory invalidate <id>` marks saved record invalid.
- `/memory delete <id>` hard-deletes only if supported; otherwise explains that invalidate is supported.

Required behavior:

- invalid id rejected
- missing id rejected
- no implicit bulk delete
- no automatic cleanup
- no provider/model call

Add focused tests.

### 6. Add command runner and surface

Add:

- packages/ts-shell/src/core/context/projectMemoryDeleteCommandRunner.ts
- packages/ts-shell/src/core/context/projectMemoryDeleteSurface.ts

Runner should:

- require explicit local store harness/root
- invalidate/delete only saved records
- return structured result
- never auto-load memory
- never inject future context
- never persist raw content/secrets beyond existing store record metadata

Surface should show:

- record id
- operation
- status
- reason
- invalidatedAt/deletedAt if applicable
- recall/wake-up effect
- “Auto-injected: no”
- next action

Add focused tests.

### 7. Integrate with `/memory`

Extend memoryCommandRuntime if clean.

Required behavior:

- `/memory invalidate <id>` routes to invalidation runner
- `/memory delete <id>` routes to delete runner or clear unsupported-hard-delete explanation
- `/memory recall` and `/memory wake` reflect invalidation filtering
- `/memory` default remains review/list
- `/memory save` remains review-before-write
- no normal user needs complex flags

Add focused tests.

### 8. Lifecycle tests

Required tests:

- saved record appears in recall
- invalidated record no longer appears in recall
- invalidated record no longer appears in wake-up
- invalidated record can still be inspected via get/status if supported
- missing record invalidation returns clear error
- hard delete works if implemented, or delete command explains invalidate-only
- deleted record never appears if hard delete implemented
- invalidation preserves audit metadata
- invalidation reason stored if provided
- no raw content/secrets appear in output
- no auto-injection into future-turn compact context
- `/memory` UX remains simple

### 9. Docs and roadmap update

Update:

- docs/design/project-memory-invalidation-delete-ux.md with final notes
- docs/design/non-default-project-memory-store-prototype.md with Route 84 note
- docs/design/project-memory-retrieval-wakeup-recall.md with Route 84 note
- docs/design/memory-candidate-review-approval-ux.md with Route 84 note
- docs/design/context-engineering-continuity-baseline.md with Route 84 note
- docs/design/edit-capability-roadmap.md with concise status and Route 85 recommendation

Recommended next route:

- Route 85: explicit opt-in memory wake-up/future-turn injection
  - only after invalidation/delete UX is stable
- or Route 85: memory store lifecycle hardening
  - if invalidation/delete exposes store lifecycle gaps

## Validation

Route-specific final validation:

- focused tests for touched core/context command/session modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad `src/core/shell` or `src/session` paths expose unrelated failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- invalidation requires vector DB / ChromaDB
- invalidation requires SessionManager schema changes
- hard delete would corrupt JSONL/local store
- recall/wake-up cannot reliably exclude invalidated records
- auto-injection becomes necessary
- raw content or secrets would need to appear in lifecycle output
- command integration requires broad cli.tsx rewrite
- `/memory` UX becomes flag-heavy or confusing

## Final report

1. What changed
2. Reference scan summary, including MemPalace
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.
