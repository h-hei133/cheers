# Phase 2.5: Final Physical Cleanup And Baseline Recovery

## Purpose

Phase 2 improved the repository structure, but several high-impact debts remain:

- full runMvpIntegratedFlow.test.ts baseline drift
- core/harness still physically under core
- route docs and route reports still visible in historical product-facing locations
- CLI remains a high-risk composition root

Phase 2.5 is one combined route with four strict phases:

A. runMvpIntegratedFlow baseline drift cleanup
B. core/harness physical move
C. route docs/reports quarantine completion
D. CLI physical split

This route is not feature development. It is a final physical cleanup route.

## Global Rules

Do not run live provider.

Do not add features.

Do not change provider default behavior.

Do not change product runtime behavior unless a stale test expectation is proven wrong and the current runtime behavior is already truthful.

Do not weaken evidence/verdict truthfulness.

Do not turn skipped, partial, blocked, not-run, no-provider, or not-proven into success.

Do not delete route history or evidence history without compatibility.

Do not move active Route221 evidence infrastructure unless an adapter preserves all old consumers.

Do not break old package aliases.

Do not perform broad rewrites of runMvpIntegratedFlow, SessionManager, or cli.tsx.

Use compatibility shims, re-export wrappers, alias indexes, and provenance docs when moving files.

Use Serena when available for symbol overview, reference search, and impact analysis. Do not use Serena as validation replacement.

If Serena onboarding asks for memory writes and this route does not explicitly need memory changes, skip onboarding and continue with available symbol tools.

## Required Reading

Before editing, read:

- docs/product_architecture_reset_routes/GOAL.md
- docs/product_architecture_reset_routes/phase2-goal0-physical-architecture-reset-control.md
- docs/product_architecture_reset_routes/phase2-goal1-domain-layout-orchestration-decomposition.md
- docs/product_architecture_reset_routes/phase2-goal2-turn-session-cli-physical-split.md
- docs/product_architecture_reset_routes/phase2-goal3-harness-docs-scripts-final-audit.md
- docs/product-architecture-reset/phase2-final-physical-audit.md
- docs/product-architecture-reset/harness-eval-artifact-index.md
- docs/product-architecture-reset/inventory/quarantine-candidates.md
- docs/product-architecture-reset/inventory/evidence-artifacts-inventory.md
- docs/product-architecture-reset/inventory/scripts-inventory.md
- docs/product-architecture-reset/inventory/package-scripts-inventory.md
- docs/product-architecture-reset/07-testing-and-validation-strategy.md

Use current code and git status as truth. Older inventories may be stale.

## Execution Rule

Execute phases in order.

Do not start Phase B unless Phase A is COMPLETE.

Do not start Phase C unless Phase B is COMPLETE.

Do not start Phase D unless Phase C is COMPLETE.

If a phase is PARTIAL or BLOCKED, stop and report. Do not continue to later phases.

Each phase may commit when green.

Suggested commit prefixes:

- phase2-5-a:
- phase2-5-b:
- phase2-5-c:
- phase2-5-d:

Do not push.

## Phase A: runMvpIntegratedFlow Baseline Drift Cleanup

### Goal

Recover a trustworthy baseline for runMvpIntegratedFlow characterization.

The full runMvpIntegratedFlow.test.ts suite was previously reported as:

- 167 tests
- 133 passed
- 34 failed

Phase A must not pretend this is green.

### Required Work

1. Reproduce the current full runMvpIntegratedFlow.test.ts result.
2. Classify every failing test or failure family as:
   - stale expectation
   - deprecated characterization
   - real regression
   - duplicate coverage replaced by newer product tests
   - unresolved
3. Fix low-risk stale expectations when the current behavior is already truthful.
4. Split deprecated or historical cases into an explicit legacy characterization section if needed.
5. Produce a baseline drift register under docs/product-architecture-reset/.
6. Establish a trusted focused runMvp baseline command or test subset if the full legacy suite cannot be green yet.

### Completion Criteria

