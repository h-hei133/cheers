# Route 86: memory injection quality and merge hardening

## Goal

Harden explicit project memory future-turn injection after Route 85.

Route 85 added explicit opt-in memory injection:

- `/memory use` stages wake-up context
- `/memory use <query>` stages recall context
- next normal turn receives project memory context once
- Compact v2 context injects first, project memory context injects second
- invalidated/deleted records are excluded
- no automatic memory injection or startup auto-load

Route 86 should make memory injection robust for repeated use, larger result sets, conflicting records, compact coexistence, and long-session quality.

This route should add:

- memory injection merge policy
- memory injection quality checks
- memory injected-context budget / dedupe
- stale / deleted / invalidated record guard
- conflict detection between saved memory records
- compact + memory injection coherence checks
- repeated `/memory use` lifecycle tests
- user-facing warnings that remain simple and understandable

Do not add automatic startup loading, vector DB, semantic rerank, sidebar UI, MCP memory tools, or cross-session auto-loading.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/explicit-memory-wakeup-future-turn-injection.md
- docs/design/project-memory-invalidation-delete-ux.md
- docs/design/project-memory-retrieval-wakeup-recall.md
- docs/design/non-default-project-memory-store-prototype.md
- docs/design/compact-v2-quality-merge-hardening.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- memory save/review/delete/invalidate/recall/wake/use exists
- memory injection is explicit and one-shot
- memory injection is in-memory/session-scoped
- Compact v2 injection already has merge/quality/budget hardening
- memory injection does not yet have equivalent quality/merge hardening

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
- may exceed by 2 only for directly relevant memory merge / recall quality / context budget files

MemPalace search focus:

- wake-up
- recall
- search ranking
- layers
- budget
- context size
- invalidation
- metadata filter
- quality
- rerank

Coding-agent search focus:

- memory injection
- compact merge
- context budget
- duplicate summary
- session memory
- recall quality
- stale memory

Answer in docs/design/memory-injection-quality-merge-hardening.md:

1. How does MemPalace bound wake-up / recall output size?
2. How does it rank or filter memory records before loading?
3. How should this project merge wake and recall memory packs?
4. How should conflicting or stale memory be handled?
5. How should memory injection coexist with Compact v2 injection?
6. What remains deferred until startup cache / sidebar / vector retrieval?

## This route changes

Allowed:

- docs/design/memory-injection-quality-merge-hardening.md
- docs/design/explicit-memory-wakeup-future-turn-injection.md, Route 86 note only
- docs/design/project-memory-retrieval-wakeup-recall.md, Route 86 note only
- docs/design/project-memory-invalidation-delete-ux.md, Route 86 note only
- docs/design/compact-v2-quality-merge-hardening.md, Route 86 note only
- docs/design/context-engineering-continuity-baseline.md, Route 86 note only
- docs/design/edit-capability-roadmap.md, concise Route 86 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/projectMemoryInjectionMergePolicy.ts
- packages/ts-shell/src/core/context/projectMemoryInjectionQuality.ts
- packages/ts-shell/src/core/context/projectMemoryInjectedContextBudget.ts
- packages/ts-shell/src/core/context/projectMemoryConflictDetection.ts

## This route must preserve

Route-specific boundaries:

- no automatic memory injection
- no startup auto-load
- no cross-session auto-loading
- no vector DB / ChromaDB / embeddings
- no semantic LLM rerank
- no provider/model calls for retrieval/ranking
- no MCP memory tools
- no sidebar UI
- no startup cache
- no package script/default gate changes
- no provider/MCP behavior changes
- no SessionManager schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw file content, raw recovery content, secrets, provider credentials, or hidden reasoning in injected memory context
- invalidated/deleted records must not be injected
- `/memory` UX must stay simple

## Tasks

### 1. Design and audit

Create docs/design/memory-injection-quality-merge-hardening.md.

Include:

- MemPalace reference scan summary
- coding-agent reference scan summary
- Route 85 baseline
- repeated `/memory use` risks
- merge policy
- quality check policy
- budget/dedupe policy
- conflict/stale memory policy
- Compact v2 coexistence model
- redaction and safety policy
- deferred startup/vector/sidebar boundaries
- next-route decision criteria

### 2. Add memory injection merge policy

Add packages/ts-shell/src/core/context/projectMemoryInjectionMergePolicy.ts.

Policy should handle:

- no previous pending memory injection
- previous pending wake injection
- previous pending recall injection
- second `/memory use` before next normal turn
- `/memory use` after consumed injection
- wake pack plus recall pack
- repeated query recall
- new saved records after prior wake
- invalidated/deleted records after pending injection was staged

Required behavior:

- latest explicit `/memory use` wins for conflicting staged injection
- compatible wake + recall facts can merge only if safe and deterministic
- invalidated/deleted records are removed before injection
- duplicate records are deduped by record id
- stale pending injection is blocked if selected records changed lifecycle state
- warnings explain superseded/stale/filtered records
- no raw content or secrets

Add focused tests.

### 3. Add memory injection quality checks

Add packages/ts-shell/src/core/context/projectMemoryInjectionQuality.ts.

Quality checks should report:

