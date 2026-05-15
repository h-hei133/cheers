# Route 78: Compact v2 future-turn injection

## Goal

Wire actual future-turn injection for Compact v2.

Route 76 made `/compact` user-operable. Route 77 made `/compact` create a live session-scoped Compact v2 checkpoint and added a future-turn adapter, but did not inject it into model/query context.

Route 78 should now connect that adapter to the next-turn query continuity path:

- after `/compact`, the latest live checkpoint becomes eligible for future-turn injection
- the next normal user/model turn receives compact-safe continuity context
- injection is explicit, bounded, redacted, and idempotent
- the user command stays simple: `/compact`
- no complicated user flags are required for normal use
- injected context must preserve task/route, edit closeout, mutation evidence, recovery references, validation status, constraints, redactions, and next action
- injected context must not include raw recovery content, raw original content, secrets, provider credentials, or hidden reasoning

This route should make Compact v2 operational for continuation, not merely render handoff text.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-route-continuity.md
- docs/design/compact-v2-session-integration.md
- docs/design/compact-live-checkpoint-future-turn-adapter.md
- docs/design/edit-capability-roadmap.md

Current phase baseline:

- `/compact` and `/handoff` exist.
- `/compact` creates/updates latest live Compact v2 checkpoint.
- `compactFutureTurnAdapter.ts` can produce candidate model-facing context.
- current adapter status is candidate-only / not-injected.
- actual future-turn injection is not yet wired.
- no memory system, sidebar UI, startup cache, or SessionManager schema change exists.

## Reference scan

Do a bounded scan before code edits.

Reference repos:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- 12 files total by default
- may exceed by 2 only for a directly relevant compact/session/query injection file

Search focus:

- compact injection
- post compact messages
- resume
- query context
- session messages
- conversation state
- history rewrite
- context adapter
- compression service

Answer in docs/design/compact-v2-future-turn-injection.md:

1. How do references inject compacted summaries into future turns?
2. Do they rewrite history, append summary messages, or maintain side-channel state?
3. How do they avoid duplicate injection?
4. How do they separate user-visible compact output from model-facing compact context?
5. What is the smallest safe local injection path for this project?

## This route changes

Allowed:

- docs/design/compact-v2-future-turn-injection.md
- docs/design/compact-live-checkpoint-future-turn-adapter.md, Route 78 note only
- docs/design/compact-v2-session-integration.md, Route 78 note only
- docs/design/compact-v2-route-continuity.md, Route 78 note only
- docs/design/context-engineering-continuity-baseline.md, Route 78 note only
- docs/design/edit-capability-roadmap.md, concise Route 78 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/compactFutureTurnInjection.ts
- packages/ts-shell/src/core/context/compactInjectionState.ts
- packages/ts-shell/src/core/context/compactInjectedContextFormatter.ts

Allowed if clean:

- narrow hook into existing query/session runtime context construction
- narrow hook into command runtime to mark latest checkpoint injection-eligible after `/compact`
- narrow session surface status showing checkpoint injected / pending / consumed

## This route must preserve

Route-specific boundaries:

- no memory system
- no persistent memory storage
- no sidebar UI
- no startup cache
- no provider/MCP behavior changes
- no package script/default gate changes
- no SessionManager persistence schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw recovery content, raw original content, secrets, provider credentials, or hidden reasoning in injected context
- no broad cli.tsx rewrite
- no rewrite of full live session history unless the existing compact/session path already supports it cleanly
- `/compact` remains simple for users

## Tasks

### 1. Design and audit

Create docs/design/compact-v2-future-turn-injection.md.

Include:

- reference scan summary
- current Route 77 checkpoint/adaptor behavior
- current query/session context audit
- chosen injection architecture
- user-visible vs model-facing compact context
- injection lifecycle
- idempotency / duplicate prevention
- redaction and safety guarantees
- rollback plan if injection cannot be cleanly wired
- deferred memory/sidebar/startup work
- next-route decision criteria

### 2. Audit query/session context construction

Audit existing query/session runtime path before editing.

Document findings in the design note:

- where user prompt is transformed into model/query input
- where session/runtime context is assembled
- whether a side-channel continuity context can be attached
- where command outputs are handled
- where `/compact` command result currently returns
- where a pending compact checkpoint can be consumed on the next normal turn
- what must remain deferred

### 3. Add Compact future-turn injection state

Add packages/ts-shell/src/core/context/compactInjectionState.ts.

Expected concepts:

- injectionStatus:
  - "none"
  - "pending"
  - "injected"
  - "consumed"
  - "invalid"
- checkpointId
- createdAt
- injectedAt, optional
- consumedAt, optional
- injectionCount
- sourceCommand
- warnings

Required behavior:

- in-memory / session-scoped only
- deterministic clock/id injection for tests
- prevents duplicate injection for the same checkpoint unless explicitly refreshed by another `/compact`
- supports superseding old checkpoint after a new `/compact`
- no persistence
- no provider/model call

Add focused tests.

### 4. Add future-turn injection formatter

Add packages/ts-shell/src/core/context/compactInjectedContextFormatter.ts.

It should turn `compactFutureTurnAdapter` output into model-facing continuity context.

Required output:

- concise model-facing continuity text
- structured enough for future route/task continuation
- includes:
  - task/route
  - edit capability status
  - mutation evidence
  - recovery/restore references
  - validation status
  - constraints / forbidden scope
  - next action
  - redactions/warnings
- clearly says:
  - restore execute remains explicit-only
  - automatic recovery is not enabled
  - atomic rollback is not available
- excludes:
  - raw original content
  - raw recovery content
  - secrets
  - provider credentials
  - hidden reasoning

Add focused tests.

### 5. Add injection planner / consumer

Add packages/ts-shell/src/core/context/compactFutureTurnInjection.ts.

It should:

- accept latest live checkpoint
- accept current injection state
- call compactFutureTurnAdapter
- format injected context
- return:
  - shouldInject
  - injectedContext
  - updatedInjectionState
  - warnings
  - evidence
- mark injection as injected/consumed deterministically
- skip injection when:
  - no checkpoint exists
  - checkpoint already injected/consumed
  - checkpoint invalid
  - adapter reports unsafe payload
- never persist
- never call provider/model itself
- never mutate write/edit state
- never imply memory write

Add focused tests.

### 6. Wire `/compact` to pending injection

Update the existing Compact command runtime from Route 77.

Required behavior:

- `/compact` creates/updates latest checkpoint as before
- `/compact` marks the checkpoint as pending for next normal turn injection
- second `/compact` supersedes the previous pending checkpoint
- `/handoff` alias should follow the same behavior only if it is semantically equivalent today; otherwise document difference
- output remains simple and user-friendly
- JSON/dev output remains internal/development oriented
- no user-visible requirement for flags

Add focused tests.

### 7. Wire next normal turn injection

Add a narrow hook into the existing session/query runtime path.

Required behavior:

- if a pending Compact v2 checkpoint exists, the next normal user/model turn receives injected compact context
- command-only turns should not accidentally consume injection unless local runtime treats them as model turns
- injection happens once per checkpoint
- after injection, status becomes injected/consumed
- new `/compact` can create a fresh pending checkpoint
- no provider API changes
- no model/provider implementation changes
- no SessionManager schema change
- no full history rewrite unless existing local compact path makes this trivial

If direct runtime wiring is too coupled:

- implement the injection planner and a narrow test-only adapter
- document the exact runtime blocker
- recommend Route 79 runtime merge
- but attempt wiring first

Add focused tests for touched runtime/session modules.

### 8. Session/checkpoint surface status

Update compactCheckpointSurface or session-facing helpers.

Required user-visible statuses:

- no checkpoint
- checkpoint pending injection
- checkpoint injected
- checkpoint consumed
- checkpoint superseded
- checkpoint invalid

Output should stay concise and understandable.

Add focused tests.

### 9. Continuity tests

Required tests:

- `/compact` creates pending checkpoint
- next normal turn receives injected context
- same checkpoint is not injected twice
- second `/compact` supersedes first checkpoint
- command-only turn does not consume injection if appropriate
- injected context includes edit closeout facts
- injected context includes mutation evidence
- injected context includes recovery references safely
- injected context excludes raw content/secrets
- injected context preserves blocked-by-design facts
- automatic recovery and atomic rollback are not implied
- no persistence side effect

### 10. Docs and roadmap update

Update:

- docs/design/compact-v2-future-turn-injection.md with final notes
- docs/design/compact-live-checkpoint-future-turn-adapter.md with Route 78 note
- docs/design/compact-v2-session-integration.md with Route 78 note
- docs/design/compact-v2-route-continuity.md with Route 78 note
- docs/design/context-engineering-continuity-baseline.md with Route 78 note
- docs/design/edit-capability-roadmap.md with concise status and Route 79 recommendation

Recommended next route:

- Route 79: quality/merge hardening for Compact v2 injection
  - injection quality tests
  - duplicate/merge handling
  - session summary coherence
  - compact packet quality scoring
  - final polish before memory candidate phase

## Validation

Route-specific final validation:

- focused tests for touched core/context command/session/runtime modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad `src/core/shell` or `src/session` paths expose unrelated existing failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- actual injection requires broad provider/model API changes
- actual injection requires SessionManager schema changes
- actual injection requires persistent memory
- session integration requires broad lifecycle rewrite
- command integration requires broad cli.tsx rewrite
- raw content or secrets would need to be injected
- injection would cause duplicate compact context on every turn
- `/compact` user UX becomes flag-heavy or confusing

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
