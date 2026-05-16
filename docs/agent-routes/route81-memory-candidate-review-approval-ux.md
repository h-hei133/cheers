# Route 81: memory candidate review and approval UX

## Goal

Build the user-operable review and approval surface for project memory candidates before adding any persistent memory store.

Route 80 added:

- project memory candidate model
- deterministic extractor
- quality checks
- surface renderer
- non-persistent candidate preview in `/compact`

Route 81 should make those candidates actionable:

- users can review memory candidates
- users can approve candidates
- users can reject candidates
- approvals/rejections are session-scoped only
- approved candidates are not persisted yet
- rejected candidates do not delete persistent memory because no memory store exists yet
- `/memory` is the simple user-facing entrypoint

This route should use MemPalace as a specialized memory reference, but must not copy its full architecture or add a real memory backend yet.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/project-memory-candidate-extraction.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-quality-merge-hardening.md
- docs/design/edit-capability-roadmap.md

Current phase baseline:

- Compact v2 future-turn injection works.
- Repeated `/compact` merge/quality/budget is hardened.
- Project memory candidates can be extracted.
- `/compact` can preview memory candidates.
- No memory review/approval UX exists yet.
- No persistent memory store exists.
- No cross-session memory loading exists.

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
- may exceed by 2 only for a directly relevant memory review / approval / command file

MemPalace search focus:

- memory layers
- wake-up
- recall
- search
- backend interface
- mine
- sweep
- agent diary
- MCP tools
- local-first
- identity
- wing / room / drawer

Coding-agent search focus:

- memory
- command
- slash command
- compact
- preference
- project facts
- session facts
- context memory

Answer in docs/design/memory-candidate-review-approval-ux.md:

1. What should be borrowed from MemPalace conceptually?
2. How should this project adapt “layered memory” without copying the palace metaphor blindly?
3. Which facts should become project memory candidates versus session-only facts?
4. How should review/approval happen before persistence?
5. What should remain deferred until a memory store route?
6. What should remain deferred until retrieval / wake-up / recall routes?

MemPalace concepts to evaluate:

- local-first memory
- verbatim/evidence-first storage
- layered loading / wake-up versus deep search
- backend abstraction
- scoped memory organization
- agent diary / per-agent memory ideas
- CLI/MCP tool surface

Do not add MemPalace-style vector DB, palace hierarchy, ChromaDB, persistent backend, or MCP memory tools in this route.

## This route changes

Allowed:

- docs/design/memory-candidate-review-approval-ux.md
- docs/design/project-memory-candidate-extraction.md, Route 81 note only
- docs/design/context-engineering-continuity-baseline.md, Route 81 note only
- docs/design/edit-capability-roadmap.md, concise Route 81 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/projectMemoryReviewState.ts
- packages/ts-shell/src/core/context/projectMemoryReviewCommandContract.ts
- packages/ts-shell/src/core/context/projectMemoryReviewCommandRunner.ts
- packages/ts-shell/src/core/context/projectMemoryReviewSurface.ts

Allowed if clean:

- register `/memory`
- add a concise `/compact` hint pointing users to `/memory`
- add dev/test structured output if existing command conventions already support it

## This route must preserve

Route-specific boundaries:

- no persistent memory store
- no vector DB / ChromaDB integration
- no MemPalace backend implementation
- no automatic memory writes
- no cross-session memory loading
- no retrieval / wake-up / recall implementation
- no startup cache
- no sidebar UI
- no provider/MCP behavior changes
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw file content, raw recovery content, secrets, provider credentials, or hidden reasoning in memory review state
- approved candidates are session-scoped decisions only
- rejected candidates are session-scoped decisions only
- `/memory` must stay simple for normal users

## Tasks

### 1. Design and audit

Create docs/design/memory-candidate-review-approval-ux.md.

Include:

- MemPalace reference scan summary
- ClaudeCode/opencode/gemini-cli reference scan summary
- Route 80 candidate extraction baseline
- review UX model
- approval UX model
- rejection UX model
- session-scoped decision model
- candidate categories
- safety and redaction guarantees
- MemPalace concepts adopted conceptually
- MemPalace concepts deferred or rejected
- why persistence is deferred
- future memory store boundary
- future retrieval / wake-up / recall boundary
- next-route decision criteria

### 2. Add session-scoped memory review state

Add packages/ts-shell/src/core/context/projectMemoryReviewState.ts.

Expected concepts:

