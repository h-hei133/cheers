# Route 83: project memory retrieval, wake-up, and recall prototype

## Goal

Make explicitly saved project memories usable through deterministic local retrieval.

Route 80 added candidate extraction.
Route 81 added review/approval UX.
Route 82 added a non-default explicit local project memory store.

Route 83 should add the first retrieval / wake-up / recall prototype on top of that local store:

- list and retrieve saved approved memory records
- add deterministic local search over saved memory records
- add project wake-up summary preview
- add on-demand recall command
- keep retrieval user-triggered and non-default
- keep memory loading out of automatic future-turn injection for now
- keep no vector DB / ChromaDB / semantic embedding in this route

This route should borrow MemPalace's layered memory idea conceptually, but adapt it to this coding-agent project:

- L0-like: stable project/user preference facts
- L1-like: essential project story / current phase summary
- L2-like: on-demand recall by query/kind/source
- L3-like: deeper deterministic local search over saved approved records

Do not introduce the palace/wing/room/drawer metaphor into the user surface unless strongly justified in the design doc.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/non-default-project-memory-store-prototype.md
- docs/design/memory-candidate-review-approval-ux.md
- docs/design/project-memory-candidate-extraction.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current phase baseline:

- `/memory` reviews candidates.
- `/memory approve <candidate-id>` approves session-scoped candidates.
- `/memory save <candidate-id>` and `/memory save approved` write approved safe records to an explicit local JSONL store.
- no automatic memory write exists.
- no cross-session auto-loading exists.
- no retrieval / wake-up / recall exists yet.
- no vector DB / ChromaDB exists.
- no startup cache/sidebar exists.

## Reference scan

Do a bounded scan before code edits.

Memory-specialized primary reference:

- MemPalace: /home/wang/projects/mempalace

Coding-agent references:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- MemPalace: inspect at most 10 directly relevant files
- ClaudeCode/opencode/gemini-cli: inspect at most 6 files total
- total default budget: 16 files
- may exceed by 2 only for a directly relevant retrieval / wake-up / recall file

MemPalace search focus:

- layers
- wake-up
- recall
- search
- identity
- backend query
- metadata filter
- agent diary
- CLI search
- MCP recall

Coding-agent search focus:

- memory recall
- compact recall
- session summary
- project facts
- command
- context injection
- resume

Answer in docs/design/project-memory-retrieval-wakeup-recall.md:

1. Which MemPalace layered-memory concepts should be adopted?
2. Which concepts should stay deferred?
3. How should local deterministic retrieval work before vector search?
4. What belongs in project wake-up versus on-demand recall?
5. What should remain user-triggered rather than auto-injected?
6. What should Route 84 own after retrieval exists?

Do not introduce ChromaDB, embedding models, MCP memory tools, or MemPalace backend architecture in this route.

## This route changes

Allowed:

- docs/design/project-memory-retrieval-wakeup-recall.md
- docs/design/non-default-project-memory-store-prototype.md, Route 83 note only
- docs/design/memory-candidate-review-approval-ux.md, Route 83 note only
- docs/design/project-memory-candidate-extraction.md, Route 83 note only
- docs/design/context-engineering-continuity-baseline.md, Route 83 note only
- docs/design/edit-capability-roadmap.md, concise Route 83 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/projectMemoryRetrieval.ts
- packages/ts-shell/src/core/context/projectMemoryWakeup.ts
- packages/ts-shell/src/core/context/projectMemoryRecallCommandContract.ts
- packages/ts-shell/src/core/context/projectMemoryRecallCommandRunner.ts
- packages/ts-shell/src/core/context/projectMemoryRecallSurface.ts

Allowed if clean:

- extend `/memory` with:
  - `/memory recall <query>`
  - `/memory search <query>`
  - `/memory wake`
  - `/memory status`
- add deterministic local ranking over saved records
- add kind/source filters only if parser patterns remain simple
- add JSON/dev output if existing command conventions support it

## This route must preserve

Route-specific boundaries:

- no vector DB / ChromaDB / embedding model
- no semantic LLM rerank
- no provider/model calls
- no automatic future-turn injection of memory retrieval
- no startup cache
- no sidebar UI
- no MCP memory tools
- no automatic memory writes
- no cross-session auto-loading
- no package script/default gate changes
- no provider/MCP behavior changes
- no SessionManager schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw file content, raw recovery content, secrets, provider credentials, or hidden reasoning in recall/wake-up output
- `/memory` UX must remain simple

## Tasks

### 1. Design and audit

Create docs/design/project-memory-retrieval-wakeup-recall.md.

Include:

- MemPalace reference scan summary
- ClaudeCode/opencode/gemini-cli reference scan summary
- Route 82 store baseline
- adapted layered memory model
- deterministic retrieval strategy
- wake-up summary strategy
- recall/search command UX
- safety/redaction policy
- non-auto-injection policy
- deferred vector/semantic backend policy
- future startup/sidebar boundaries
- next-route decision criteria

### 2. Add deterministic memory retrieval

Add packages/ts-shell/src/core/context/projectMemoryRetrieval.ts.

