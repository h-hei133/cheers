# Route 79: Compact v2 injection quality and merge hardening

## Goal

Harden Compact v2 future-turn injection after Route 78.

Route 78 wired real future-turn injection:

- `/compact` creates a pending live checkpoint
- next normal model turn receives compact-safe injected context once
- original user prompt is still persisted unchanged
- no persistence, memory, sidebar, startup cache, provider/MCP, SessionManager schema, edit runtime, automatic recovery, or atomic rollback changes

Route 79 should make repeated compact and long-session use robust:

- prevent recursive compact bloat
- dedupe repeated injected context
- merge repeated compact checkpoints safely
- preserve latest mutation/recovery/validation facts
- avoid stale checkpoint overriding newer route facts
- add quality checks for compact packets and injected context
- add lifecycle tests for repeated `/compact` and long-session coherence

Do not add memory storage. Do not add startup cache. Do not add sidebar UI. Do not change provider/model APIs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/compact-v2-future-turn-injection.md
- docs/design/compact-live-checkpoint-future-turn-adapter.md
- docs/design/compact-v2-session-integration.md
- docs/design/compact-v2-route-continuity.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- Compact v2 command surface exists.
- Live checkpoint exists.
- Future-turn adapter exists.
- Future-turn injection is wired and consumed once per checkpoint.
- Repeated compact / merge quality is the remaining risk.

## Reference scan

Do a bounded scan before code edits.

Reference repos:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- 12 files total by default
- may exceed by 2 only for directly relevant compact merge / repeated compaction / session-history files

Search focus:

- compact merge
- repeated compact
- compaction quality
- post compact
- summary injection
- session history
- conversation compression
- duplicate summary
- resume context

Answer in docs/design/compact-v2-quality-merge-hardening.md:

1. How do references prevent repeated compact summaries from bloating context?
2. How do they merge or replace previous compact summaries?
3. How do they preserve latest tool/edit facts after compaction?
4. What quality checks exist before accepting compacted context?
5. What local merge policy should this project use before memory exists?

## This route changes

Allowed:

- docs/design/compact-v2-quality-merge-hardening.md
- docs/design/compact-v2-future-turn-injection.md, Route 79 note only
- docs/design/compact-live-checkpoint-future-turn-adapter.md, Route 79 note only
- docs/design/compact-v2-route-continuity.md, Route 79 note only
- docs/design/context-engineering-continuity-baseline.md, Route 79 note only
- docs/design/edit-capability-roadmap.md, concise Route 79 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/compactInjectionMergePolicy.ts
- packages/ts-shell/src/core/context/compactContinuityQuality.ts
- packages/ts-shell/src/core/context/compactInjectedContextBudget.ts

## This route must preserve

Route-specific boundaries:

- no memory system
- no persistent storage
- no startup cache
- no sidebar UI
- no provider/MCP behavior changes
- no package script/default gate changes
- no SessionManager persistence schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw recovery content, raw original content, secrets, provider credentials, or hidden reasoning in checkpoint, merge, quality, or injected context
- `/compact` remains simple for users

## Tasks

### 1. Design and audit

Create docs/design/compact-v2-quality-merge-hardening.md.

Include:

- reference scan summary
- current Route 78 injection behavior
- repeated compact risk map
- merge policy
- stale checkpoint policy
- injected context budget policy
- quality check policy
- long-session coherence model
- what Route 80 memory candidate extraction should own instead

### 2. Add compact merge policy

Add packages/ts-shell/src/core/context/compactInjectionMergePolicy.ts.

Policy should handle:

- no previous checkpoint
- previous checkpoint pending
- previous checkpoint injected
- previous checkpoint consumed
- previous checkpoint superseded
- new `/compact` after normal turns
- new `/compact` after mutation evidence changed
- new `/compact` after validation evidence changed

Required behavior:

- latest checkpoint wins for conflicting facts
- stable compact survivor facts can carry forward
- blocked-by-design facts must survive
- recovery references survive only as references
- old warnings/redactions may be carried only if still relevant
- no nested compact markdown blocks
- no recursive “previous compact handoff” bloat
- no raw content or secrets

