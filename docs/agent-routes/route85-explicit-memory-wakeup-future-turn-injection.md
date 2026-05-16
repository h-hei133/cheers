# Route 85: explicit memory wake-up and future-turn injection

## Goal

Add explicit opt-in memory wake-up / future-turn injection after memory lifecycle controls.

Route 82 added explicit local project memory save.
Route 83 added deterministic recall / search / wake-up preview.
Route 84 added invalidation / delete UX so stale or wrong memories can be removed before they affect future context.

Route 85 should make saved project memory usable in future turns, but only when the user explicitly asks.

Target behavior:

- `/memory wake` remains a preview command.
- `/memory recall <query>` remains a preview command.
- `/memory use` stages a compact wake-up memory context for the next normal turn.
- `/memory use <query>` stages deterministic recall results for the next normal turn.
- staged memory is injected once into the next normal model turn.
- invalidated/deleted records are excluded.
- no automatic memory injection.
- no startup auto-load.
- no vector DB / ChromaDB / embeddings.
- no provider/model calls for retrieval.
- no persistent injection state beyond current session.

This route should integrate with the existing Compact v2 future-turn injection pattern where possible, but memory injection must remain separately gated and explicitly user-triggered.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/project-memory-invalidation-delete-ux.md
- docs/design/project-memory-retrieval-wakeup-recall.md
- docs/design/non-default-project-memory-store-prototype.md
- docs/design/memory-candidate-review-approval-ux.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-future-turn-injection.md
- docs/design/compact-v2-quality-merge-hardening.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/memory save` writes approved safe records to explicit local store.
- `/memory recall` and `/memory search` preview deterministic retrieval.
- `/memory wake` previews project wake-up memory.
- `/memory invalidate` and `/memory delete` control stale or wrong records.
- Compact v2 already has future-turn checkpoint injection.
- memory records are not auto-injected yet.

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
- may exceed by 2 only for a directly relevant wake-up / recall / context injection file

MemPalace search focus:

- wake-up
- recall
- search
- layers
- identity
- MCP recall
- CLI wake-up
- agent diary
- context injection

Coding-agent search focus:

- memory injection
- context injection
- compact injection
- wake-up
- resume
- session memory
- command
- future turn

Answer in docs/design/explicit-memory-wakeup-future-turn-injection.md:

1. How does MemPalace separate wake-up, recall, and deep search?
2. What should this project copy conceptually for explicit memory injection?
3. How should memory injection coexist with Compact v2 injection?
4. How should invalidated/deleted records be excluded?
5. What remains deferred: automatic startup loading, vector retrieval, sidebar, MCP tools?

Do not add MemPalace backend/vector DB/ChromaDB/MCP tooling in this route.

## This route changes

Allowed:

- docs/design/explicit-memory-wakeup-future-turn-injection.md
- docs/design/project-memory-invalidation-delete-ux.md, Route 85 note only
- docs/design/project-memory-retrieval-wakeup-recall.md, Route 85 note only
- docs/design/non-default-project-memory-store-prototype.md, Route 85 note only
- docs/design/context-engineering-continuity-baseline.md, Route 85 note only
- docs/design/edit-capability-roadmap.md, concise Route 85 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/projectMemoryInjectionState.ts
- packages/ts-shell/src/core/context/projectMemoryFutureTurnAdapter.ts
- packages/ts-shell/src/core/context/projectMemoryInjectedContextFormatter.ts
- packages/ts-shell/src/core/context/projectMemoryFutureTurnInjection.ts
- packages/ts-shell/src/core/context/projectMemoryUseCommandContract.ts
- packages/ts-shell/src/core/context/projectMemoryUseCommandRunner.ts
- packages/ts-shell/src/core/context/projectMemoryInjectionSurface.ts

Allowed if clean:

- extend `/memory` with:
  - `/memory use`
  - `/memory use <query>`
- integrate memory injection into existing ShellSessionRuntime next-normal-turn path
- reuse Compact v2 injection patterns without merging the two states
- expose memory injection pending / injected / consumed status in session surface

## This route must preserve

Route-specific boundaries:

- no automatic memory injection
- no startup auto-load
- no cross-session auto-loading
- no vector DB / ChromaDB / embeddings
- no provider/model calls for retrieval or ranking
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

Create docs/design/explicit-memory-wakeup-future-turn-injection.md.

Include:

- MemPalace reference scan summary
- coding-agent reference scan summary
- Route 82/83/84 memory baseline
- explicit opt-in injection model
- `/memory use` UX
- wake-up injection model
- recall injection model
- Compact v2 injection coexistence
- invalidated/deleted filtering
- redaction and safety policy
- no automatic startup loading
- deferred vector/semantic retrieval
- next-route decision criteria

### 2. Add memory injection state

Add packages/ts-shell/src/core/context/projectMemoryInjectionState.ts.

Expected concepts:

- injectionStatus:
  - "none"
  - "pending"
  - "injected"
  - "consumed"
  - "invalid"
  - "superseded"
- memoryInjectionId
- sourceCommand:
  - "/memory use"
  - "internal"
- mode:
  - "wake"
  - "recall"
- query, optional
- recordIds
- createdAt
- injectedAt
- consumedAt
- warnings
- redactions

Required behavior:

- session-scoped and in-memory only
- deterministic clock/id injection for tests
- second `/memory use` supersedes previous pending injection
- consumed injection does not repeat
- no persistence
- no provider/model calls

Add focused tests.

### 3. Add memory future-turn adapter

Add packages/ts-shell/src/core/context/projectMemoryFutureTurnAdapter.ts.

Adapter should consume:

- wake-up preview from projectMemoryWakeup
- recall results from projectMemoryRetrieval
- source store metadata
- invalidation/delete filtering already applied by store/retrieval
- optional constraints from context projection

Expected output:

- adapterVersion
- injectionId
- mode:
  - "wake"
  - "recall"
- modelFacingMemorySummary
- structuredFacts:
  - stable project facts
  - user preference facts if approved/safe
  - capability-state facts
  - route decisions
  - validation patterns
  - blocked-by-design decisions
  - source/evidence references
- excludedRecords
- redactions
- warnings
- injectionStatus:
  - "candidate"
  - "safe-to-inject"
  - "blocked"

Required behavior:

- no provider/model calls
- no raw content/secrets
- no hidden reasoning
- invalidated/deleted records excluded
- no automatic recovery / rollback implication
- deterministic output

Add focused tests.

### 4. Add injected memory context formatter

Add packages/ts-shell/src/core/context/projectMemoryInjectedContextFormatter.ts.

Formatter should produce concise model-facing memory context.

Required sections:

- Project memory context
- Source:
  - explicit `/memory use`
- Mode:
  - wake or recall
- Stable project facts
- Relevant recalled facts
- Constraints / caveats
- Evidence references
- Redactions/warnings
- Not enabled:
  - automatic memory injection
  - startup auto-load
  - vector search
  - provider/model retrieval

Must exclude:

- raw file content
- raw recovery content
- secrets
- provider credentials
- hidden reasoning

Add focused tests.

### 5. Add memory future-turn injection planner

Add packages/ts-shell/src/core/context/projectMemoryFutureTurnInjection.ts.

Planner should:

- consume latest pending memory injection state
- consume local store/read results
- call wake-up or recall adapter
- format injected context
- return:
  - shouldInject
  - injectedContext
  - updatedInjectionState
  - warnings
  - evidence
- inject once per pending memory injection
- skip injection when:
  - no pending memory injection
  - store missing
  - no records found
  - all records invalidated/deleted
  - adapter blocks unsafe content
  - injection already consumed
- never persist
- never call provider/model
- never alter memory store
- never alter edit/runtime state

Add focused tests.

### 6. Add `/memory use` command contract and runner

Add:

- packages/ts-shell/src/core/context/projectMemoryUseCommandContract.ts
- packages/ts-shell/src/core/context/projectMemoryUseCommandRunner.ts

Command forms:

- `/memory use`
  - stages wake-up memory context for next normal turn
- `/memory use <query>`
  - stages deterministic recall results for next normal turn

Required behavior:

- default `/memory` remains review/list
- `/memory wake` remains preview only
- `/memory recall <query>` remains preview only
- `/memory use` is explicit injection staging
- missing store handled clearly
- empty store handled clearly
- invalidated/deleted records excluded
- second `/memory use` supersedes first pending memory injection
- no provider/model call
- no persistence write

Add focused tests.

### 7. Integrate with `/memory` command runtime

Update memoryCommandRuntime if clean.

Required behavior:

- `/memory use` routes to use runner
- output says memory context is staged for next normal turn
- output says auto-injection is still off except for this explicit staged use
- `/memory` UX remains simple
- no complex flags for normal users

Add focused tests.

### 8. Wire next-normal-turn memory injection

Add a narrow hook to the same next-normal-turn path used by Compact v2 injection if clean.

Required behavior:

- pending memory injection is injected once into next normal model turn
- command-only turns do not consume injection unless local runtime treats them as model turns
- memory injection coexists with Compact v2 injection
- if both compact and memory injection are pending, order should be deterministic:
  - Compact continuity first
  - memory context second
- consumed memory injection does not repeat
- new `/memory use` creates fresh pending injection
- original user prompt persistence remains unchanged
- no SessionManager schema change

If direct runtime wiring is too coupled:

- implement planner and test-only adapter
- document runtime blocker
- recommend follow-up
- but attempt wiring first

Add focused tests.

### 9. Add memory injection surface

Add packages/ts-shell/src/core/context/projectMemoryInjectionSurface.ts.

Surface should show:

- no pending memory injection
- memory injection pending
- memory injection injected
- memory injection consumed
- memory injection superseded
- blocked injection
- records selected
- mode/query
- redactions/warnings
- next action

Keep output concise.

Add focused tests.

### 10. Integration tests

Required tests:

- `/memory use` stages wake-up memory injection
- `/memory use <query>` stages recall memory injection
- next normal turn receives memory injected context once
- second normal turn does not reinject
- second `/memory use` supersedes pending injection
- invalidated record is not injected
- deleted record is not injected
- empty store blocks injection clearly
- missing store handled clearly
- raw content/secrets redacted
- compact injection and memory injection coexist deterministically
- original user prompt persistence remains unchanged
- no provider/model calls
- no automatic startup loading
- no memory injection unless `/memory use` was called

### 11. Docs and roadmap update

Update:

- docs/design/explicit-memory-wakeup-future-turn-injection.md with final notes
- docs/design/project-memory-invalidation-delete-ux.md with Route 85 note
- docs/design/project-memory-retrieval-wakeup-recall.md with Route 85 note
- docs/design/non-default-project-memory-store-prototype.md with Route 85 note
- docs/design/context-engineering-continuity-baseline.md with Route 85 note
- docs/design/edit-capability-roadmap.md with concise status and Route 86 recommendation

Recommended next route:

- Route 86: memory injection quality / merge hardening
  - if explicit injection works
- or Route 86: memory startup warm cache design
  - if injection is stable and startup experience is next
- or Route 86: sidebar state model
  - if memory/compact/edit surfaces are stable enough to expose

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

- memory injection requires provider/model API changes
- memory injection requires SessionManager schema changes
- memory injection requires startup cache
- memory injection requires automatic loading
- memory injection requires vector DB / ChromaDB
- raw content or secrets would need to be injected
- invalidated/deleted records cannot be reliably excluded
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