Retrieval should read approved records from the Route 82 store and support deterministic local matching.

Expected features:

- list records
- filter by candidateKind
- filter by retentionClass
- filter by source
- query text matching over safe memoryText / structuredFact / reason / evidence labels
- simple deterministic score:
  - exact term match
  - candidateKind match
  - source match
  - recency if createdAt is available
  - confidence/safety if present
- deterministic tie-breaker by createdAt/id
- max results
- empty result handling

Required behavior:

- no vector DB
- no embeddings
- no provider/model calls
- no raw content expansion
- no secret output
- no automatic context injection

Add focused tests.

### 3. Add project wake-up builder

Add packages/ts-shell/src/core/context/projectMemoryWakeup.ts.

Wake-up should produce a compact project memory preview from saved records.

Inspired by MemPalace L0/L1, but adapted:

L0-like section:

- explicit user preference candidates if approved and safe
- stable project identity/project facts
- command discipline / user workflow preferences if approved

L1-like section:

- current project phase
- major route decisions
- capability-state facts
- blocked-by-design decisions
- validation patterns
- next likely route/phase if recorded

Required behavior:

- bounded output size
- deterministic ordering
- no raw content
- no secrets
- no hidden reasoning
- clearly says retrieval is a preview
- clearly says auto-injection is not enabled
- no persistence write

Add focused tests.

### 4. Add recall command contract

Add packages/ts-shell/src/core/context/projectMemoryRecallCommandContract.ts.

Preferred command forms:

- `/memory recall <query>`
- `/memory search <query>`
- `/memory wake`
- `/memory status`

Normal user path:

- `/memory` still lists/reviews candidates.
- `/memory recall <query>` retrieves relevant saved memories.
- `/memory wake` shows compact wake-up preview.

Avoid complex flags. If filters are supported, keep them simple and optional.

Required behavior:

- query required for recall/search
- wake needs no query
- invalid command rejected clearly
- no provider/model call
- no auto-injection

Add focused tests.

### 5. Add recall command runner

Add packages/ts-shell/src/core/context/projectMemoryRecallCommandRunner.ts.

Runner should:

- consume recall command contract
- require explicit local store harness/root
- call projectMemoryRetrieval or projectMemoryWakeup
- return structured results and rendered surface
- never persist
- never call provider/model
- never inject future-turn context
- handle missing store gracefully
- handle empty result clearly

Add focused tests.

### 6. Add recall surface renderer

Add packages/ts-shell/src/core/context/projectMemoryRecallSurface.ts.

Renderer should show:

For recall/search:

- query
- result count
- top records
- candidate kind
- retention class
- source/evidence references
- safety status
- createdAt
- score/reason summary
- “Auto-injected: no”

For wake:

- project wake-up preview
- L0-like stable facts
- L1-like essential project story
- redactions/warnings
- “Auto-injected: no”
- “Startup cache: not enabled”

Keep output concise.

Add focused tests.

### 7. Integrate with `/memory`

Extend existing `/memory` command runtime if clean.

Required behavior:

- `/memory` default remains review/list.
- `/memory recall <query>` retrieves saved records.
- `/memory search <query>` may alias recall if useful.
- `/memory wake` renders wake-up preview.
- `/memory status` may show store status if already implemented.
- missing store returns clear message.
- no normal user needs complex flags.
- no retrieval output is auto-injected into future turns.

Add focused tests.

### 8. Retrieval / wake-up tests

Required tests:

- saved approved project fact can be recalled
- saved capability-state fact appears in wake-up
- saved blocked-by-design decision appears in wake-up
- explicit user preference appears in L0-like section only if approved/safe
- rejected/pending/unsafe unsaved candidates do not appear
- query ranking is deterministic
- max results enforced
- empty query rejected for recall
- missing store handled clearly
- no raw content/secrets appear in recall output
- no provider/model call
- no auto-injection into Compact future-turn context
- `/memory wake` says startup cache / auto injection not enabled

### 9. Docs and roadmap update

Update:

- docs/design/project-memory-retrieval-wakeup-recall.md with final notes
- docs/design/non-default-project-memory-store-prototype.md with Route 83 note
- docs/design/memory-candidate-review-approval-ux.md with Route 83 note
- docs/design/project-memory-candidate-extraction.md with Route 83 note
- docs/design/context-engineering-continuity-baseline.md with Route 83 note
- docs/design/edit-capability-roadmap.md with concise status and Route 84 recommendation

Recommended next route:

- Route 84: memory invalidation/delete UX
  - if retrieval works and lifecycle control is the next safety gap
- or Route 84: memory wake-up/future-turn opt-in injection
  - if retrieval/wake-up is stable and explicit user opt-in is desired
- or Route 84: startup warm context cache
  - if wake-up preview is stable enough to seed startup

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

- retrieval requires vector DB / ChromaDB
- retrieval requires provider/model calls
- auto-injection becomes necessary
- startup cache becomes necessary
- raw content or secrets would need to appear in recall output
- store path/default persistence semantics become unclear
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