COMPLETE requires:

- every known failing family classified
- no unexplained failure remains
- low-risk stale expectations fixed
- trusted baseline command documented
- no false success or truthfulness weakening
- focused turn/runtime/result tests pass
- npm run verify:result-contract passes
- npm run build -w packages/ts-shell passes

PARTIAL if failures remain unclassified.

BLOCKED if classification requires feature work or broad runtime rewrite.

## Phase B: core/harness Physical Move

### Goal

Move or re-home the harness/eval surface out of misleading core ownership.

### Required Work

1. Inspect packages/ts-shell/src/core/harness.
2. Decide the safe target, such as:
   - packages/ts-shell/src/harness/
   - packages/ts-shell/src/eval/
   - packages/ts-shell/src/test-support/harness/
   Codex must choose based on current imports.
3. Move a meaningful harness/eval family, not just README text.
4. Preserve compatibility through shims or updated imports.
5. Keep product runtime from depending on harness/dev-history.
6. Preserve browser transaction gate and route provenance labels.

### Completion Criteria

COMPLETE requires:

- at least one meaningful harness/eval family physically moved or clearly re-homed
- old tests/imports remain compatible
- product runtime imports no harness/dev-history unless explicitly test-only
- browser transaction gate still passes if touched
- focused harness/eval tests pass
- build passes

PARTIAL if only docs/README changed.

BLOCKED if moving requires unsafe import rewrites.

## Phase C: Route Docs/Reports Quarantine Completion

### Goal

Finish the visible route-history quarantine beyond scripts/route*.ts.

### Required Work

1. Inspect docs/agent-routes/route*.md and docs/implementation-context/route*-report.json.
2. Move safe route-history docs/reports to final historical locations, such as:
   - docs/dev-history/routes/
   - docs/evidence/history/route-reports/
3. Preserve old discovery through indexes, compatibility links, or manifest files.
4. Keep active Route221 evidence infra in place unless adapter-safe.
5. Preserve Route227/228 truth distinctions and provider provenance.
6. Update DOC_STATUS and indexes.

### Completion Criteria

COMPLETE requires:

- at least one significant route-doc or route-report family moved or quarantined
- old references/discovery remain documented
- active evidence infra is not accidentally archived
- Route221 gate passes
- route-history alias/provenance checks pass where relevant

PARTIAL if only indexes are added and no route-doc/report family moves.

BLOCKED if compatibility/provenance cannot be preserved.

## Phase D: CLI Physical Split

### Goal

Make cli.tsx visibly less central by moving a real responsibility family into cli-owned modules.

### Required Work

1. Inspect cli.tsx and CLI runtime wiring.
2. Extract at least one real responsibility family, such as:
   - cli/args
   - cli/invocation
   - cli/output
   - cli/commands
   - cli/approval
   - cli/sessionCommands
3. Keep old entry behavior compatible.
4. Do not change CLI truthfulness semantics.
5. Preserve session/result/evidence ownership.

### Completion Criteria

COMPLETE requires:

- at least one real CLI responsibility family extracted
- cli.tsx becomes visibly thinner or clearer
- verify:product:cli-entry passes
- focused CLI/session/result tests pass
- result-contract passes
- build passes
- no session schema migration

PARTIAL if only wrappers/comments are added.

BLOCKED if extraction requires broad CLI rewrite.

## Final Validation

At the end of the last completed phase, run all relevant validations from that phase plus:

- git diff --check
- git status --short --branch
- product/runtime import scan for docs/scripts/dev-history/harness leakage
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate

Do not run live provider.

## Final Report

Report per phase:

1. status COMPLETE/PARTIAL/BLOCKED
2. files moved/created/updated
3. behavior changed yes/no
4. compatibility shims/aliases/indexes
5. validations
6. Serena usage
7. commit hash if committed
8. remaining debt

Final judgment:

- whether Phase 2.5 completed
- whether repository structure is now acceptable for feature work
- remaining high-impact cleanup tasks
