# Sprint Working Index

This directory is the living sprint knowledge base for capability acquisition.
It should stay concise, current, and development-useful. Replace outdated
sections instead of appending progress logs.

## Current Documents

| Document | Status | Purpose |
|---|---|---|
| `docs/sprint/current-capability-summary.md` | current | Code-backed summary of what this project has already absorbed and what remains unproven. |
| `docs/sprint/mature-agent-capability-map.md` | current | Capability extraction from the mature local implementation and public docs named in the blueprint. |
| `docs/sprint/project-gap-and-priority-plan.md` | current | Aggressive but bounded batch plan for moving toward the mature capability set. |
| `docs/sprint/route/sp001-agent-capability-map-and-plan.md` | current route input | Original sprint objective and completion requirements. |
| `docs/sprint/route/sp002-product-loop-truth-consolidation.md` | completed route input | Product loop truth consolidation objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp003-cli-status-envelope.md` | completed route input | CLI status envelope objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp004-complete-provider-tool-loop-runtime.md` | completed route input | Synthetic provider tool loop runtime objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp005-complete-code-mutation-recovery-runtime.md` | completed route input | Controlled code mutation recovery runtime objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp006-complete-provider-model-runtime.md` | completed route input | Controlled provider/model runtime boundary objective now reflected in current capability and priority docs. |

## Removed Or Merged Content

- No obsolete sprint knowledge-base content existed before SP001. The only prior
  file under `docs/sprint` was the route input.
- Capability material from `docs/build-infrastructure/agent-capability-blueprint.md`
  was merged into the three living sprint docs instead of copied verbatim.
- Earlier Pi-focused audit details remain in `docs/build-infrastructure/` as
  historical/supporting context; the sprint docs carry the current planning
  view.

## Update Rules

- Update `current-capability-summary.md` only when current code or completed,
  verified work proves a capability changed.
- Update `mature-agent-capability-map.md` when new mature capability extraction
  changes the target capability model.
- Update `project-gap-and-priority-plan.md` after each completed capability
  batch so future work does not chase stale priorities.
- Keep `docs/DOC_STATUS.md` classified when adding durable sprint docs.
- Do not use these docs as proof that product behavior exists. Product behavior
  must be proven by code, tests, command output, or runtime evidence.

## Sprint Guardrails

- Product code must stay owner-domain-first and avoid route, process-history,
  comparison, or outside-project vocabulary.
- Real provider behavior stays default-off and explicit opt-in only.
- Terminal truth stays in `evidence`/`result`; provider calls, tool outcomes,
  mutation apply, rollback, repair observations, events, replay, summaries, and
  presentation are not success.
- Dynamic plugin loading, package execution, broad SDK/RPC server behavior,
  browser automation, command allowlist expansion, and broad writer behavior are
  anti-goals until explicitly scoped.
