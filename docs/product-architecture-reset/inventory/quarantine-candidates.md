# Quarantine Candidates

Reset Route A identifies quarantine candidates only. No quarantine move,
archive, deletion, rename, or package alias change happened in this route.

| Candidate | Category | Why candidate | Product exposure risk | Future target | Migration phase | Preserve provenance | Compatibility needed before move | Notes and uncertainty |
|---|---|---|---|---|---|---|---|---|
| `docs/agent-routes/route*.md` | route-history-doc / quarantine-candidate | Primary route history surface, 236 route documents. | High | `docs/dev-history/routes/`. | Phase H after docs index. | Yes | Old links or route index aliases. | Keep `module-route-template.md` and discipline docs out of this broad move until classified. |
| `docs/design/*.md` | stale-or-historical-doc / quarantine-candidate | Historical design and extraction notes, 83 files. | High | `docs/dev-history/design/` or `docs/archive/design/`. | Phase H after active/stale classification. | Yes | Link preservation and `DOC_STATUS.md` replacement/update. | Some may still be useful module references; classify before archive. |
| `docs/implementation-context/route*-report.json` | evidence-report / quarantine-candidate | Machine-checkable historical route evidence. | High | `docs/evidence/history/route-reports/`. | Phase H after evidence facade/index. | Yes | Preserve producer/consumer paths, checksums or provenance index. | Do not move before Route B evidence facade work. |
| `docs/implementation-context/route*-*.md` | evidence-report / stale-or-historical-doc / quarantine-candidate | Human-readable reality maps, summaries, and downgrades. | High | `docs/evidence/history/` or `docs/dev-history/implementation-context/`. | Phase H after docs/evidence index. | Yes | Preserve links from reports and route docs. | Route227/228 truth distinctions must stay prominent. |
| `docs/implementation-context/route221b-report-fixtures/` | frozen-task-negative-control / inspect-further | Route-named negative controls used by anti-false-success gate. | Medium | Evidence test fixtures. | Phase B/G before H. | Yes | Gate path compatibility first. | Active evidence infrastructure; not simple archive. |
| `docs/implementation-context/route221c-report-fixtures/` | frozen-task-negative-control / inspect-further | Route-named provenance fixtures used by evidence gates. | Medium | Evidence test fixtures. | Phase B/G before H. | Yes | Gate path compatibility first. | Active evidence infrastructure; not simple archive. |
| `docs/implementation-context/capability-evidence-schema-route221.md` | evidence-report / inspect-further | Route-named schema still describes current evidence semantics. | Medium | Product evidence schema docs. | Phase B. | Yes | Adapter or old path alias. | Move only after evidence facade owns schema vocabulary. |
| `docs/implementation-context/frozen-capability-tasks-route221.json` | frozen-task-negative-control / inspect-further | Route-named frozen tasks are current negative controls. | Medium | Evidence fixtures / frozen tasks. | Phase B. | Yes | Preserve gate and report producer paths. | Not quarantine-ready until facade exists. |
| `scripts/route*.ts` | route-runner / quarantine-candidate | Historical route runners and benchmarks live in top-level `scripts/`. | High | `scripts/dev-history/routes/` or `scripts/evidence/route-history/`. | Phase G/H after aliases. | Yes | Package aliases and report paths must remain valid. | 30 files; some produce reports still referenced by summaries. |
| `scripts/verify-route*.mjs` | route-runner / evidence-report / quarantine-candidate | Route verifier wrappers live in top-level `scripts/`. | High | `scripts/evidence/route-history/` plus grouped aliases. | Phase G/H. | Yes | Keep `verify:route*` aliases and active evidence gates. | Split Route221 gate before broad move. |
| `package.json` `verify:route*` scripts | package-command-surface / route-runner / quarantine-candidate | Flat route verifier namespace appears alongside product gates. | High | Deprecated compatibility aliases to `verify:route-history:*` or `verify:evidence:*`. | Phase G. | Yes | Add new grouped aliases first; keep old aliases through compatibility window. | 32 scripts. |
| `package.json` `demo:route207` | package-command-surface / route-runner / quarantine-candidate | Historical demo command in root script namespace. | Medium | Route-history demo alias. | Phase G. | Yes | Preserve or document old command. | Low priority after verifier aliases. |
| `packages/ts-shell/src/orchestration/controlledMultifileProofChain.ts` | dev-harness / evidence-report / inspect-further | Route206 proof-chain code under product `orchestration`. | High | Evidence/dev harness namespace or product facade adapter. | Phase D/G after classification. | Yes | Preserve evidence markers, tests, and imports. | Highest uncertainty source quarantine candidate. |
| `packages/ts-shell/src/core/harness/**` | dev-harness / eval-benchmark / quarantine-candidate | Harness and eval code lives under `core`, including route fixture IDs. | Medium to high | Dev/eval harness namespace. | Phase G after runtime facades. | Yes | Preserve tests and fixture imports. | Some tests may be product tests; do not move as one blind block. |
| `packages/ts-shell/src/core/context/browserRuntimeGauntletManifest.ts` | product-runtime / dev-harness / inspect-further | `gauntlet` naming suggests eval history but file is runtime-adjacent. | Medium | Browser runtime or eval manifest after owner review. | Phase D/G. | Yes if evidence-facing | Determine owner before move. | Inspect further. |
| Product runtime files with route command references | product-runtime / inspect-further | `verificationCommandPlan.ts`, `capabilityBoundaryProjection.ts`, and related runtime files reference route scripts. | Medium | Product evidence/verdict/verification facades. | Phase B/D/G. | Yes for current evidence labels | Keep route command aliases until product commands exist. | Not quarantine candidates by path; they need facade cleanup. |

## Compatibility Rules Before Quarantine

- Add aliases before moving any script or package command.
- Preserve machine report provenance, including route identity and report
  producer/consumer paths.
- Keep Route221 anti-false-success assets reachable until a product evidence
  facade owns the equivalent semantics.
- Do not move route labels out of source when those labels are part of current
  evidence or result truthfulness.
- Do not make provider/live historical reports look like default product
  readiness.

## Biggest Quarantine Surfaces

- `docs/agent-routes/route*.md`
- `docs/design/*.md`
- `docs/implementation-context/route*-report.json`
- `scripts/route*.ts`
- `scripts/verify-route*.mjs`
- `package.json` `verify:route*`
- `packages/ts-shell/src/core/harness/**`

## Disposition Summary

| Candidate family | Disposition | Reason |
|---|---|---|
| Route docs | move later | Needs docs index and old-link compatibility. |
| Design docs | archive later | Needs active/stale review first. |
| Route reports and summaries | move later | Needs provenance-preserving evidence index. |
| Route221 fixtures/schema/template | inspect further | Active evidence gates still depend on them. |
| Route runner scripts | alias | Package/script aliases must come first. |
| Route verifier scripts | alias | Split active evidence gates from historical wrappers first. |
| `verify:route*` package commands | alias | Old commands must stay while grouped commands are introduced. |
| Runtime proof/harness source | inspect further | Requires product-vs-dev owner decision and characterization coverage. |
