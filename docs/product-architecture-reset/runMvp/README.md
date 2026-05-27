# runMvpIntegratedFlow Extraction Planning

This directory is the Phase 3 planning output for the full extraction of
`packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`.

Status: planning only. No runtime code, source moves, symbol renames, package
scripts, tests, or live provider behavior were changed by this route.

Required planning artifacts:

- `00-runmvp-current-map.md`
- `01-runmvp-ownership-zones.md`
- `02-runmvp-extraction-targets.md`
- `03-runmvp-stay-vs-move.md`
- `04-runmvp-extraction-order.md`
- `05-runmvp-validation-plan.md`
- `06-runmvp-risk-register.md`

Current conclusion: `runMvpIntegratedFlow.ts` should become a compatibility
wrapper. The long-term turn coordinator should live under `turn/`, while the
legacy orchestration path keeps the current `runMvpIntegratedFlow` and
`streamMvpIntegratedFlow` exports until direct consumers migrate to the product
turn facade.

Primary evidence used:

- Serena symbol overview of `runMvpIntegratedFlow.ts`.
- Serena references for `runMvpIntegratedFlow` and `streamMvpIntegratedFlow`.
- Focused line-range inspection of imports, entrypoints, runner construction,
  task planning, task execution, delivery projection, repair/read helpers, and
  mutation helpers.
- Current domain directories under `packages/ts-shell/src/`.
- Phase 2/3 reset docs and the recovered runMvp baseline register.
