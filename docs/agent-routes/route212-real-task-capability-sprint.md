# Route 212: Real Task Capability Sprint

## Goal

Use the current product coding loop on real small tasks and improve the highest-impact capability gaps.

Route207-211 built the main chain:

vague task
-> context and planning
-> structured edit handoff
-> review and confirmation
-> authorized proof backend
-> verification
-> repair continuation

Route212 is not a new proof substrate route and not a Route211 closeout.

This route must answer:

Can the current product loop actually help on real small development tasks?

If not, what is the top blocker, and can we fix 1-2 blockers this route?

## Non-goals

Do not try to finish every remaining not-proven claim.

Do not spend the route only adding verifiers.

Do not create artificial success-only demos.

Do not broaden arbitrary fuzzy editing.

Do not turn this into a 3 hour architecture route.

## Budget and commit policy

Target runtime: 60-90 minutes.

Hard route budget:

- 3 required real task cases
- 2 optional cases only if time remains
- maximum 2 core capability fixes
- maximum 3 phase commits
- no push

Each phase:

1. Run or inspect the task through the product path.
2. Identify the actual blocker.
3. Use subagents only for the blocker being fixed.
4. Implement the smallest high-value fix.
5. Audit that the task result improved.
6. If green, commit with message starting route212:.

Do not commit failing states.

## Reference repository pool

All repos are under /home/wang/projects:

- GitNexus
- OpenHands
- gemini-cli
- graphiti
- inspect_ai
- mem0
- mempalace
- mini-swe-agent
- opencode
- pi
- playwright-mcp
- stagehand

Use references only when a concrete blocker appears.

Suggested mapping:

- task loop failure: OpenHands, mini-swe-agent, opencode
- provider proposal quality: opencode, OpenHands, gemini-cli
- context target miss: GitNexus, gemini-cli, graphiti, pi
- verification/test selection: mini-swe-agent, OpenHands, inspect_ai
- repair continuation: OpenHands, mini-swe-agent, inspect_ai
- result/session report: opencode, OpenHands, inspect_ai

Main thread must not broad-read reference repos.

Subagent reports must be short:

- blocker
- reference pattern
- local seam
- recommended fix
- audit risk

## Real provider policy

Live provider use is allowed only for explicit opt-in task cases.

Use only existing approved provider config loading paths.

The user has primary SiliconFlow and fallback SiliconFlow configured in /home/wang/.private-agents-real/provider.env.

Do not cat, grep, print, echo, upload, or dump provider config.

Do not print API keys.

Do not print raw provider output.

Primary may be tried once.

Fallback may be tried once if primary fails with network/provider-availability class where fallback is appropriate.

No retry loops.

If network/proxy/API availability blocks both, mark NETWORK-BLOCKED.

If auth/config fails, mark AUTH-FAILED or CONFIG-FAILED.

Never fake live success.

Fake, focused, deterministic, live, and network-blocked evidence must stay separate.

## Task pack

Run at least 3 real small tasks.

Tasks should be chosen from current repository needs or realistic current-repo fixtures, not toy success-only prompts.

Required task types:

1. Small vague bugfix or behavior fix
   Goal: product path finds context, prepares proposal, and reaches review or confirmed apply.

2. Small feature or output improvement
   Goal: product path forms useful plan, edit target, verification intent, and either applies under explicit authority or stops with useful missing facts.

3. Verification or test-related task
   Goal: product path proposes or runs authorized verification and reports pass/fail honestly.

Optional if time remains:

4. Two-file coordinated task
5. Verification failure -> repair continuation task

## Capability fixes allowed

Only fix blockers discovered by task cases.

Allowed fix categories:

- context candidate ranking
- staged read selection
- planning specificity
- proposal preparation
- live provider prompt or output normalization
- anchor extraction
- selected workspace authority integration
- verification command selection
- repair continuation wiring
- result/session clarity

Do not fix more than 2 core blocker categories in this route.

## Phase 0: Baseline task run

Run the 3 required task cases through the product path.

Record for each:

- task description
- product path used or bypassed
- candidate files
- reads
- analysis quality
- plan quality
- proposal state
- provider state if used
- anchor state
- confirmation state
- apply state
- verification state
- repair state
- terminal result
- blocker if any

Deliverable:

- baseline table
- top 1-2 blockers selected for fixing

Commit only if a useful baseline harness or task pack file is added.

Suggested commit:

route212: add real task sprint baseline

## Phase 1: Fix top blocker

Fix the highest-impact blocker from Phase 0.

Use targeted subagents and references only for this blocker.

Examples:

- provider returns review-only because output format is weak
- context misses relevant file
- plan is too generic
- proposal cannot anchor
- verification command not selected
- selected workspace authority not connected

Acceptance:

- at least one task improves in product-path behavior
- no fake live success
- no default unsafe action
- old Route209/210 benchmarks still pass or unaffected

Suggested commit:

route212: improve top real task blocker

## Phase 2: Fix second blocker or deepen task result

If time remains, fix the second blocker or deepen the first successful task into apply/verification/repair.

Acceptance:

- at least one task reaches a stronger state than baseline
- if confirmed apply occurs, it uses existing backend
- if live provider is blocked, status is NETWORK-BLOCKED or exact failure class
- if verification fails, repair continuation remains honest

Suggested commit:

route212: improve real task execution path

## Phase 3: Final audit

Final audit must decide:

- Did Route212 improve real task capability, not just tests?
- Which tasks improved?
- Which blockers remain?
- Did any fake/focused evidence get mislabeled live?
- Did any default path call provider, apply, or dispatch commands?
- Did any new writer or fuzzy apply appear?
- Did selected workspace apply require explicit authority?
- Did provider secrets or raw output leak?
- Did final status overclaim?

Final status:

- COMPLETE if 3 real task cases were run, at least 1-2 real blockers were fixed, product-path behavior improved, and validation passed.
- PARTIAL if tasks ran but fixes are only demo/focused or no product-path improvement was proven.
- BLOCKED if product task loop cannot safely run.

Suggested commit:

route212: finalize real task sprint audit

## Required validation

Run targeted validation only.

Required:

- Route212 task pack or benchmark
- relevant focused tests for changed modules
- Route209 benchmark
- Route210 benchmark
- Route211 benchmark
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Real provider:

- run at most one explicit live-provider task case if useful
- primary once, fallback once if appropriate
- mark NETWORK-BLOCKED instead of retrying

Do not paste full stdout.

## Final report

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Three required task results
4. Optional task results if any
5. Top blockers found
6. Fixes made
7. Before/after behavior
8. Provider primary/fallback status
9. Apply/verification/repair status
10. Commands run with pass/fail and key fields only
11. Files changed
12. Remaining not-proven claims
13. Next route recommendation
