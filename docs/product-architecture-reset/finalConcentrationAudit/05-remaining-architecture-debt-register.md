# Remaining Architecture Debt Register

| ID | Debt item | File/module | Severity | Owner | Why it matters | Proposed route | Validation | Safe to defer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FCA-DEBT-001 | Planning concentration | `planning/workflowTaskPlan.ts` | blocker | planning | Large file combines intent, continuation, repair, verification, browser, degraded reopen, and evidence parsing rules. | Route 1: Planning/runtime concentration closeout | focused workflow task plan and continuation tests, build | no |
| FCA-DEBT-002 | Runtime execution concentration | `runtime/workflowExecutionCoordinator.ts` | blocker | runtime | Still coordinates mutation, verification, repair, read projection, authority wiring, and final result assembly. | Route 1: Planning/runtime concentration closeout | focused workflow coordinator tests, touched stage tests, build | no |
| FCA-DEBT-003 | Session facade concentration | `session/SessionManager.ts` | major | session | High fan-in/high fan-out facade still owns store, transcript, recovery, replay, continuity, approval memory, and summaries. | Route 2: Session facade slimming | SessionManager, recovery, replay, continuation, CLI session tests, build | yes, only after Route 1 is scheduled |
| FCA-DEBT-004 | Edit route concentration | `orchestration/patchResult/mixedFileWriteRoute.ts`, `perFilePatchPlan.ts`, workspace route files | major | edit | Patch/apply planning and mixed-file write behavior remain large and route-era named under orchestration. | Route 3: Edit/write route ownership cleanup | workspace write route tests, mutation-lane regression, build | yes |
| FCA-DEBT-005 | Evidence compatibility concentration | `orchestration/claimLedgerProjection.ts`, `evidence/verdictFacade.ts`, `core/query/resultMapper.ts` | major | evidence/result | Truthfulness is better centralized than before, but Route221/227/228 compatibility still keeps route-era vocabulary in product surfaces. | Route 4: Evidence/result compatibility retirement | Route221 gate, verdict facade tests, result contract, report adapter checks | yes |
| FCA-DEBT-006 | CLI compatibility imports | `cli/*` importing `entrypoints/cli*` modules | minor | cli | CLI executable shim is clean, but reusable CLI contracts still live under entrypoints compatibility modules. | Route 5: CLI contract relocation | focused CLI entry tests, verify:cli-entry, build | yes |
| FCA-DEBT-007 | Route-name runtime strings | orchestration, verification, evidence, browser context/harness | major | product architecture | Route-era IDs remain visible in request IDs, evidence labels, prompt strings, fixture IDs, and command plans. | Route 6: Route vocabulary quarantine | result contract, evidence gates, harness redaction tests, script compatibility checks | yes |
| FCA-DEBT-008 | Package script sprawl | root `package.json` | major | developer experience / release | Product verification, route history, evidence gates, demos, and live-provider gates share one flat namespace. | Route 7: Script taxonomy compatibility cleanup | script inventory, key verify aliases, no behavior change check | yes |
| FCA-DEBT-009 | Harness/test concentration | large tests and `core/harness` route fixtures | minor | harness/eval | Huge tests and route-era fixtures make validation ownership difficult to read. | Route 8: Harness namespace cleanup | focused harness tests and redaction checks | yes |
| FCA-DEBT-010 | Browser/context mixed ownership | `core/context/browser*`, `core/harness/browser*` | major | browser/tool runtime | Browser runtime, fixture, evidence, runner, and context ownership remain clustered under `core/context` and `core/harness`. | Route 9: Browser/tool facade cleanup | browser transaction gate, browser harness focused tests | yes |

Blockers for Phase 3 stop:

- FCA-DEBT-001
- FCA-DEBT-002

Major debt that can be deferred if explicitly tracked:

- FCA-DEBT-003 through FCA-DEBT-010

