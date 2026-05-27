# Evidence Artifacts Inventory

Current-state evidence and provenance inventory for Reset Route A. Evidence
artifacts are preserved here as proof surfaces; no report paths or schemas were
changed.

| Path or pattern | Category | Current role | Product exposure risk | Future target category | Migration phase | Preserve provenance | Compatibility needs | Notes and uncertainty |
|---|---|---|---|---|---|---|---|---|
| `docs/implementation-context/capability-evidence-schema-route221.md` | evidence-report | Evidence schema reference for route reports and anti-false-success checks. | Medium | Product evidence schema doc. | Phase B before move. | Yes | Update gate consumers through adapter before path changes. | Route name is historical, semantics remain current. |
| `docs/implementation-context/future-route-report-template-route221.md` | evidence-report | Template for future route reports. | Medium | Product evidence/report template. | Phase B before move. | Yes | Preserve route report compatibility. | Inspect further before deciding active vs history. |
| `docs/implementation-context/frozen-capability-tasks-route221.json` | frozen-task-negative-control | Frozen capability tasks and negative controls. | Medium | Evidence fixtures / frozen tasks. | Phase B before move. | Yes | Gate and report producers may hardcode this path. | Active truthfulness infrastructure. |
| `docs/implementation-context/route221b-report-fixtures/*` | frozen-task-negative-control | Negative and positive report fixtures for anti-false-success checks. | Medium | Evidence test fixtures. | Phase B/G before move. | Yes | Preserve gate path or add compatibility adapter. | Active evidence gate input. |
| `docs/implementation-context/route221c-report-fixtures/*` | frozen-task-negative-control | Provenance and evidence-level report fixtures. | Medium | Evidence test fixtures. | Phase B/G before move. | Yes | Preserve gate path or add compatibility adapter. | Active evidence gate input. |
| `scripts/verify-route221-anti-false-success-gate.mjs` | evidence-report / release-gate | Validates report truthfulness and rejects false success patterns. | Medium | Product evidence gate backing script. | Phase B/G. | Yes | Keep old script and package alias until new gate exists. | Do not treat as simple route history. |
| `docs/implementation-context/route222*-report.json` | evidence-report | Repair-to-success route reports. | High if read as product-current without context. | `docs/evidence/history/route-reports/`. | Phase H after evidence index. | Yes | Preserve report discovery and producer script paths. | Historical evidence. |
| `docs/implementation-context/route223*-report.json` | evidence-report | Task-relevant verification route report. | High | Evidence history. | Phase H. | Yes | Preserve producer/consumer paths. | Historical evidence. |
| `docs/implementation-context/route224*-report.json` | evidence-report | Capstone coding-agent capability report. | High | Evidence history. | Phase H. | Yes | Preserve route224 runner/report references. | Historical evidence. |
| `docs/implementation-context/route225*-report.json` | evidence-report / provider-opt-in-gate | Real CLI product loop report. | High | Evidence history plus provider opt-in provenance. | Phase H after provider/evidence index. | Yes | Preserve provider attribution and redaction assumptions. | Historical live-provider-adjacent evidence. |
| `docs/implementation-context/route226*-report.json` | evidence-report / provider-opt-in-gate | Live-provider product path capstone report. | High | Evidence history plus provider provenance. | Phase H. | Yes | Preserve redaction and provider failure attribution. | Historical live-provider evidence. |
| `docs/implementation-context/route227a-*.json` through `route227i-*.json` | evidence-report | Route227 staged capability reality reports. | High | Evidence history. | Phase H after evidence facade. | Yes | `route227i` loads upstream Route227A-H reports. | Preserve PARTIAL/COMPLETE distinctions. |
| `docs/implementation-context/route228-*.json` | evidence-report / provider-opt-in-gate | Live-provider exact proposal success cut-through report. | High | Evidence history plus provider provenance. | Phase H after provider/evidence facade. | Yes | Preserve raw-output exclusion and provider attribution. | Historical live-provider evidence. |
| `docs/implementation-context/route227-final-capability-reality-map.md` | evidence-report | Human-readable final capability reality map. | High | Evidence history / capability reality maps. | Phase H after index. | Yes | Preserve references from release summaries. | Must not be overread as unconditional current truth. |
| `docs/implementation-context/route227-release-candidate-summary.md` | evidence-report / release-gate | Release candidate summary. | High | Evidence history / release history. | Phase H after index. | Yes | Preserve links to reports. | Historical summary. |
| `docs/implementation-context/capability-reality-map-route220.md` | evidence-report | Route220 capability reality map. | High | Evidence history. | Phase H. | Yes | Preserve links. | Historical capability map. |
| `scripts/route222*.ts` through `scripts/route228*.ts` | route-runner / evidence-report | Report-producing route runners. | High | Route-history/evidence runner namespace. | Phase G/H after aliases. | Yes | Report output paths and package aliases must remain valid. | Do not move before aliases. |
| `scripts/inspect-evidence-artifact.mjs`, `scripts/verify-evidence-artifacts.mjs`, `scripts/verify-evidence-inspector.mjs` | evidence-report | Evidence artifact inspection and validation. | Medium | Product evidence tooling. | Phase B/G. | Yes | Keep command aliases. | Evidence tooling is current, not history-only. |
| `packages/ts-shell/src/orchestration/claimLedgerProjection.ts`, `core/query/resultMapper.ts` | product-runtime / evidence-report | Runtime result and claim projection surfaces. | Medium | Product evidence/verdict facade consumers. | Phase B. | No | Focused tests before facade changes. | Listed as current runtime surfaces, not Route A changes. |

## Evidence Findings

- Route reports are valuable historical proof and must preserve provenance.
- Route221 assets are active anti-false-success infrastructure and require a
  product evidence facade or adapter before any quarantine move.
- Provider/live reports need explicit provider attribution preserved; moving
  them must not imply provider success becomes default product readiness.
- Some script runners hardcode report paths under `docs/implementation-context/`;
  future moves need aliases or adapters before path changes.

## Disposition Summary

| Artifact family | Disposition | Reason |
|---|---|---|
| Route221 schema/template/frozen tasks | inspect further | Active evidence infrastructure under route-era names. |
| Route221 report fixtures | inspect further | Negative controls must stay coupled to the anti-false-success gate until facade work. |
| `verify-route221-anti-false-success-gate.mjs` | alias | Preserve current command/path behavior before moving. |
| Route222-228 JSON reports | move later | Historical reports need provenance index and compatibility first. |
| Route227/228 reality maps and summaries | move later | Historical truthfulness evidence must stay linked to reports. |
| Report-producing route runners | alias | Package aliases and report paths must remain valid. |
| Evidence inspection scripts | keep | Current evidence tooling should remain reachable. |
| Runtime claim/result projection surfaces | keep | Product runtime source, not route-history artifact. |
