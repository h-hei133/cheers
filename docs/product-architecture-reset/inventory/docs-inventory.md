# Documentation Inventory

Current-state documentation inventory for Reset Route A. Counts are from the
current worktree during the route audit.

| Path or pattern | Category | Current role | Product exposure risk | Future target category | Migration phase | Preserve provenance | Compatibility needs | Notes and uncertainty |
|---|---|---|---|---|---|---|---|---|
| `docs/ACTIVE_CONTEXT.md` | active-architecture-doc | Default documentation context selector. | Low; intended active entrypoint. | Keep active docs index. | Phase 1 keep; Phase 6 may refresh. | No | Keep path stable unless docs index replacement exists. | Current and useful, but still references route process. |
| `docs/DOC_STATUS.md` | active-architecture-doc | Status map for choosing docs and avoiding broad history loading. | Medium; manually maintained and behind some recent route artifacts. | Active docs index or generated docs status surface. | Phase 1 keep; Phase 6 improve. | No | Any replacement needs old path pointer. | Do not treat as complete truth without code/current inventory checks. |
| `docs/product_architecture_reset_routes/GOAL.md` | active-architecture-doc | Reset program control document. | Low; governs reset checkpoints. | Reset route control docs. | Phase 1 keep. | Yes | Keep until reset program completes. | User prompt used singular directory, but current repo uses plural `product_architecture_reset_routes`. |
| `docs/product_architecture_reset_routes/reset-route-*.md` | active-architecture-doc | Reset route checkpoint plans A-I. | Low; route plans, not runtime source. | Reset route control docs. | Phase 1 keep. | Yes | Keep route names stable through reset. | Only Route A is executed in this batch. |
| `docs/product-architecture-reset/00-10*.md` | active-architecture-doc | Product architecture reset planning foundation. | Low; current planning docs. | Long-lived architecture reset docs. | Phase 1 keep; later routes update selectively. | Yes | Keep stable references from `GOAL.md`. | Current reset docs are planning evidence, not implementation proof. |
| `docs/architecture/*.md` | active-architecture-doc / stale-or-historical-doc | Module maps, capability contracts, extraction plans, and older atlases. | Medium; some files are current, some are superseded. | Active architecture docs plus historical architecture archive. | Phase 1 classify; Phase 6 index. | Mixed | `DOC_STATUS.md` or successor must classify before moves. | `module-atlas.md` is explicitly superseded by `control-plane-atlas.md`; do not use old atlas as truth. |
| `docs/foundation/*` | active-architecture-doc | Truthfulness, risk, and consistency evidence. | Low to medium; still relevant to evidence/verdict work. | Evidence/foundation current docs. | Phase 1 keep; Phase 2 align with evidence facade. | Yes | Keep paths until evidence facade/docs index exists. | Current foundation material should not be quarantined with route reports. |
| `docs/implementation-context/README.md` | active-architecture-doc | Start point for capability wiring context. | Medium; directory also contains route reports. | Current implementation-context docs or product capability map. | Phase 1 keep; Phase 6 split active vs history. | No | Keep existing references until replacement index exists. | Active doc in a mixed directory. |
| `docs/implementation-context/capability-flow-*` and `capability-recipes.md` | active-architecture-doc | Flow graph, manifest, and recipes for capability wiring. | Medium; active context mixed with route-era names. | Product capability/evidence context. | Phase 1 keep; Phase 2/6 review. | Yes for machine-readable manifest | Consumers may expect current paths. | Mark `inspect-further` where route-numbered schema/template names are still used by gates. |
| `docs/implementation-context/capability-evidence-schema-route221.md` | evidence-report / inspect-further | Route221 evidence schema reference. | Medium; route-era name but current anti-false-success semantics. | Product evidence schema doc or evidence-history with facade. | Phase 2 before move. | Yes | Route221 gate references must keep working. | Active evidence infrastructure, not simple history. |
| `docs/implementation-context/future-route-report-template-route221.md` | evidence-report / inspect-further | Route report template used by evidence gates. | Medium; route-era template may still define current report expectations. | Product evidence report template. | Phase 2 before move. | Yes | Preserve old path until gate adapter exists. | Inspect before quarantine. |
| `docs/implementation-context/frozen-capability-tasks-route221.json` | frozen-task-negative-control | Frozen task and negative-control evidence input. | Medium; product truthfulness gates depend on it. | Evidence fixtures / frozen tasks namespace. | Phase 2 before move. | Yes | Preserve path or add adapter before any move. | Current evidence infrastructure. |
| `docs/implementation-context/route*-report.json` | evidence-report | Machine-checkable route capability reports. | High; historical proof may be mistaken for current product truth. | `docs/evidence/history/route-reports/`. | Phase 6/H after index and aliases. | Yes | Preserve report discovery and producer paths first. | Quarantine candidate; do not move in Route A. |
| `docs/implementation-context/route*-*.md` | evidence-report / stale-or-historical-doc | Reality maps, summaries, downgrade notes. | High if read as current truth without route context. | Evidence history or implementation history. | Phase 6/H after classification. | Yes | Preserve links from route docs and summaries. | Route227/228 distinctions must stay visible. |
| `docs/implementation-context/route221b-report-fixtures/` | frozen-task-negative-control | Anti-false-success report fixtures. | Medium; fixture names are negative controls, not product claims. | Evidence test fixtures. | Phase 2 before move. | Yes | `verify-route221-anti-false-success-gate.mjs` must keep working. | Active evidence infrastructure. |
| `docs/implementation-context/route221c-report-fixtures/` | frozen-task-negative-control | Provenance and anti-false-success report fixtures. | Medium; route names preserve test intent. | Evidence test fixtures. | Phase 2 before move. | Yes | Preserve gate paths first. | Active evidence infrastructure. |
| `docs/agent-routes/route*.md` | route-history-doc | Historical route plans and closeouts. | High; large route history obscures current product architecture. | `docs/dev-history/routes/`. | Phase H after docs index and compatibility links. | Yes | Keep old links or index aliases before move. | 236 files; primary quarantine candidate. |
| `docs/agent-routes/module-route-template.md` | active-architecture-doc | Current module route template. | Low | Active route discipline docs. | Phase 1 keep. | No | Keep path while route process uses it. | Listed active in `DOC_STATUS.md`. |
| `docs/agent-routes/COMMON_BOUNDARIES.md`, `REFERENCE_SCAN_POLICY.md`, `ROUTE_DISCIPLINE.md`, `VALIDATION_POLICY.md` | active-architecture-doc | Shared route discipline and validation guidance. | Medium; route-process docs are still operational. | Active route discipline docs. | Phase 1 keep; Phase 6 review. | No | Keep paths until route process replacement exists. | Do not quarantine with old route plans yet. |
| `docs/design/*.md` | stale-or-historical-doc | Historical design and extraction notes. | High; many design notes are route-era or superseded. | `docs/dev-history/design/` or `docs/archive/design/`. | Phase H after active/stale classification. | Yes | Keep links from route docs and architecture docs. | 83 files; classify before archive. |
| `docs/audits/*.md` | stale-or-historical-doc | Closeout audit history. | Medium | `docs/dev-history/audits/` or archive. | Phase H after index. | Yes | Preserve historical links. | Not default context. |
| `docs/manual-checks/*.md` | stale-or-historical-doc | Manual dogfood or live TTY checklist history. | Medium | `docs/dev-history/manual-checks/` or archive. | Phase H after index. | Yes | Preserve historical links. | Not default context. |
| `docs/archive/**` | stale-or-historical-doc | Existing archive pointer/history. | Low | Archive. | Keep. | Yes | None unless archive index changes. | Current count is small: `docs/archive/README.md`. |

