# Sprint Working Index

This directory is the living sprint knowledge base for capability acquisition.
It should stay concise, current, and development-useful. Replace outdated
sections instead of appending progress logs.

## Current Documents

| Document | Status | Purpose |
|---|---|---|
| `docs/sprint/current-capability-summary.md` | current | Code-backed summary of what this project has already absorbed and what remains unproven. |
| `docs/sprint/component-adoption-log.md` | current | Controlled component and behavior adoption decisions, modes, boundaries, validation, and rollback plans. |
| `docs/sprint/mature-agent-capability-map.md` | current | Capability extraction from the mature local implementation and public docs named in the blueprint. |
| `docs/sprint/project-gap-and-priority-plan.md` | current | Aggressive but bounded batch plan for moving toward the mature capability set. |
| `docs/sprint/route/sp001-agent-capability-map-and-plan.md` | current route input | Original sprint objective and completion requirements. |
| `docs/sprint/route/sp002-product-loop-truth-consolidation.md` | completed route input | Product loop truth consolidation objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp003-cli-status-envelope.md` | completed route input | CLI status envelope objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp004-complete-provider-tool-loop-runtime.md` | completed route input | Synthetic provider tool loop runtime objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp005-complete-code-mutation-recovery-runtime.md` | completed route input | Controlled code mutation recovery runtime objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp006-complete-provider-model-runtime.md` | completed route input | Controlled provider/model runtime boundary objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp007-complete-session-branch-compaction-runtime.md` | completed route input | Storage-backed session branch and compaction runtime objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp008-complete-host-contract-and-evaluation-runtime.md` | completed route input | Host command contract and deterministic evaluation runtime objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp009-real-provider-compatibility-and-evaluation-hardening.md` | completed route input | Provider compatibility and evaluation hardening objective now reflected in current capability and priority docs. |
| `docs/sprint/route/sp010-controlled-component-adoption-and-parallel-tool-runtime.md` | completed route input | Controlled component adoption and read-only parallel tool runtime objective now reflected in current capability, priority, and adoption-log docs. |
| `docs/sprint/route/sp011-controlled-multi-target-mutation-runtime.md` | completed route input | Controlled multi-target mutation runtime objective now reflected in current capability, priority, and adoption-log docs. |
| `docs/sprint/route/sp012-bounded-parallel-mutation-runtime.md` | completed route input | Bounded parallel multi-target mutation runtime objective now reflected in current capability, priority, and adoption-log docs. |

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
- Component adoption must be logged in `docs/sprint/component-adoption-log.md`
  with mode, owner, side-effect boundary, truth boundary, validation evidence,
  and rollback plan.
- Terminal truth stays in `evidence`/`result`; provider calls, tool outcomes,
  mutation graph, eligibility, group creation, apply, settlement, rollback,
  repair observations, events, replay, summaries, and presentation are not
  success.
- Dynamic plugin loading, package execution, broad SDK/RPC server behavior,
  browser automation, command allowlist expansion, and broad writer behavior are
  anti-goals until explicitly scoped.
