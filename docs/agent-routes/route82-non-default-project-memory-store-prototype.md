# Route 82: non-default project memory store prototype

## Goal

Implement the first non-default local project memory store prototype after Route 81.

Route 80 added memory candidate extraction.
Route 81 added session-scoped memory candidate review / approval UX through `/memory`.

Route 82 should add a minimal local store prototype, but only for explicitly approved candidates.

Core rule:

- candidates must be reviewed before write
- approved candidates are session-scoped decisions
- persistent write requires an explicit user command
- no automatic memory writes
- no automatic cross-session loading
- no wake-up / recall / retrieval injection yet

This route should create the storage seam and first explicit save path. It must not become a full memory system.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/project-memory-candidate-extraction.md
- docs/design/memory-candidate-review-approval-ux.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-quality-merge-hardening.md
- docs/design/edit-capability-roadmap.md

Current phase baseline:

- `/compact` extracts memory candidates.
- `/memory` lists/reviews candidates.
- `/memory approve <candidate-id>` and `/memory reject <candidate-id>` update session-scoped review state.
- unsafe candidates cannot be approved by default.
- no memory store exists yet.
- no automatic memory write exists yet.
- no cross-session memory loading exists yet.

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
- ClaudeCode/opencode/gemini-cli: inspect at most 8 files total
- total default budget: 16 files
- may exceed by 2 only for a directly relevant local memory store / command / persistence file

MemPalace search focus:

- backend
- local store
- add / upsert
- palace path
- identity
- mine
- sweep
- drawer metadata
- invalidation
- CLI save/search

Coding-agent search focus:

- memory
- local storage
- project memory
- command
- preference
- approval
- persistence
- session memory

Answer in docs/design/non-default-project-memory-store-prototype.md:

1. What should be borrowed from MemPalace storage architecture?
2. What should not be borrowed yet?
3. What is the smallest project-local store for approved memory candidates?
4. How should provenance/evidence/review decisions be recorded?
5. How should invalidation/deletion be deferred or minimally represented?
6. What should remain deferred until retrieval / wake-up / recall routes?

MemPalace concepts to evaluate:

- local-first storage
- evidence/verbatim-first principle
- backend abstraction
- metadata-rich records
- scoped organization
- invalidation / health / typed backend contracts

Do not introduce ChromaDB, vector DB, MCP memory tools, layered wake-up, recall, or deep search in this route.

## This route changes

Allowed:

- docs/design/non-default-project-memory-store-prototype.md
- docs/design/memory-candidate-review-approval-ux.md, Route 82 note only
- docs/design/project-memory-candidate-extraction.md, Route 82 note only
- docs/design/context-engineering-continuity-baseline.md, Route 82 note only
- docs/design/edit-capability-roadmap.md, concise Route 82 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/projectMemoryStoreContract.ts
- packages/ts-shell/src/core/context/projectMemoryLocalStore.ts
- packages/ts-shell/src/core/context/projectMemorySaveCommandContract.ts
- packages/ts-shell/src/core/context/projectMemorySaveCommandRunner.ts
- packages/ts-shell/src/core/context/projectMemoryStoreSurface.ts

Allowed if clean:

- extend `/memory` with an explicit save command:
  - `/memory save <candidate-id>`
  - `/memory save approved`
- add `/memory status` store status if simple
- store under a non-default explicit path only if already supplied by test/dev input
- use a temp/test store path in tests
- add JSONL or simple file-based store prototype

## This route must preserve

Route-specific boundaries:

- no automatic memory writes
- no write of pending/rejected/unsafe candidates
- no write without explicit save command
- no cross-session automatic loading
- no retrieval / wake-up / recall implementation
- no vector DB / ChromaDB
- no MemPalace backend copy
- no MCP memory tools
- no startup cache
- no sidebar UI
- no provider/MCP behavior changes
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw file content, raw recovery content, secrets, provider credentials, or hidden reasoning in memory records
- local store must be non-default / explicit
- review-before-write must be enforced

## Tasks

### 1. Design and audit

Create docs/design/non-default-project-memory-store-prototype.md.

Include:

- MemPalace reference scan summary
- ClaudeCode/opencode/gemini-cli reference scan summary
- Route 80/81 baseline
- store prototype objective
- review-before-write contract
- local store boundary
- record schema
- provenance/evidence model
- redaction and safety policy
- non-default storage policy
- deferred retrieval / wake-up / recall
- deferred backend/vector DB
- future invalidation/delete policy
- next-route decision criteria

### 2. Add project memory store contract

Add packages/ts-shell/src/core/context/projectMemoryStoreContract.ts.

Expected concepts:

- ProjectMemoryRecord
- ProjectMemoryRecordId
- ProjectMemoryStoreRef
- ProjectMemoryWriteRequest
- ProjectMemoryWriteResult
- ProjectMemoryListResult
- ProjectMemoryStoreHealth
- ProjectMemoryStoreMode:
  - "disabled"
  - "explicit-local"
  - "test-only"

Record fields should include:

- id
- createdAt
- candidateId
- candidateKind
- retentionClass
- approvedAt
- approvedBySourceCommand
- memoryText or structuredFact
- evidence references
- source packet / route references
- safety classification
- redactions
- version
- invalidatedAt, optional
- invalidationReason, optional

Required behavior:

- pure types/helpers
- no persistence in contract file
- no raw content/secrets in record schema examples
- records carry provenance

Add focused tests if helper logic exists.

### 3. Add explicit local store prototype

Add packages/ts-shell/src/core/context/projectMemoryLocalStore.ts.

Preferred storage shape:

- simple JSONL or JSON file
- append-only where possible
- deterministic test path support
- explicit store root/path required
- no default user/global path
- no automatic creation outside explicit test/dev path

Required behavior:

- write approved records only
- list records
- read record by id if simple
- reject unsafe/raw/secret records
- reject pending/rejected candidates
- reject writes without explicit store path/root
- no vector DB
- no semantic search
- no automatic loading into context
- no provider/model calls

Add focused tests using temp store path.

### 4. Add memory save command contract

Add packages/ts-shell/src/core/context/projectMemorySaveCommandContract.ts.

Preferred command forms:

- `/memory save <candidate-id>`
- `/memory save approved`
- `/memory status`

Normal user path:

- `/memory` remains review/list.
- saving requires explicit `save`.

Required behavior:

- save requires approved candidate
- save rejected/unsafe/pending candidate is blocked
- save requires explicit local store target if store is not configured in test/dev harness
- invalid candidate id rejected
- no automatic save all unless command explicitly says `approved`
- no persistence unless save mode is explicit

Add focused tests.

### 5. Add memory save command runner

Add packages/ts-shell/src/core/context/projectMemorySaveCommandRunner.ts.

Runner should:

- consume review state from Route 81
- consume current candidates
- validate candidate quality
- enforce approved-only write
- create store records with provenance/evidence
- write to explicit local store
- return structured result and user-facing summary
- never call provider/model
- never inject future-turn context
- never auto-load saved memory
- never write raw content/secrets

Add focused tests.

### 6. Add memory store surface renderer

Add packages/ts-shell/src/core/context/projectMemoryStoreSurface.ts.

Renderer should show:

- memory store status
- records saved in this command
- skipped candidates and reasons
- rejected unsafe candidates
- store path/root if safe to show
- “Auto-load: no”
- “Retrieval: not enabled”
- “Memory written: yes/no”
- next action

Keep output concise and understandable.

Add focused tests.

### 7. Extend `/memory` command if clean

Integrate save/status into existing `/memory` command path.

Required behavior:

- `/memory` still defaults to list/review
- `/memory approve` and `/memory reject` keep existing behavior
- `/memory save <candidate-id>` writes only approved candidate
- `/memory save approved` writes approved safe candidates
- `/memory status` shows store status if implemented
- no normal user needs complex flags for review
- explicit store path/dev harness should not make UX confusing

If command integration is coupled:

- keep save command runner tested
- document blocker
- recommend Route 83 command polish

### 8. Add store prototype tests

Required tests:

- approved candidate can be saved to explicit local store
- pending candidate cannot be saved
- rejected candidate cannot be saved
- unsafe candidate cannot be saved
- ambiguous user preference candidate cannot be saved unless approved
- raw content candidate rejected
- secret/provider credential candidate rejected
- record includes provenance/evidence
- list records works
- no auto-load into future-turn injection
- `/memory save approved` saves only approved safe candidates
- `/memory` default remains non-persistent review
- output says retrieval/wake-up not enabled

### 9. Docs and roadmap update

Update:

- docs/design/non-default-project-memory-store-prototype.md with final notes
- docs/design/memory-candidate-review-approval-ux.md with Route 82 note
- docs/design/project-memory-candidate-extraction.md with Route 82 note
- docs/design/context-engineering-continuity-baseline.md with Route 82 note
- docs/design/edit-capability-roadmap.md with concise status and Route 83 recommendation

Recommended next route:

- Route 83: Memory retrieval / wake-up / recall design and prototype
  - only after explicit store prototype is safe
- or Route 83: Memory store invalidation/delete UX
  - if save works but lifecycle management is the next blocker

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

- local store requires SessionManager schema changes
- local store requires provider/model calls
- vector DB / ChromaDB becomes necessary
- automatic memory writes become necessary
- cross-session auto-loading becomes necessary
- review-before-write cannot be enforced
- raw content or secrets would need to be stored
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
