# Product Architecture Reset GOAL

This file controls the product architecture reset program.

The reset is not a feature sprint. It is a staged migration from a route-grown prototype to a product-owned architecture.

The detailed planning foundation lives in:

- `docs/product-architecture-reset/00-reset-charter.md`
- `docs/product-architecture-reset/01-current-structure-audit.md`
- `docs/product-architecture-reset/02-artifact-and-naming-hygiene.md`
- `docs/product-architecture-reset/03-target-product-architecture.md`
- `docs/product-architecture-reset/04-module-boundaries-and-dependency-rules.md`
- `docs/product-architecture-reset/05-product-dataflow-and-lifecycle.md`
- `docs/product-architecture-reset/06-migration-strategy.md`
- `docs/product-architecture-reset/07-testing-and-validation-strategy.md`
- `docs/product-architecture-reset/08-architecture-debt-register.md`
- `docs/product-architecture-reset/09-reference-architecture-comparison.md`
- `docs/product-architecture-reset/10-next-restructure-routes.md`

Future `/goal` prompts should reference this file and execute one or more reset route documents from this pack.

## North Star

Move the project from:

```text
route-driven prototype
-> product-owned architecture
```

The target structure should make these boundaries visible:

- app / CLI presentation
- product turn runtime
- context and planning
- provider
- proposal
- edit
- verification
- repair
- tools / browser / MCP
- evidence / verdict
- session
- policy
- runtime / adapters / shared contracts
- dev-only harness / evidence history / route history

The reset must preserve the project's main innovation:

```text
capabilities produce safe evidence;
evidence and verdict layers decide success;
CLI/session only present truthful results.
```

## Hard Constraints

Do not do feature development during reset routes unless a route explicitly allows a narrow compatibility fix.

Do not run live provider unless a later route explicitly touches provider-facing behavior and explicitly opens that opt-in gate.

Do not change product behavior casually.

Do not weaken:

- no-provider by default
- no production write by default
- selected workspace authority
- stale-read checks
- post-write verification requirements
- raw provider output redaction
- API key/private config redaction
- false-success gates
- not-proven / partial / blocked truthfulness
- Route227 / Route228 proven capability distinctions

Do not delete route history, route reports, old scripts, or package aliases until a route explicitly provides compatibility aliases and archive/quarantine rules.

Do not perform broad rename-only moves of:

- `runMvpIntegratedFlow.ts`
- `SessionManager.ts`
- `cli.tsx`

These files must first receive facades, shims, or compatibility boundaries.

## Execution Model

A single `/goal` may execute multiple reset routes, but every reset route is a checkpoint.

At each checkpoint:

1. Read this `GOAL.md`.
2. Read the current reset route document.
3. Read the relevant supporting docs from `docs/product-architecture-reset/`.
4. Inspect current code before editing.
5. Use focused subagents for the current route only.
6. Make the smallest behavior-preserving structural change.
7. Validate according to the current route and `07-testing-and-validation-strategy.md`.
8. Report checkpoint status.
9. Commit only if the checkpoint is green and the user has allowed commits.
10. Continue only if the next route's prerequisites are satisfied.

A checkpoint may end `COMPLETE`, `PARTIAL`, or `BLOCKED`.

If a route ends `PARTIAL` or `BLOCKED`, do not silently continue as if it succeeded. Either stop, or continue with the downgraded evidence explicitly recorded in the next checkpoint.

## Subagent Policy

Use subagents to reduce main-thread context pressure.

Use focused subagents, not broad archaeology.

Typical reset route subagents:

- current-code inventory subagent
- boundary/import audit subagent
- compatibility/test audit subagent
- docs/scripts/package surface audit subagent
- product-path truthfulness audit subagent

Subagent reports should be short and actionable:

- files inspected
- findings
- risks
- recommended change
- audit result

Reference repositories may be inspected only for structure comparison:

