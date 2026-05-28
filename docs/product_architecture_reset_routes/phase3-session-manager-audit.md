# Phase 3: SessionManager Ownership Audit

## Purpose

Audit:

packages/ts-shell/src/session/SessionManager.ts

The previous cleanup finished runMvpIntegratedFlow.ts, workflowExecutionCoordinator.ts, and workflowTaskPlan.ts enough for their current phase. The next likely architecture concentration point is SessionManager.

This route determines whether SessionManager is a legitimate session coordinator or a session monolith.

This is audit-only.

Do not edit runtime code.
Do not move source files.
Do not rewrite tests.
Do not change package scripts.
Do not run live provider.
Do not change session schema.

## Output Directory

Write all audit artifacts under:

docs/product-architecture-reset/sessionManager/

Required outputs:

- docs/product-architecture-reset/sessionManager/README.md
- docs/product-architecture-reset/sessionManager/00-current-map.md
- docs/product-architecture-reset/sessionManager/01-ownership-audit.md
- docs/product-architecture-reset/sessionManager/02-stay-vs-move.md
- docs/product-architecture-reset/sessionManager/03-extraction-targets.md
- docs/product-architecture-reset/sessionManager/04-risk-register.md
- docs/product-architecture-reset/sessionManager/05-validation-plan.md
- docs/product-architecture-reset/sessionManager/06-next-implementation-routes.md

## Required Reading

Read before conclusions:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/SessionManager.test.ts if present
- packages/ts-shell/src/session/sessionRecoverySelection.ts
- packages/ts-shell/src/session/sessionPresentationFacts.ts
- packages/ts-shell/src/session/inlineContinuityContext.ts
- packages/ts-shell/src/session/turnContinuationFacts.ts
- packages/ts-shell/src/session/continuationTargetRebase.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- packages/ts-shell/src/planning/workflowTaskPlan.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts if relevant
- packages/ts-shell/src/core/shell/sessionTerminalState.ts if relevant
- session tests under packages/ts-shell/src/session/
- docs/product-architecture-reset/runMvp/README.md
- docs/product-architecture-reset/workflowExecutionCoordinator/README.md
- docs/product-architecture-reset/workflowTaskPlan/README.md

Use current code as truth. Older docs are context only.

## Core Question

Does SessionManager only coordinate session ownership, or does it own too many unrelated behaviors?

SessionManager may own or coordinate:

- session identity
- session lifecycle
- session persistence boundary
- loading and saving session records
- transcript append/read boundary
- current session selection
- session metadata
- safe compatibility with existing session schema
- delegation to session-owned modules

SessionManager must not deeply own:

- CLI output formatting
- runtime execution behavior
- workflow planning
- provider behavior
- edit/write/verification/repair behavior
- result truth classification
- evidence truth rules
- approval policy semantics beyond storing session facts
- long-session summarization algorithms if they can be session-summary owner
- replay construction if it can be session-replay owner
- continuation interpretation if it can be continuation owner
- terminal presentation if it can be presentation owner

If those appear in the file, classify them as extraction candidates.

## Ownership Standard

A valid SessionManager should become:

- a small coordinator around session storage and lifecycle
- a compatibility facade for existing callers
- a delegator to session-owned modules

It should not become the place where runtime, CLI, evidence, continuation, summary, replay, or approval logic accumulates.

## Required Analysis

For every major symbol, type, function, local helper, constant, and high-density region, record:

- current responsibility
- classification:
  - valid session ownership
  - domain logic in wrong owner
  - compatibility glue
  - temporary adapter
  - extraction candidate
  - deprecated/legacy residue
- final owner domain
- should stay / move / split / delete later
- proposed destination file
- compatibility needs
- test coverage needed
- extraction risk
- suggested implementation route

Do not leave large regions unmapped.

## Destination Rules

Use real owner modules:

- session/store/
- session/transcript/
- session/replay/
- session/summary/
- session/continuation/
- session/presentation/
- session/approval/
- session/recovery/
- session/schema/
- result/
- evidence/
- cli/
- runtime/

