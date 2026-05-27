# Phase 2 Goal 0: Physical Architecture Reset Control

## Purpose

Phase 1 created inventory, compatibility facades, command grouping, route-runner quarantine, and final compatibility audit.

Phase 2 must now perform visible physical architecture cleanup.

This is not a feature sprint.
This is not another route-report sprint.
This is not "put everything under src/product".

The goal is to make the coding-agents repository look and behave like a maintainable product repository, not a route-grown prototype.

## Phase 1 Baseline

Assume Phase 1 has completed:

- artifact inventory exists
- evidence/verdict compatibility facade exists
- provider/proposal compatibility facade exists
- edit/verification/repair compatibility facades exist
- turn compatibility facade exists
- CLI/session truthful presentation seam exists
- package scripts have grouped aliases
- route runner scripts moved under dev-history
- final compatibility audit exists

These are foundations, not final architecture.

Goal 0 readiness note:

- Current readiness is tracked in
  `docs/product-architecture-reset/phase2-readiness-note.md`.
- Treat Route A inventory as the Phase 1 starting snapshot. Its counts and
  top-level route-runner locations predate Routes G/H and must not override the
  final compatibility audit or current filesystem state.
- As of Goal 0, the current route-runner fact is: historical
  `scripts/route*.ts` runners are under `scripts/dev-history/routes/`, while
  active or compatibility-bound verifier wrappers can remain top-level.
- Do not infer that Phase 1 compatibility facades are final domain ownership.
  Phase 2 Goal 1 must inspect current imports and move only with compatibility
  shims.

## Core Correction

Do not treat packages/ts-shell/src/product/ as the final home for every capability.

Existing src/product/* files from Phase 1 are compatibility facades unless a later migration explicitly promotes them.

Prefer final domain ownership:

- evidence/
- provider/
- proposal/
- edit/
- verification/
- repair/
- turn/
- session/
- cli/ or app/
- result/
- policy/
- tools/
- browser/
- mcp/
- runtime/
- shared/

Codex must inspect current code before deciding exact target paths.

## Phase 2 Goals

Phase 2 is executed in three large goals.

### Goal 1: Domain Layout And Orchestration Decomposition

Purpose:

Move from compatibility facades to real domain structure.

Expected work:

- migrate src/product/* compatibility facades toward final domain directories
- move obvious capability-owned orchestration files into domain modules
- keep old imports working through re-export shims where needed
- reduce orchestration from capability dumping ground to turn/coordination or legacy compatibility
- do not yet split runMvpIntegratedFlow deeply unless required by domain migration

Strong candidates, subject to current-code inspection:

- evidence facade and claim surfaces -> evidence/
- provider/proposal facade and proposal bridge surfaces -> provider/ and/or proposal/
- controlled edit route surfaces -> edit/
- task verification route surfaces -> verification/
- repair iteration surfaces -> repair/
- turn facade -> turn/
- capability boundary / truthfulness surfaces -> evidence/ or policy/

Completion bar:

- visible domain directories exist
- src/product is no longer the growing destination for new architecture
- at least one meaningful batch of orchestration capability files is moved or re-owned
- compatibility imports/tests remain green

### Goal 2: Turn Kernel And Session/CLI Physical Split

Purpose:

Break the largest runtime concentration points into maintainable stages and ownership boundaries.

Expected work:

- split runMvpIntegratedFlow through stage modules or turn-owned helpers
- keep runMvpIntegratedFlow as compatibility wrapper if needed
- clarify turn invocation boundary
- split parts of CLI invocation/output/approval/session command ownership where safe
- split parts of SessionManager responsibility where safe
- preserve session durability and truthful continuation

Strong candidates, subject to current-code inspection:

- turn/context stage
- turn/planning stage
- turn/proposal stage
- turn/mutation stage
- turn/verification stage
- turn/repair stage
- turn/result stage
- cli/args, cli/output, cli/invocation
- session/store, session/continuation, session/summary, session/presentation

Completion bar:

- runMvpIntegratedFlow is visibly thinner or stage-backed
- CLI/session responsibilities are visibly less centralized
- session/CLI do not create success
- result/evidence truthfulness remains intact

### Goal 3: Harness, Docs, Scripts, And Final Physical Audit

Purpose:

Finish visible repository cleanup and prove the reset did not break capability truthfulness.

Expected work:

- separate product tests, evidence tests, harness, eval, and fixtures where safe
- further quarantine route docs and route reports if compatibility exists
- continue package/script cleanup beyond Phase 1 aliases
- move or classify browser/MCP/harness historical surfaces
- create final physical architecture audit

Completion bar:

- docs/scripts/tests/harness surfaces are visibly cleaner
- remaining route/history clutter is explicitly listed with blockers
- no active evidence infrastructure is accidentally archived
- product runtime does not import dev-history/docs/scripts
- final audit honestly classifies COMPLETE/PARTIAL/BLOCKED items

## Global Rules

No feature development.

No live provider.

No provider default behavior change.

No production write default.

No fuzzy apply.

No session schema migration without a written plan.

No deletion unless compatibility and provenance are preserved.

No broad move without import/re-export compatibility.

No route history move that breaks old aliases or report provenance.

No evidence downgrade or false success.

No raw provider output, oldText/newText, API key, or provider.env exposure.

## Serena Policy

Use Serena when available for:

- symbol overview
- find symbol
- find references
- impact analysis
- focused edits around moved symbols

Do not use Serena as validation replacement.

If Serena onboarding asks for memory writes and the goal does not authorize memory changes, skip onboarding and continue with available symbol tools.

## Validation Expectations

Each goal must run validation proportional to touched areas.

Always run:

- git diff --check
- git status --short --branch

If TypeScript product code changes:

- npm run build -w packages/ts-shell
- focused tests for moved modules
- import/boundary scan if applicable

If evidence/result semantics are touched:

- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate

If CLI/session are touched:

- npm run verify:product:cli-entry or equivalent
- focused CLI/session tests

If scripts/package aliases are touched:

- old aliases still work
- new aliases work
- provider default remains off

## Commit Policy

Commit green checkpoints.

Suggested prefixes:

- phase2-goal0:
- phase2-goal1:
- phase2-goal2:
- phase2-goal3:

Do not push.

Do not commit failing states, audit residue, private config, raw provider output, or broken aliases.

## Stop Conditions

Stop instead of expanding scope if:

- behavior changes become necessary outside the goal
- build/test failures cannot be localized
- compatibility shims cannot preserve old imports
- runMvpIntegratedFlow or SessionManager requires unsafe broad rewrite
- package aliases would break
- evidence/verdict truthfulness is at risk
- product runtime would import docs/scripts/dev-history
- route history provenance cannot be preserved

## Goal 0 Output

Goal 0 should only verify and, if needed, refine Phase 2 execution readiness.

It should not perform Goal 1 migration.

Goal 0 may update this file or add a short Phase 2 status note if current repo facts differ.
