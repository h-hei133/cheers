# Route 226: Opt-in Live Provider Product Path Capstone

## Goal

Run an explicit opt-in live provider capstone through the real CLI / product path.

Route225 made the capstone loop user-visible from real CLI / print / session product path. Route226 must now answer the next question:

Can a real provider participate in that product path and produce useful proposal evidence without weakening safety or false-success rules?

Target loop:

real CLI / product prompt
-> Context Engine / Planning Runtime
-> approved live provider proposal
-> output validation
-> exact anchor or honest review/invalid classification
-> explicit selected-workspace authority if apply is allowed
-> existing exact apply backend
-> task-relevant verification dispatch
-> repair-required or repair-to-success if applicable
-> final evidence verdict

This is an opt-in live route. Live provider must never become default behavior.

The target is not "all live tasks must pass." The target is:

- live provider is actually reached through approved provider path
- primary and fallback provider outcomes are classified
- any successful proposal is validated, anchored, applied only with explicit authority, and verified
- any failure is classified honestly
- no fake/default/focused evidence is labeled live success
- real provider output and secrets remain redacted

## Provider configuration

User has configured private real provider environment at:

/home/wang/.private-agents-real/provider.env

Known intended profile:

- primary provider: siliconflow
- primary base URL: https://api.siliconflow.cn/v1
- primary model: deepseek-ai/DeepSeek-V4-Flash
- fallback provider: siliconflow
- fallback base URL: https://api.siliconflow.com/v1
- fallback model: deepseek-ai/DeepSeek-V4-Flash

Do not print API keys.

Do not cat, quote, commit, or log provider.env.

Use only the existing approved real-provider loading path and isolated runtime homes.

If the existing approved path already reads PRIVATE_AGENTS_REAL_HOME, use that. Do not manually parse private config unless existing project conventions explicitly require it.

## Completion contract

Expected target: COMPLETE if at least one live-provider product-path task reaches verified success or verified-success-with-repair, and all other live attempts are honestly classified.

COMPLETE requires:

- explicit live opt-in
- no live provider call by default
- provider evidence is live-provider-proven, not fake/focused/default-safe
- executionEntrypoint is real-cli-product-path or product-runtime
- productConsumer names the product modules used
- routeLocalHarnessUsed is false for primary evidence, or route-local evidence remains secondary
- helperOnlyComposition=false
- provider-called=true for at least one primary or fallback attempt
- provider profile is classified as primary or fallback
- provider failure classes are preserved when failures occur
- raw provider output, oldText, newText, API key, and private paths are not printed
- provider proposal goes through output validation
- proposal goes through anchor quality classification
- exact-ready does not imply apply
- apply requires explicit selected-workspace authority
- apply uses existing exact backend only
- provider-call-during-apply=false
- verification is task-relevant-command or product-verification-route
- command-only bypass remains rejected
- final verdict follows weakest evidence
- Route221 report gate passes
- independent audit returns PASS or finalStatus remains PARTIAL

PARTIAL if:

- live provider is not reached
- provider is reached but no proposal is usable
- only route-local script evidence exists
- proposal is review-only or invalid but honestly classified
- apply does not run because authority is missing
- verification is selected-not-run
- all successful evidence is deterministic/fake/focused
- fallback is configured but not exercised when primary fails with eligible provider/network class

BLOCKED if:

- approved provider loading cannot safely run
- provider auth/network fails for both primary and fallback
- product path cannot safely call live provider without a separate route
- applying live output would require fuzzy/broad writer or unsafe workspace authority

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-live-provider-opt-in-classification
- frozen-command-only-bypass-negative-control
- frozen-lower-bound-stable-selected-workspace-authority-case

Recommended if cheap:

- frozen-session-continuity-result-truth
- frozen-upper-bound-challenge-verification-failure-repair-case

These protect the lower bound while Route226 tests the live upper bound.

## Live capstone task pack

Run 3-5 small live-provider product-path tasks.

Task shapes:

1. tiny exact single-file task
   Goal: maximize chance of exact oldText/newText proposal and verified success.

2. vague bugfix or output-improvement task
   Goal: test planning -> live provider proposal -> review/exact classification.

3. selected-workspace authorized apply task
   Goal: if exact-ready, apply with explicit authority and verify.

4. verification failure classification task
   Goal: failed relevant command must not become success.

5. optional repair task
   Goal: if verification fails and repair is safe, produce repair-required or repair-to-success evidence.

Do not force all tasks to pass.

A high-quality PARTIAL task with accurate failure classification is acceptable.

## Fallback policy

Use primary provider first.

Use fallback provider at most once per eligible failure class.

Eligible fallback classes:

- provider network failure
- provider endpoint unavailable
- provider route failure where fallback endpoint may differ
- provider response format failure only if product policy says retry/fallback is safe

Do not fallback for:

- local route bug
- invalid workspace authority
- unsafe proposal
- user confirmation missing
- apply failure
- verification failure after apply
- command failure unrelated to provider
- auth failure unless existing provider policy explicitly allows fallback auth comparison