Add focused tests.

### 3. Add compact continuity quality checks

Add packages/ts-shell/src/core/context/compactContinuityQuality.ts.

Quality checks should report:

- hasTaskGoal
- hasNextAction
- hasEditCapabilityFacts
- hasBlockedByDesignFacts
- hasMutationEvidence, if expected
- hasRecoverySummary, if expected
- hasValidationEvidence
- hasRedactionEvidence
- hasNoRawContentLeak
- hasNoSecretLeak
- hasNoAutomaticRecoveryClaim
- hasNoAtomicRollbackClaim
- estimatedSize / overBudget warning

Output:

- qualityStatus:
  - "pass"
  - "warn"
  - "fail"
- score or checklist
- warnings
- blockers
- evidence

Quality checks must not call provider/model or persist.

Add focused tests.

### 4. Add injected context budget / dedupe helper

Add packages/ts-shell/src/core/context/compactInjectedContextBudget.ts.

It should:

- cap rendered injected context length by section or total characters
- summarize long file lists with counts and first N entries
- dedupe repeated facts
- avoid repeated compact headers
- preserve critical facts even when trimming:
  - task/route
  - next action
  - constraints
  - blocked-by-design facts
  - recovery explicit-only facts
  - validation status
- never trim in a way that implies unsupported capabilities

Add focused tests.

### 5. Integrate merge / quality / budget into injection planner

Update compactFutureTurnInjection.ts and related formatter/adapter.

Required behavior:

- before injection, merge latest checkpoint with prior compact continuity facts if provided by session-scoped checkpoint state
- run quality checks
- if quality fails, do not inject and surface warning
- if quality warns, inject only if safety checks pass
- apply budget/dedupe before final injected context
- mark checkpoint injected/consumed only when injection succeeds
- avoid duplicate injection for same checkpoint
- preserve existing Route 78 once-per-checkpoint behavior

Add focused tests.

### 6. Harden `/compact` repeated-use behavior

Update compact command runtime / live checkpoint logic.

Required behavior:

- first `/compact` creates pending checkpoint
- second `/compact` before normal turn supersedes first checkpoint
- `/compact` after prior checkpoint consumed creates fresh pending checkpoint
- repeated `/compact` output remains simple
- JSON/dev output can expose quality/merge metadata if existing patterns support it
- no user-facing flag complexity

Add focused tests.

### 7. Long-session injection tests

Add focused lifecycle tests.

Required scenarios:

- `/compact` then normal turn injects once
- `/compact` twice then normal turn injects only latest
- `/compact`, normal turn, normal turn does not reinject
- `/compact`, injected context over budget, budget helper preserves critical facts
- new mutation evidence then `/compact` produces updated checkpoint
- stale checkpoint does not overwrite newer mutation evidence
- quality failure blocks injection and reports warning
- no raw content/secrets leak in merged/injected context
- no automatic recovery / atomic rollback claims

### 8. Docs and roadmap update

Update:

- docs/design/compact-v2-quality-merge-hardening.md with final notes
- docs/design/compact-v2-future-turn-injection.md with Route 79 note
- docs/design/compact-live-checkpoint-future-turn-adapter.md with Route 79 note
- docs/design/compact-v2-route-continuity.md with Route 79 note
- docs/design/context-engineering-continuity-baseline.md with Route 79 note
- docs/design/edit-capability-roadmap.md with concise status and Route 80 recommendation

Recommended next route:

- Route 80: Project memory candidate extraction
  - only after Compact v2 injection quality/merge is stable

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

- merge policy requires persistent memory
- quality checks require provider/model calls
- session integration requires SessionManager schema changes
- budget/dedupe would remove critical safety facts
- raw content or secrets would need to be persisted or injected
- `/compact` UX becomes flag-heavy or confusing
- provider/MCP changes become necessary

## Final report

1. What changed
2. Reference scan summary
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.