- `opencode`
- `OpenHands`
- `mini-swe-agent`
- `gemini-cli`
- `inspect_ai`
- optional: `GitNexus`, `graphiti`, `mem0`, `mempalace`, `playwright-mcp`, `stagehand`

Do not copy a reference architecture wholesale.

## Reset Route Sequence

1. Reset Route A: Artifact Inventory And Index
2. Reset Route B: Evidence/Verdict Facade
3. Reset Route C: Provider/Proposal Boundary Facade
4. Reset Route D: Edit/Verification/Repair Facades
5. Reset Route E: Turn Kernel Compatibility Extraction
6. Reset Route F: Session And CLI Presentation Split
7. Reset Route G: Scripts And Package Surface Grouping
8. Reset Route H: Route History Quarantine Move
9. Reset Route I: Final Architecture Compatibility Audit

## Recommended Batching

Preferred execution batches:

1. Batch 1: Reset Route A
2. Batch 2: Reset Route B
3. Batch 3: Reset Route C
4. Batch 4: Reset Route D
5. Batch 5: Reset Route E
6. Batch 6: Reset Route F
7. Batch 7: Reset Routes G and H
8. Batch 8: Reset Route I

If a `/goal` has enough context and the previous checkpoint is clean, it may execute multiple adjacent low-risk routes.

Do not combine high-risk routes E and F with package-script or route-history moves unless the route explicitly stays within facade/shim changes.

## Validation Rules

Use the validation strategy in `07-testing-and-validation-strategy.md`.

Minimum for docs/inventory-only routes:

- path existence check
- `git diff --check`
- `git status --short --branch`

For product facade routes:

- focused unit tests for touched modules
- product path smoke if relevant
- result/evidence truthfulness tests
- anti-false-success / report gate if evidence semantics are touched
- `npm run build -w packages/ts-shell` if TypeScript product code is touched

For package script routes:

- old aliases still work
- new aliases work
- release/evidence/provider command groups are clear
- no live provider default

For final audit:

- product path smoke
- focused capability regressions
- evidence/report gates
- release deterministic if command routing changed
- no provider gate unless provider-facing code changed and opt-in is explicit

## Commit Policy

Use commits to keep the restructure inspectable.

Each green checkpoint may be committed with a prefix:

- `reset-a:`
- `reset-b:`
- `reset-c:`
- `reset-d:`
- `reset-e:`
- `reset-f:`
- `reset-g:`
- `reset-h:`
- `reset-i:`

Do not push.

Do not commit:

- failing states
- audit residue
- private provider config
- raw provider output
- temporary debug artifacts
- broken compatibility aliases
- behavior changes mixed with rename-only moves

If a route is large, prefer multiple small commits inside the route.

## Stop Conditions

Stop and report instead of continuing if:

- a route requires broad behavior change outside its scope
- a route would weaken evidence/verdict truthfulness
- imports require a large move before a facade exists
- package script compatibility cannot be preserved
- product runtime would need to import dev/history/docs
- Route227/228 capability distinctions are at risk
- build/test failures cannot be localized
- session schema migration becomes necessary without a written plan

## Output Format At Each Checkpoint

Every checkpoint report should include:

1. Reset route(s) attempted
2. Final status: COMPLETE / PARTIAL / BLOCKED
3. Files changed
4. Product behavior changed: yes/no
5. Compatibility shims or aliases added
6. Evidence/truthfulness impact
7. Validations run with pass/fail
8. Risks and unresolved questions
9. Commit hash if committed
10. Whether it is safe to continue

## Final Goal

After Reset Route I, the repository should have:

- product runtime separated from route-history artifacts
- evidence/verdict facade as a product-owned layer
- provider/proposal boundary clarified
- edit/verification/repair boundaries clarified
- turn kernel facade introduced
- CLI/session responsibilities clearer
- scripts/package commands grouped
- route history quarantined with compatibility preserved
- final compatibility audit proving no false success or capability regression

If any part remains unfinished, the final audit must classify it as `PARTIAL`, `BLOCKED`, or `NOT-PROVEN` instead of hiding it.