- reviewSessionId
- candidateId
- decision:
  - "pending"
  - "approved"
  - "rejected"
  - "needs-review"
  - "unsafe"
  - "superseded"
- decidedAt
- reason
- sourceCommand:
  - "/compact"
  - "/memory"
  - "internal"
- latest candidates
- approved candidates
- rejected candidates
- unsafe candidates
- superseded candidates

Required behavior:

- in-memory/session-scoped only
- deterministic clock/id injection for tests
- no persistence
- no provider/model calls
- no raw content/secrets
- approval does not write memory
- rejection does not delete persistent memory
- superseded candidates remain auditable in session state if clean

Add focused tests.

### 3. Add memory review command contract

Add packages/ts-shell/src/core/context/projectMemoryReviewCommandContract.ts.

Preferred command modes:

- "list"
- "review"
- "approve"
- "reject"
- "status"

Normal user default:

- `/memory` lists/reviews current candidates and decisions.

Advanced/dev forms may exist if parser supports them cleanly:

- approve by candidate id
- reject by candidate id
- approve all safe candidates
- reject unsafe candidates

Required behavior:

- default mode is non-mutating list/review
- approve/reject only mutate session-scoped review state
- invalid candidate ids are rejected
- unsafe candidates cannot be approved by default
- ambiguous user-preference candidates require explicit review
- no persistence

Add focused tests.

### 4. Add memory review command runner

Add packages/ts-shell/src/core/context/projectMemoryReviewCommandRunner.ts.

Runner should:

- consume memory review command contract
- consume current memory candidates from Route 80 extraction
- apply projectMemoryCandidateQuality
- update session-scoped review state for approve/reject
- return structured result and/or rendered output
- never persist
- never call provider/model
- never inject future-turn context directly
- never claim memory was written

Add focused tests.

### 5. Add memory review surface renderer

Add packages/ts-shell/src/core/context/projectMemoryReviewSurface.ts.

Renderer should show:

- pending candidates
- approved session-scoped candidates
- rejected candidates
- unsafe/rejected-by-policy candidates
- user-preference candidates needing explicit review
- project-scoped candidates
- session-only facts
- redactions
- “Memory written: no”
- “Persistence: not enabled”
- short next action

The output should be concise and understandable.

MemPalace-inspired wording is allowed only if it helps clarity. Do not introduce palace/wing/room/drawer terms into user output unless the design doc explicitly justifies it.

Add focused tests.

### 6. Register `/memory` if clean

Register `/memory` through the existing command registry if clean.

Preferred UX:

- `/memory` shows current candidates and review status.
- It does not write persistent memory.
- It does not require flags for normal review.
- Approve/reject forms, if supported, should be simple and discoverable from the output.

If command registration is coupled:

- keep command runner/surface fully tested
- document blocker
- recommend follow-up command polish

### 7. Integrate with `/compact` candidate preview

If clean:

- `/compact` output should mention that candidates can be reviewed with `/memory`
- do not make `/compact` output noisy
- do not auto-approve anything
- do not persist anything
- do not inject approved candidates as future memory yet

Add focused tests if touched.

### 8. Add review / approval tests

Required tests:

- `/memory` default lists candidates
- approve candidate marks it approved in session review state
- reject candidate marks it rejected
- invalid candidate id is rejected
- unsafe candidate is not approved by default
- explicit user-preference candidate requires review
- ambiguous preference remains not approved
- approved candidate is not persisted
- rejected candidate is not persisted
- no raw content/secrets appear in review output
- `/compact` points to `/memory` if integrated
- “Memory written: no” appears in review output
- MemPalace-inspired concepts remain design-level only; no backend/store is added

### 9. Docs and roadmap update

Update:

- docs/design/memory-candidate-review-approval-ux.md with final notes
- docs/design/project-memory-candidate-extraction.md with Route 81 note
- docs/design/context-engineering-continuity-baseline.md with Route 81 note
- docs/design/edit-capability-roadmap.md with concise status and Route 82 recommendation

Recommended next route:

- Route 82: Project memory store prototype
  - only after review/approval UX is stable
  - should add a non-default local store interface/prototype
  - should preserve review-before-write
- or Route 82: Memory review command polish
  - if command registration/review UX was partial

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

- approval UX requires persistent memory storage
- command integration requires broad cli.tsx rewrite
- SessionManager schema changes become necessary
- provider/model calls become necessary
- raw content or secrets would need to enter review state
- automatic memory writes become necessary
- user preference memory would be inferred without explicit signal
- MemPalace-style backend/vector DB integration becomes necessary
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
