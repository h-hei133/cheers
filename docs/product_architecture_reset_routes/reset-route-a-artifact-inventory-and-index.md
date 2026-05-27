# Reset Route A: Artifact Inventory And Index

## Goal

Create a current artifact inventory that classifies the repository's product docs, route history, evidence reports, harnesses, scripts, package commands, and source-level route-era artifacts.

This route creates the map needed before moving, renaming, grouping, archiving, or facade extraction.

Expected final status: `COMPLETE`.

## Why This Route Comes First

The repository contains product runtime, tests, route-era proof artifacts, evidence reports, historical docs, scripts, package commands, and development harnesses in overlapping locations. Moving or renaming anything before inventory risks breaking provenance, scripts, tests, or product behavior.

This route must make the current artifact surface visible and classified.

## Scope

Allowed:

- docs inventory files
- script inventory files
- package script inventory files
- evidence/report inventory files
- product-source artifact index
- quarantine candidate list
- docs status recommendations
- optional machine-readable index if simple and maintainable

Not allowed:

- source moves
- source renames
- product behavior changes
- package script behavior changes
- deletion or archiving
- live provider calls
- route verifier creation

## Required Inputs

Inspect current repository state before writing inventory:

- `package.json`
- `docs/DOC_STATUS.md`
- `docs/agent-routes/`
- `docs/implementation-context/`
- `docs/design/`
- `docs/archive/`
- `scripts/`
- `packages/ts-shell/src/`
- `packages/rust-core/src/`
- `contracts/`
- the product architecture reset docs

If repository layout differs from expectations, follow the repository.

## Required Subagents

Use focused subagents:

1. Docs inventory subagent
   - classify current docs, active docs, historical route docs, evidence reports, design docs, archive candidates.
2. Scripts and package surface subagent
   - classify root scripts, `verify:*`, `verify:route*`, provider gates, route runners, release gates.
3. Source artifact subagent
   - identify product runtime files with route-era, MVP, capstone, closeout, or proof-style names.
4. Evidence/provenance subagent
   - identify reports and frozen/evidence artifacts whose provenance must be preserved.

Each subagent should return concise findings and classification examples.

## Deliverables

Create under `docs/product-architecture-reset/inventory/`:

1. `README.md`
2. `docs-inventory.md`
3. `scripts-inventory.md`
4. `package-scripts-inventory.md`
5. `evidence-artifacts-inventory.md`
6. `product-source-artifact-index.md`
7. `quarantine-candidates.md`
8. Optional: `artifact-index.json`

Do not create a route capability report.

## Classification Vocabulary

Use these categories where useful:

- product-runtime
- product-test
- product-doc-current
- architecture-doc-current
- route-history-doc
- design-history-doc
- evidence-current
- evidence-history
- dev-harness
- eval-benchmark
- release-gate
- provider-opt-in-gate
- route-runner
- compatibility-alias
- archive-candidate
- quarantine-candidate
- uncertain-needs-review

## Inventory Fields

Each inventory should record at least:

- path or script name
- category
- current role
- product exposure risk
- future target location or namespace
- migration phase
- preserve provenance: yes/no
- compatibility needs
- notes

Use tables for human-readable docs. If a JSON index is created, keep it small and derived from the same categories.

## Phases

### Phase 1: Count and classify docs

Classify current documentation areas and identify active vs route-history vs evidence-history.

No moves.

### Phase 2: Count and classify scripts/package scripts

Classify root package commands and scripts into product, release, evidence, provider, route-history, dev-harness, and unknown.

No script behavior changes.

### Phase 3: Source artifact index

Identify product source files whose names or locations expose development history or mixed responsibility.

Do not rename them.

### Phase 4: Quarantine candidates

Create a future quarantine candidate list for route-era artifacts.

Each candidate must specify why it is a candidate and what compatibility would be required before moving.

### Phase 5: Audit and validation

Validate inventories for completeness and obvious contradictions.

## Completion Criteria

This route is `COMPLETE` only if:

- all required inventory files exist
- docs, scripts, package scripts, evidence reports, and product-source artifacts are classified
- route-era artifacts are explicitly identified
- package script sprawl is classified without changing behavior
- quarantine candidates are listed without moving files
- uncertain cases are marked for review instead of guessed
- no product behavior changed
- `git diff --check` passes
- `git status --short --branch` is reviewed

## Validation

Required:

- path existence check for inventory docs
- `git diff --check`
- `git status --short --branch`

Not required:

- full build
- full test sweep
- live provider
- result contract

## Stop Conditions

Stop if:

- classification requires moving/deleting files
- product behavior would change
- package script compatibility cannot be preserved
- the inventory becomes too uncertain to be useful without user decision

## Final Checkpoint Report

Report:

1. Final status
2. Inventory docs created
3. Counts by category
4. Biggest route-history surfaces
5. Package script grouping findings
6. Quarantine candidate summary
7. Uncertain items
8. Validation results
9. Whether safe to continue to Reset Route B

## Next Route

Continue to:

`reset-route-b-evidence-verdict-facade.md`
