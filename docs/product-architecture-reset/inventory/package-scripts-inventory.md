# Package Scripts Inventory

Current-state inventory of root `package.json` scripts for Reset Route A. This
file classifies command families only; it does not change aliases or behavior.

## Counts

| Package command surface | Count |
|---|---:|
| Total root scripts | 120 |
| Top-level no-colon scripts | 8 |
| `build*` scripts | 4 |
| `test*` scripts | 21 |
| `verify:*` scripts | 82 |
| `verify:route*` scripts | 32 |
| Route-named commands including `demo:route207` | 33 |
| Provider/real/live-related commands by name or command text | 40 |
| Release-related commands | 8 |
| Evidence/artifact/shape commands | 9 |

## Command Families

| Script or pattern | Category | Current role | Product exposure risk | Future target category | Migration phase | Preserve provenance | Compatibility needs | Notes and uncertainty |
|---|---|---|---|---|---|---|---|---|
| `build`, `build:ts`, `build:cli`, `build:rust` | package-command-surface / product-runtime | Build commands for TS CLI and Rust core. | Low | Product build namespace. | Keep. | No | Keep as stable product commands. | Current product command names are already reasonable. |
| `dev`, `start` | package-command-surface / product-runtime | Local development/product entry commands. | Low | Product/dev command namespace. | Keep. | No | Keep stable. | `start:live:interactive` is not in this row. |
| `doctor`, `setup`, `bootstrap` | package-command-surface / dev-harness | Environment and setup helpers. | Low | Dev/admin command namespace. | Phase G classify. | No | Keep old command names. | Product-adjacent but not route history. |
| `test`, `test:ts`, `test:rust`, `test:python`, `test:all` | package-command-surface / product-test | Unit and package test commands. | Low | Product/package tests. | Keep. | No | Keep stable. | Some broader `test:*` commands are harness gates, not unit tests. |
| `test:daily`, `test:broader`, `test:broader:p0`, `test:broader:p1`, `test:comprehensive` | dev-harness | Broader regression suites. | Medium | Dev/regression harness namespace. | Phase G classify. | No | Keep aliases. | Do not treat every broad test as release gate. |
| `test:release-gate`, `verify:release:*`, `test:delta:release` | release-gate | Release readiness gates. | Medium | `verify:release:*` namespace. | Phase G after alias audit. | Yes for generated reports | Keep old aliases. | `verify:release:real` is provider opt-in. |
| `verify:permission-memory`, `verify:doctor`, `verify:rust-execution`, `verify:session-lifecycle`, `verify:query-orchestration`, `verify:cli-entry`, `verify:mcp:*`, `verify:workspace-safety` | package-command-surface / product-test | Focused product/runtime invariant checks. | Low to medium | `verify:product:*` or stable focused gates. | Phase G after grouping. | No | Keep current aliases. | Some names are already responsibility-based. |
| `verify:result-contract`, `verify:evidence-artifacts`, `evidence:inspect`, `verify:evidence-inspector`, `test:artifacts:validate` | evidence-report | Evidence/result/report validation and inspection. | Medium | `verify:evidence:*` and `evidence:*`. | Phase B/G. | Yes | Preserve report schema compatibility. | Evidence commands should survive reset as product-owned proof gates. |
| `verify:route205-*` through `verify:route228-*` | route-runner | Historical route verifiers and benchmarks. | High | `verify:route-history:*` compatibility aliases. | Phase G before H. | Yes | Add grouped aliases before changing old names. | 32 `verify:route*` scripts. Do not delete. |
| `demo:route207` | route-runner | Historical route demo command. | High | Route-history demo alias. | Phase G/H. | Yes | Keep alias or docs pointer. | Route-history command, not product default. |
| `verify:route211-real-provider-proposal-smoke`, `verify:route214-*`, `verify:route216-*`, `verify:route217-*`, `verify:route218-*`, `verify:route219-*`, `verify:route225-*`, `verify:route226-*`, `verify:route227a-*`, `verify:route228-*` | provider-opt-in-gate / route-runner | Route-era real/live provider gates. | High | Provider opt-in gates plus route-history aliases. | Phase G after provider grouping. | Yes | Preserve explicit opt-in environment and redaction rules. | Route history and provider opt-in categories overlap. |
| `verify:provider-readiness:*`, `verify:lightweight-chat:real`, `verify:permission-memory:real`, `verify:release:real` | provider-opt-in-gate | Provider readiness or real-provider checks. | High | `verify:provider:*` or `verify:real-provider:*`. | Phase G after opt-in audit. | Yes | Must not run by default; preserve isolated env behavior. | No live provider was run for this inventory. |
| `verify:real-user-capabilities*` | eval-benchmark / provider-opt-in-gate | Real-user capability harness with default-safe and real modes. | High | `verify:evidence:*`, `verify:provider:*`, or `verify:eval:*` split. | Phase G after semantic audit. | Yes | Preserve each mode's provider/write behavior. | Needs semantic split before renaming. |
| `test:coverage:real-shapes`, `verify:real-user-capabilities:*evidence`, move/delete/mixed evidence commands | evidence-report / eval-benchmark | Shape and artifact evidence checks. | Medium | Evidence/eval namespace. | Phase B/G. | Yes | Preserve reports and fixtures. | Some names include `real` but are shape/evidence checks rather than provider calls. |
| `workflow:*`, `worktree:create`, `audit:recent`, delta commands | dev-harness | Developer workflow and audit helpers. | Low to medium | Dev tooling namespace. | Phase G classify. | No | Keep aliases. | Not product runtime. |

## Package Script Findings

- The root command surface is flat: product commands, release gates, evidence
  gates, provider opt-in checks, and route-history commands share one namespace.
- `verify:route*` commands should become compatibility aliases only after new
  grouped evidence/route-history commands exist.
- Provider/real/live commands must remain explicit opt-in and must not be pulled
  into product default gates.
- All package-referenced script paths found by the subagent currently exist.

## Disposition Summary

| Command family | Disposition | Reason |
|---|---|---|
| Product build/start/test commands | keep | Current stable product and package commands. |
| Dev/admin commands | keep | Useful developer support surface. |
| Broad regression commands | keep | Dev harness commands, not migration candidates by themselves. |
| Release commands | alias | Preserve old release command names before grouping. |
| Product-focused `verify:*` commands | keep | Current focused product/runtime gates. |
| Evidence commands | keep | Evidence/verdict proof surface should become product-owned. |
| `verify:route*` commands | alias | Future grouped route-history aliases must come before deprecation. |
| `demo:route207` | alias | Historical command should remain reachable if moved later. |
| Provider/real/live commands | alias | Explicit opt-in behavior and redaction boundaries must be preserved. |
| `verify:real-user-capabilities*` | inspect further | Mixed eval/evidence/provider modes require semantic split. |