## Docs Inventory Findings

- Active architecture and reset docs are present, but current and historical
  evidence live together under `docs/implementation-context/`.
- `docs/DOC_STATUS.md` is useful but not a complete generated index; use this
  inventory and current code before relying on it.
- Route history and design history should be quarantined only after a docs index
  and compatibility link strategy exist.
- Route221 evidence assets are active test/gate infrastructure and should not be
  archived as simple route history.

## Disposition Summary

| Artifact family | Disposition | Reason |
|---|---|---|
| `docs/ACTIVE_CONTEXT.md`, `docs/DOC_STATUS.md` | keep | Current default documentation entrypoints. |
| `docs/product_architecture_reset_routes/*` | keep | Reset program control surface. |
| `docs/product-architecture-reset/00-10*.md` | keep | Current reset architecture foundation. |
| `docs/architecture/*.md` | inspect further | Mixed active module references and superseded architecture docs. |
| `docs/foundation/*` | keep | Current truthfulness/risk evidence. |
| `docs/implementation-context/capability-*` | inspect further | Active capability/evidence context mixed with route naming. |
| `docs/implementation-context/route*-report.json` | move later | Historical evidence reports need provenance-preserving evidence index first. |
| `docs/implementation-context/route221*-fixtures/` | inspect further | Active anti-false-success fixtures under route-era names. |
| `docs/agent-routes/route*.md` | move later | Primary route-history quarantine candidate. |
| `docs/design/*.md` | archive later | Historical design notes need active/stale classification first. |
| `docs/audits/*`, `docs/manual-checks/*` | archive later | Historical audit/manual validation records. |
