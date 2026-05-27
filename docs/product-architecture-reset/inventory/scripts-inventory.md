# Scripts Inventory

Current-state script inventory for Reset Route A. This file classifies scripts
without changing package commands or script behavior.

| Path or pattern | Category | Current role | Product exposure risk | Future target category | Migration phase | Preserve provenance | Compatibility needs | Notes and uncertainty |
|---|---|---|---|---|---|---|---|---|
| `scripts/bootstrap.mjs`, `scripts/toolchain.mjs`, `scripts/build-cli-bin.mjs` | dev-harness | Setup, toolchain, and build support. | Low | Dev/build support namespace. | Phase G classify. | No | Keep package aliases. | Build support, not route history. |
| `scripts/verify/index.mjs` and `scripts/verify/*` | dev-harness / release-gate | Shared verifier framework and scenario modules. | Medium; verifier surface is broad. | `scripts/verify/` or grouped verifier framework. | Phase G classify before aliases. | No | Existing root commands must keep working. | 13 files under `scripts/verify`. |
| `scripts/verify-release-*.mjs` | release-gate | Release smoke/core/deterministic/real gates. | Medium; `verify-release-real` is opt-in provider-adjacent. | `scripts/release/` or `verify:release:*` backing scripts. | Phase G after aliases. | Yes for reports produced | Old command aliases must remain. | `verify-release-real.mjs` stays provider opt-in. |
| `scripts/verify-real-user-capabilities.mjs` | eval-benchmark / provider-opt-in-gate | Broad real-user capability verifier. | High; can be mistaken for product default readiness. | `scripts/evidence/` or `scripts/eval/real-user-capabilities/`. | Phase G after aliases. | Yes | Preserve all package aliases first. | Some modes are default-safe; real modes are opt-in. |
| `scripts/real-user-capabilities/*` | dev-harness / eval-benchmark | Support modules for real-user capability verifier. | Medium | Dev/eval support namespace. | Phase G after verifier grouping. | Yes | Preserve import paths until wrapper exists. | 2 support modules. |
| `scripts/route*.ts` | route-runner | Route-era runners and benchmarks from Route207 through Route228. | High; flat top-level route runners obscure product scripts. | `scripts/dev-history/routes/` or `scripts/evidence/route-history/`. | Phase G/H after aliases. | Yes | Package aliases and report paths must keep working. | 30 route-named script files. |
| `scripts/verify-route*.mjs` | route-runner / evidence-report | Route-era verifier wrappers and gates. | High; `verify-route*` looks current in the flat namespace. | `scripts/evidence/route-history/` with aliases. | Phase G/H after aliases. | Yes | Keep old `verify:route*` commands. | Split active evidence gates from pure history before moving. |
| `scripts/verify-route221-anti-false-success-gate.mjs` | evidence-report / frozen-task-negative-control | Active anti-false-success report gate. | Medium; route name is historical but semantics are current. | Product evidence gate backing script. | Phase B/G before move. | Yes | Preserve schema, frozen task, template, and fixture paths. | Do not quarantine as simple history yet. |
| `scripts/inspect-evidence-artifact.mjs`, `verify-evidence-*.mjs`, `generate-t12-evidence.mjs` | evidence-report | Evidence inspection and validation scripts. | Medium | `scripts/evidence/`. | Phase G after aliases. | Yes | Keep `evidence:inspect` and verifier aliases. | Evidence product concept should survive reset. |
| `scripts/real-provider-*.mjs`, `scripts/real-provider-*.design.md` | provider-opt-in-gate | Real-provider fixtures, smokes, redaction checks, and design notes. | High; must never become default provider behavior. | `scripts/provider/` or `scripts/real-provider-smokes/`. | Phase G after opt-in alias strategy. | Yes | Preserve explicit opt-in env behavior. | Do not read provider config manually. |
| `scripts/real-provider-smokes/*` | provider-opt-in-gate | Shared real-provider smoke runners and approved env helpers. | High | Provider opt-in smoke namespace. | Phase G after aliases. | Yes | Keep explicit `PRIVATE_AGENTS_REAL_HOME` gate semantics. | 3 files; already grouped. |
| `scripts/verify-provider-*.mjs`, `verify-anchored-provider-smoke.mjs`, `real-provider-lightweight-chat-smoke.mjs` | provider-opt-in-gate | Provider readiness, smoke, and anchored smoke checks. | High | Provider opt-in gate scripts. | Phase G after aliases. | Yes | Keep no-provider default and isolated test roots. | Some commands are readiness-only, not live calls. |
| `scripts/verify-edit-capability-closeout.mjs`, `verify-result-contract`, workspace and failure handoff scripts | dev-harness / evidence-report | Product capability and result truthfulness checks. | Medium | Product/evidence verifier namespace. | Phase G after evidence facade. | Yes where reports are read | Keep existing commands as aliases. | Not route-history solely by name. |
| `scripts/support/*` | dev-harness | Shared script runtime and path support. | Low | Script support namespace. | Phase G keep. | No | Preserve imports. | 2 support modules observed. |
| Unreferenced scripts/support/design files | inspect-further | Files not directly referenced by root package scripts. | Medium | Inspect before quarantine or archive. | Phase A inventory; Phase G classify. | Mixed | Check imports and docs before moving. | Subagent found 41 unreferenced script/support/design files by package reference scan. |

## Script Surface Counts

| Surface | Count |
|---|---:|
| Files under `scripts/` | 125 |
| `.mjs` scripts | 89 |
| `.ts` scripts | 32 |
| `.md` script design notes | 2 |
| `.json` script data files | 1 |
| `.py` script files | 1 |
| Route-named script files | 30 |
| Verify-named script files | 50 |
| Provider/real named script files | 27 |
| Package-referenced script paths | 84 |
| Missing package-referenced script paths | 0 |

## Script Inventory Findings

- Route runners and provider smokes are mixed at the top level of `scripts/`.
- Existing `scripts/real-provider-smokes/` is already a better grouped shape and
  should be preserved as the provider opt-in boundary.
- `scripts/verify-route221-anti-false-success-gate.mjs` is route-named but
  currently protects evidence truthfulness; moving it requires Reset Route B/G
  compatibility first.
- No package script behavior was changed by this inventory.

## Disposition Summary

| Artifact family | Disposition | Reason |
|---|---|---|
| Build/setup/toolchain scripts | keep | Current dev/build support. |
| `scripts/verify/index.mjs`, `scripts/verify/*` | keep | Shared verifier framework already has a grouped directory. |
| `scripts/verify-release-*.mjs` | alias | Release command aliases must remain stable before any script move. |
| `scripts/verify-real-user-capabilities.mjs` | inspect further | Mixed default-safe, eval, and provider opt-in modes. |
| `scripts/real-user-capabilities/*` | move later | Eval support should follow verifier grouping after aliases. |
| `scripts/route*.ts` | move later | Route runners need package aliases and report-path compatibility first. |
| `scripts/verify-route*.mjs` | alias | Keep current commands while adding grouped route-history/evidence aliases later. |
| `scripts/verify-route221-anti-false-success-gate.mjs` | inspect further | Active evidence gate despite route-era name. |
| Evidence inspection scripts | keep | Evidence tooling is a durable product proof surface. |
| Real-provider scripts and smokes | alias | Must preserve explicit opt-in behavior before grouping. |
| `scripts/support/*` | keep | Shared script support modules. |
| Unreferenced script/support/design files | inspect further | Need import/docs checks before quarantine or archive. |