Do not propose vague destinations:

- helper
- helpers
- utils
- misc
- common
- support
- mvp
- sessionUtils
- managerHelpers

If proposing files, name them by product responsibility.

Good examples:

- session/store/sessionStore.ts
- session/transcript/sessionTranscript.ts
- session/replay/sessionReplayBuilder.ts
- session/summary/sessionSummaryBuilder.ts
- session/continuation/sessionContinuationFacts.ts
- session/approval/sessionApprovalMemory.ts
- session/presentation/sessionSurfaceProjection.ts
- session/schema/sessionRecordCodec.ts

Bad examples:

- session/sessionHelpers.ts
- session/sessionUtils.ts
- session/managerSupport.ts

## Required Outputs

### README.md

Summarize purpose, status, artifact list, and final verdict.

### 00-current-map.md

Map file size, imports, exports, public methods, major local helpers, storage paths, schema touchpoints, tests, and consumers.

### 01-ownership-audit.md

Classify every major symbol/region as:

- valid session ownership
- domain logic in wrong owner
- compatibility glue
- temporary adapter
- extraction candidate
- deprecated/legacy residue

### 02-stay-vs-move.md

A table with:

- symbol/region
- stay?
- move?
- split?
- delete/deprecate later?
- final destination
- reason

### 03-extraction-targets.md

Concrete extraction targets grouped by implementation route.

Each target must include:

- source symbols/regions
- destination file
- compatibility strategy
- tests
- stop conditions

### 04-risk-register.md

Risks such as:

- session schema drift
- transcript loss
- replay parity drift
- continuation state corruption
- approval memory becoming authority
- result truthfulness drift
- CLI/session presentation drift
- old session compatibility breakage
- import cycles
- migration without compatibility

### 05-validation-plan.md

Validation for future implementation routes:

- focused SessionManager tests
- session lifecycle tests
- session replay tests
- long session durability tests
- stopped session continuity tests
- continuation evidence parity tests
- CLI/product entry tests if CLI surface touched
- result contract / Route221 gate if truth fields touched
- build
- import scan

### 06-next-implementation-routes.md

Recommend aggressive but safe grouped implementation routes.

Do not split into too many tiny routes.

Group compatible extraction targets together.

Answer clearly:

- safe to implement now?
- first implementation route?
- what should not be combined?

## Suggested Route Grouping To Evaluate

Codex must verify against current code, but should consider these groupings:

1. Store / schema / transcript boundary.
2. Replay / continuation / recovery selection.
3. Summary / compaction / long-session durability.
4. Approval memory / permission facts / request-scope session facts.
5. Presentation / CLI-facing session surface cleanup.
6. Dead residue and compatibility cleanup.

Merge compatible routes if safe, but do not combine schema migration with presentation changes unless the compatibility plan is explicit.

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- caller/callee inspection
- ownership clustering
- import cycle risk review

Do not use Serena as validation replacement.

If onboarding asks for memory writes and this audit does not need memory changes, skip onboarding and continue.

## Validation For This Audit Route

Required:

- all required docs exist
- git diff --check
- git status --short --branch

No build/tests required because source code must not change.

## Completion Criteria

COMPLETE requires:

- all required docs exist
- whole file is mapped
- every major symbol/region has ownership classification
- clear answer:
  - valid session coordinator
  - partial session monolith
  - unacceptable session monolith
- concrete grouped implementation routes exist if cleanup is needed
- validation plan exists
- no runtime behavior changed

PARTIAL if:

- only high-level overview exists
- large regions are unmapped
- destinations are vague
- implementation routes are vague

BLOCKED if:

- file cannot be inspected
- symbol structure cannot be recovered enough for audit

## Final Report

Include:

1. Final status
2. Docs created
3. Serena usage
4. File size and major symbols
5. Whether this file is valid session coordinator or session monolith
6. What should stay
7. Biggest extraction targets
8. Recommended grouped implementation routes
9. Validation summary
10. Whether safe to start implementation or move to next file
