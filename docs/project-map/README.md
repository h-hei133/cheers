# Project Map Freeze

Route: `docs/agent-routes/route201-project-map-freeze.md`

This directory contains the read-only project map freeze before the upcoming refactor. The files describe the current target repository state only. They do not recommend next routes or change runtime behavior.

## Files

- `../PROJECT_MAP.md`: human entrypoint and high-level current-state summary.
- `capability-state.md`: capability-by-capability state, boundaries, defects, and evidence level.
- `live-evidence-ledger.md`: separated live, fake, default-safe, scaffold, and not-proven evidence ledger.
- `module-boundary-map.md`: responsibility-boundary map by module.
- `module-defect-map.md`: module and cross-module defect ledger.
- `entrypoint-flow-map.md`: actual current entrypoint and runtime flows.
- `verification-gate-map.md`: current verifier gate map and proof limits.
- `coupling-risk-map.md`: current coupling and ambiguity risks.
- `current-state.json`: machine-readable snapshot.

## Evidence Labels

Evidence labels used here:

- `live-provider-called`: provider call is reported as live and reached provider-called state.
- `live-provider-no-write`: live provider route ran but no workspace mutation authority was granted.
- `live-provider-apply`: live provider route applied a workspace mutation.
- `live-verification`: live route ran a verification step after apply.
- `fake-provider`: deterministic fake provider or fixture provider path.
- `fake-ready-boundary`: fake-ready boundary used to prove wiring without real credentials.
- `default-safe-skip`: default command path intentionally skips live provider, external MCP, browser, mutation, or opt-in execution.
- `focused-unit-tests`: focused unit or integration tests assert local contract behavior.
- `scaffold-only`: route, descriptor, facade, or manual surface exists but does not prove execution.
- `not-proven`: no current evidence proves the claim.

## Route 199 / Route 200 Freeze

This map treats Route 199 as live provider-called no-write evidence:

- provider kind: `openai-compatible`
- adapter approved: `true`
- provider called: `true`
- output validation: `valid-exact-single-target`
- anchor quality: `exact-ready`
- no write: `true`
- mutation authority: `not-granted`
- raw provider output: `excluded`

This map treats Route 200 as a stopped task-loop state, not a live task-loop success:

- live task-loop opt-in: `true`
- real provider smoke opt-in: `true`
- provider called: `false`
- anchor quality: `none`
- apply: `not-run`
- verification: `not-run`
- mutation scope: `none`
- status: `task-loop-stopped`
