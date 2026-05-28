# Product Architecture Reset Inventory

Reset Route A created this inventory before any structural migration. It is a
current-state index only: no files were moved, renamed, deleted, archived, or
reclassified in code.

## Scope

Inventory files:

- `docs-inventory.md`
- `scripts-inventory.md`
- `package-scripts-inventory.md`
- `evidence-artifacts-inventory.md`
- `product-source-artifact-index.md`
- `quarantine-candidates.md`

The inventory uses current repository state as truth. Older route and module
atlas material is historical input only.

## Current Counts

| Surface | Count | Notes |
|---|---:|---|
| `docs/` files | 449 | Includes active docs, route history, design history, evidence reports, reset docs. |
| `docs/agent-routes/route*.md` | 236 | Primary route-history document surface. |
| `docs/design/*.md` | 83 | Design-history document surface. |
| `docs/implementation-context/` files | 48 | Mix of active context, schema/template files, reports, fixtures. |
| `scripts/` files | 125 | Includes route runners, verifiers, provider smokes, harness support. |
| Root `package.json` scripts | 120 | Flat command surface with product, release, evidence, provider, and route-history commands. |
| Root `verify:*` scripts | 82 | Includes product checks, release gates, provider gates, route-history verifiers. |
| Root `verify:route*` scripts | 32 | Historical route verifier namespace. |
| `packages/ts-shell/src` TS/TSX files | 1304 | Product runtime, product tests, harnesses, fixtures, route-era proof surfaces. |
| `packages/ts-shell/src` tests | 520 | Product tests and route/frozen evidence tests are currently colocated. |
| `packages/rust-core/src` files | 3 | Clean native-executor-candidate source surface. |
| `contracts/` files | 22 | Cross-runtime contracts and contract tests. |

## Classification Vocabulary

The inventory uses these target categories:

- `product-runtime`
- `product-test`
- `dev-harness`
- `eval-benchmark`
- `release-gate`
- `provider-opt-in-gate`
- `evidence-report`
- `frozen-task-negative-control`
- `route-history-doc`
- `route-runner`
- `package-command-surface`
- `active-architecture-doc`
- `stale-or-historical-doc`
- `quarantine-candidate`
- `inspect-further`

## Disposition Vocabulary

Each detailed inventory records or summarizes one of these dispositions:

- `keep`: leave in place as current product/runtime/architecture surface.
- `alias`: preserve old command/path behavior before any future move.
- `move later`: future migration candidate, but not during Route A.
- `archive later`: future archive candidate after active/stale review.
- `inspect further`: current evidence is insufficient for a safe target.

## Reading Order

1. Read `docs-inventory.md` for active docs versus historical docs.
2. Read `scripts-inventory.md` and `package-scripts-inventory.md` before any
   command grouping or alias work.
3. Read `evidence-artifacts-inventory.md` before moving reports, fixtures, or
   route evidence.
4. Read `product-source-artifact-index.md` before introducing product facades.
5. Read `quarantine-candidates.md` before Reset Routes G or H.

## Route A Boundary

This inventory proposes future targets, aliases, and quarantine candidates. It
does not implement them.