Record:

- primary attempted
- primary outcome
- fallback attempted
- fallback outcome
- reason fallback was or was not attempted

Fallback success is live-provider-proven only if it used approved live provider path and redaction rules.

## Evidence report

Create:

docs/implementation-context/route226-live-provider-product-path-capstone-report.json

Report must include:

- schemaVersion
- route=route226
- routeType=live-provider-capstone
- finalStatus
- independentAuditResult
- independentPassRerun if needed
- primaryEvidence
- frozenTasksAttempted
- liveProviderTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- providerAttempts
- taskVerdicts
- notProvenClaims
- redactionChecks

Each live task verdict should include:

- prompt path used
- productConsumer
- provider mode
- provider profile: primary or fallback
- provider-called
- provider failure class if any
- proposal validation
- anchor quality
- confirmation / authority source
- apply status
- verification status
- repair status if any
- provider-call-during-apply
- raw output redaction status
- final verdict
- not-proven claims

Run:

npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route226-live-provider-product-path-capstone-report.json

If the existing gate rejects routeType=live-provider-capstone while the report is otherwise valid, update the gate narrowly without weakening Route221 rules.

## Milestone style and commits

Work fast in audited milestones.

After a milestone passes focused validation and audit, Codex may commit it to keep the working tree readable.

Commit rules:

- commit message starts with route226:
- do not push
- do not commit failing states
- do not commit audit residue
- do not commit private provider config
- final report lists phase commits

Suggested milestones:

1. Report baseline, frozen task loading, default no-live guard
2. Approved primary live provider product-path attempt
3. Fallback classification if primary fails with eligible class
4. Exact proposal -> apply -> verification for at least one safe task if possible
5. Final report, gate, audit, cleanup

## Scope

Allowed:

- live provider product-path driver
- product path provider proposal wiring
- provider attempt classification
- fallback attempt classification
- live provider capstone report
- redaction checks
- small updates to existing provider/readiness/proposal classification
- narrow Route221 gate update for live-provider-capstone report type
- focused tests for classification/redaction/fallback logic

Avoid unless necessary:

- large CLI refactor
- large runMvpIntegratedFlow refactor
- large SessionManager refactor
- broad Claim Ledger rewrite
- broad edit engine work

Not allowed:

- live provider by default
- production workspace write by default
- new writer
- fuzzy apply as success
- arbitrary shell expansion
- new dependencies
- browser/MCP work
- committing provider.env
- printing API keys
- printing raw provider output
- printing oldText/newText
- manual private config reads outside approved path
- fake/default evidence labeled live success

## Reference policy

No broad reference scan.

Use references only for concrete blockers.

Reference pool under /home/wang/projects:

- opencode
- OpenHands
- mini-swe-agent
- gemini-cli
- inspect_ai

Suggested targeted references:

- opencode for provider/tool permission flow
- OpenHands for live action/result trajectory
- mini-swe-agent for minimal live issue loop
- gemini-cli for provider/config redaction patterns
- inspect_ai for live eval result classification

If references are inspected, include reference adoption table.

If not inspected, state:

not-inspected; local Route225 and Route221 evidence was sufficient.

## Validation

Required default checks:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route226-live-provider-product-path-capstone-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Required live run:

Run the Route226 live provider capstone only with explicit opt-in and approved private provider loading.

The live run should use the existing provider.env through approved project path, not by printing it.

If provider/network/auth fails, record failure class and fallback result if eligible.

Add a route226 verifier only if useful:

npm run verify:route226-live-provider-product-path-capstone

If added, it must clearly separate default safe run from explicit live run.

## Final audit questions

Final audit must answer:

- Was live provider disabled by default?
- Was provider.env kept private and unprinted?
- Was provider called through approved path?
- Was primary provider attempted?
- Was fallback attempted only when eligible?
- Were provider failures classified?
- Did any fake/default evidence get labeled live?
- Did provider output pass validation before anchor/apply?
- Did exact-ready avoid implying apply?
- Did apply require explicit selected-workspace authority?
- Was provider-call-during-apply false?
- Was task-relevant verification dispatched when success was claimed?
- Did command-only bypass remain rejected?
- Did Route221 gate pass?
- Is COMPLETE/PARTIAL/BLOCKED justified by weakest evidence?

## Final report

Do not paste full stdout.

Do not print provider secrets, raw provider output, oldText, or newText.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. Frozen tasks attempted
4. Live provider tasks attempted
5. Primary provider result
6. Fallback provider result
7. Exact proposal / review-only / invalid classifications
8. Apply behavior
9. Verification behavior
10. Repair behavior if touched
11. Redaction checks
12. Negative controls
13. Route221 gate result
14. Reference adoption table or not-inspected statement
15. Validation commands with pass/fail
16. Files changed
17. Remaining not-proven claims
18. What live-provider ceiling increased
19. What lower-bound safety was preserved
20. Recommended next route