- hasRecords
- hasSafeRecordsOnly
- excludesInvalidatedRecords
- excludesDeletedRecords
- hasEvidenceReferences
- hasMode
- hasNextAction
- hasNoRawContentLeak
- hasNoSecretLeak
- hasNoHiddenReasoningLeak
- hasNoAutomaticInjectionClaim
- hasNoStartupAutoloadClaim
- hasNoProviderRetrievalClaim
- conflictStatus
- estimatedSize / overBudget warning

Output:

- qualityStatus:
  - "pass"
  - "warn"
  - "fail"
- warnings
- blockers
- evidence

Quality fail should block injection. Warn may inject only if safety checks pass.

Add focused tests.

### 4. Add injected memory context budget / dedupe helper

Add packages/ts-shell/src/core/context/projectMemoryInjectedContextBudget.ts.

It should:

- cap injected memory context length by section or total characters
- summarize long record lists with counts and first N records
- preserve critical facts:
  - source command
  - injection mode
  - selected records
  - project facts
  - user preference facts
  - capability facts
  - route decisions
  - validation patterns
  - blocked-by-design decisions
  - evidence references
  - safety caveats
- dedupe repeated facts
- avoid repeated wake/recall headers
- never trim away safety caveats
- never imply unsupported memory features

Add focused tests.

### 5. Add memory conflict detection

Add packages/ts-shell/src/core/context/projectMemoryConflictDetection.ts.

Detect simple deterministic conflicts such as:

- same candidate kind / source but contradictory memory text if clear
- same route decision with different final decision
- same capability state with incompatible status
- same user preference with conflicting preference values
- invalidated record selected by stale pending injection
- deleted record selected by stale pending injection

Keep detection conservative:

- do not use provider/model calls
- do not infer conflicts from vague text
- return warning when uncertain
- quality fail only for clear unsafe conflict

Add focused tests.

### 6. Integrate quality / merge / budget into memory injection planner

Update projectMemoryFutureTurnInjection.ts and related adapter/formatter.

Required behavior:

- merge pending/staged facts before injection
- filter invalidated/deleted records immediately before injection
- run conflict detection
- run quality checks
- apply budget/dedupe
- quality fail blocks injection and marks injection invalid
- quality warn injects only if safety checks pass
- injection state consumed only after successful injection
- repeated `/memory use` preserves one-shot behavior
- Compact v2 injection remains first, memory injection second

Add focused tests.

### 7. Harden `/memory use` repeated behavior

Update projectMemoryUseCommandRunner and command runtime as needed.

Required behavior:

- first `/memory use` stages pending memory injection
- second `/memory use` supersedes first pending memory injection
- `/memory use <query>` after `/memory use` uses latest explicit command
- `/memory use` after consumed injection creates fresh pending injection
- output stays simple
- warnings are concise
- no complex flags for normal users

Add focused tests.

### 8. Lifecycle and runtime tests

Required tests:

- `/memory use` then normal turn injects once
- `/memory use` twice then normal turn injects only latest
- consumed injection does not repeat
- invalidated record after staging blocks or filters injection before consume
- deleted record after staging blocks or filters injection before consume
- over-budget context preserves safety facts
- duplicate records are deduped
- clear conflicting memory blocks injection or warns safely
- quality failure marks injection invalid and does not consume as success
- Compact v2 and memory injection coexist in deterministic order
- no raw content/secrets/hidden reasoning leak
- no startup auto-load claim
- no provider/model retrieval claim

### 9. Surface updates

Update projectMemoryInjectionSurface.ts if needed.

Surface should show:

- pending / injected / consumed / invalid / superseded
- quality status
- filtered records
- conflict warnings
- over-budget warnings
- next action
- “Automatic memory injection: no”
- “Startup auto-load: no”
- “Provider retrieval: no”

Keep output concise.

Add focused tests.

### 10. Docs and roadmap update

Update:

- docs/design/memory-injection-quality-merge-hardening.md with final notes
- docs/design/explicit-memory-wakeup-future-turn-injection.md with Route 86 note
- docs/design/project-memory-retrieval-wakeup-recall.md with Route 86 note
- docs/design/project-memory-invalidation-delete-ux.md with Route 86 note
- docs/design/compact-v2-quality-merge-hardening.md with Route 86 note
- docs/design/context-engineering-continuity-baseline.md with Route 86 note
- docs/design/edit-capability-roadmap.md with concise status and Route 87 recommendation

Recommended next route:

- Route 87: startup warm context cache design/prototype
  - if memory injection quality is stable
- or Route 87: sidebar state model
  - if edit/compact/memory state surfaces are stable enough
- or Route 87: memory retrieval quality/ranking hardening
  - if deterministic recall quality is the next blocker

## Validation

Route-specific final validation:

- focused tests for touched core/context command/session/runtime modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad `src/core/shell` or `src/session` paths expose unrelated failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- merge/quality requires provider/model calls
- conflict detection requires fuzzy LLM reasoning
- vector DB / ChromaDB becomes necessary
- startup cache becomes necessary
- auto memory injection becomes necessary
- SessionManager schema changes become necessary
- invalidated/deleted records cannot be reliably excluded
- budget trimming would remove critical safety facts
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
