# Route 227A: Live Provider Exact Proposal Contract

## Goal

Fix the Route226 live-provider bottleneck.

Route226 proved that the real CLI/product path can reach the primary SiliconFlow live provider, but all live attempts ended as:

provider-output-insufficient

Route227A must upgrade this from "provider was reached but output was unusable" to:

live provider
-> valid exact proposal
-> exact-ready anchor
-> explicit selected-workspace authority
-> existing exact apply backend
-> task-relevant verification
-> verified success

This route is the first segment of the Route227 final capability upgrade program.

Expected final status: COMPLETE.

Do not close this route as a mere diagnostic or PARTIAL calibration unless a concrete external provider outage/auth/network blocker makes live completion impossible. The work target is a successful live exact proposal on at least one product-path task.

## Current gap

The current product path can do:

- CLI/product planning
- deterministic review proposal
- selected-workspace apply
- task-relevant verification
- repair-required continuation
- evidence verdict

The current product path can also reach live provider.

But live provider output is not yet reliably usable as exact patch evidence.

Route227A must fix the live proposal layer, not rebuild the whole agent.

## Capability to build

Improve live provider proposal generation and classification.

Required capabilities:

1. Strong exact patch prompt contract
   The provider must be instructed to return a minimal exact proposal:
   - targetFile
   - oldText
   - newText
   - reason
   - verificationHint

2. Strict output validation
   Provider output must be classified as:
   - valid-exact-single-target
   - review-only
   - invalid-format
   - target-mismatch
   - old-text-not-found
   - old-text-multiple-matches
   - provider-output-insufficient
   - provider-network
   - provider-auth
   - provider-config
   - provider-route-error

3. Safe output recovery
   Accept only safe recoverable shapes:
   - strict JSON
   - fenced JSON
   - JSON with small surrounding explanation
   - simple single-file diff if it can be converted to exact oldText/newText
   Do not guess missing oldText.
   Do not fuzzy apply.
   Do not invent anchors.

4. Contract retry
   If first live output is provider-output-insufficient or invalid-format, perform at most one contract-repair retry.
   This is not fallback.
   The retry must ask for exact JSON only.
   If retry still fails, classify honestly.

5. Fallback classification
   Use fallback endpoint only for eligible provider/network/endpoint classes.
   Do not use fallback just because the model produced an unsafe proposal unless the route explicitly classifies that policy as safe and records it.
   Fallback must still use approved provider loading and redaction.

6. Product path integration
   This must run through real CLI/product path or accepted product runtime path.
   A route-local script can drive the run, but cannot be the capability.

7. Apply and verification
   If a live proposal becomes exact-ready, it may only apply with explicit selected-workspace authority.
   Apply must use existing exact backend.
   Then dispatch task-relevant verification through the product verification path.
   Success requires verification.

## Required subagents

Use focused subagents, not broad repo reading.

Before implementation:

1. Provider contract subagent
   Inspect local provider prompt/output validation seams and targeted references if needed.
   Report the smallest change to make live provider return exact proposal.

2. Product path subagent
   Inspect CLI/product provider wiring from Route226.
   Report how to keep live provider in real product path and avoid route-local-only success.

3. Parser/anchor subagent
   Inspect existing parser/anchor/proposal normalization.
   Report safe recovery shapes and invalid cases.

After implementation:

1. Redaction and provider audit subagent
   Check no provider.env, API key, raw provider output, oldText, or newText is printed or committed.

2. Evidence audit subagent
   Check live/fake/default labels, provider-called, proposal validation, anchor quality, authority, apply, verification, and final verdict.

Do not run full project archaeology. Each subagent should return short findings and changed local seams.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- gemini-cli
- opencode
- OpenHands
- mini-swe-agent
- inspect_ai

Use only if directly useful.

Suggested mapping:

- gemini-cli: provider prompt, config, redaction
- opencode: provider/tool permission flow
- OpenHands: action/output observation classification
- mini-swe-agent: minimal patch-generation loop
- inspect_ai: live attempt result classification

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route226 evidence and local provider seams were sufficient.

## Provider environment

The user has configured:

- PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real
- primary SiliconFlow endpoint: https://api.siliconflow.cn/v1
- fallback SiliconFlow endpoint: https://api.siliconflow.com/v1
- model: deepseek-ai/DeepSeek-V4-Flash

Use only the existing approved provider loading path.

Never print, cat, quote, commit, or manually expose provider.env.

Never print API keys.

Never print raw provider output.

Never print oldText or newText.

Reports may include redacted status, provider kind, endpoint class, model label, failure class, and counters.

## Phases

### Phase 1: Route226 failure audit and exact contract design

Goal:

Understand why Route226 ended in provider-output-insufficient without printing raw provider output.

Do:

- inspect Route226 report and product provider path
- inspect provider prompt contract
- inspect provider output validator
- inspect anchor/proposal normalization
- identify minimal exact JSON contract
- identify exact retry prompt

Deliverable:

- short internal summary in final report
- no raw provider output

Focused audit:

- no sensitive output read or printed
- no manual provider.env exposure

### Phase 2: Provider prompt and output recovery

Goal:

Make provider output more likely to become valid-exact-single-target.

Do:

- strengthen exact proposal prompt
- require one target file
- require oldText to be copied exactly from current file
- require oldText to occur once
- require newText
- prohibit markdown unless parser supports fenced JSON safely
- add safe recovery parser only for explicit shapes
- keep unsafe output review-only or invalid

Focused audit:

- no fuzzy anchor
- no guessed oldText
- no broad apply
- no raw provider output logging

### Phase 3: Contract retry and fallback classification

Goal:

Handle output-insufficient correctly.

Do:

- add at most one contract-repair retry for provider-output-insufficient or invalid-format
- keep retry redacted
- classify retry result separately
- use fallback only for eligible endpoint/network/provider route failures
- record why fallback was or was not attempted

Focused audit:

- retry does not become infinite
- retry does not imply apply
- fallback is not used to hide local route bugs
- fake/default evidence cannot become live

### Phase 4: Live product-path exact proposal capstone

Goal:

Run 3-5 small live product-path tasks.

Task mix:

1. tiny explicit single-file edit
2. small vague bugfix or output-improvement
3. selected-workspace apply candidate
4. task-relevant verification candidate
5. optional failure-classification task

Minimum successful target:

At least one task must reach:

- provider-called=true
- providerEvidence=live-provider-proven
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready
- explicit selected-workspace authority
- apply through existing exact backend
- task-relevant verification passed
- final verdict verified-success

All other tasks must be honestly classified.

Focused audit:

- exact-ready does not imply authority
- apply requires explicit authority
- provider-call-during-apply=false
- verification is not selected-not-run
- command-only bypass remains rejected

### Phase 5: Route227A report, gate, and handoff to Route227B

Create:

docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json

Report must include:

- schemaVersion
- route=route227a
- routeType=live-provider-capability
- finalStatus
- primaryEvidence
- providerAttempts
- liveTasksAttempted
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims
- redactionChecks
- fallbackDecision
- contractRetryEvidence
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227a verifier only if useful. If added, it must separate default-safe from explicit live run.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-live-provider-opt-in-classification
- frozen-command-only-bypass-negative-control
- frozen-lower-bound-stable-selected-workspace-authority-case

These protect the lower bound.

## Completion criteria

Route227A is COMPLETE only if:

- live provider is disabled by default
- explicit live opt-in reaches approved provider path
- at least one live provider product-path task produces valid exact proposal
- at least one live exact proposal reaches exact-ready anchor
- at least one live exact-ready proposal is explicitly authorized, applied, and verified
- no provider output, oldText, newText, API key, or private config is printed
- fallback and retry are classified honestly
- command-only bypass remains rejected
- fake/default evidence is not labeled live
- Route221 report gate passes
- final report justifies COMPLETE from live/product evidence

If live provider cannot be reached due to auth/network/provider outage after approved attempts, classify BLOCKED with failure class.

If provider is reached but never produces usable exact proposal after retry, do not claim COMPLETE. Record the blocker for Route227I, but continue trying allowed prompt/contract/task-shaping changes before stopping.

## Scope

Allowed:

- provider prompt contract
- provider output parser/recovery
- contract retry
- fallback classification
- CLI/product live provider proposal wiring
- exact proposal validation
- anchor classification
- report artifact
- focused tests for parser/classification/redaction/default-safe

Avoid unless necessary:

- large CLI refactor
- large runMvpIntegratedFlow refactor
- large SessionManager refactor
- broad edit engine changes
- broad Claim Ledger rewrite

Not allowed:

- live provider by default
- provider call during apply
- production workspace write by default
- new writer
- fuzzy apply as success
- arbitrary shell expansion
- new dependencies
- browser/MCP work
- raw provider output logging
- raw oldText/newText logging
- manual private config reads outside approved path
- fake/default evidence labeled live success

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227a:
- do not push
- do not commit failing states
- do not commit audit residue
- do not commit provider.env or secrets
- final report lists phase commits

Commits are optional, not mandatory.

## Final report

Do not paste full stdout.

Do not print secrets, raw provider output, oldText, or newText.

Include:

1. Final status
2. Phase commits
3. Route226 failure class summary
4. Provider contract changes
5. Output recovery and retry behavior
6. Primary provider result
7. Fallback decision and result
8. Live exact proposal result
9. Apply and verification result
10. Redaction checks
11. Negative controls
12. Route221 gate result
13. Reference adoption table or not-inspected statement
14. Validation commands with pass/fail
15. Files changed
16. Remaining not-proven claims
17. What capability increased
18. What lower-bound safety was preserved
19. Next route: docs/agent-routes/route227b-context-planning-elite-upgrade.md

## Next route

After Route227A is complete, continue with:

docs/agent-routes/route227b-context-planning-elite-upgrade.md

Route227B will upgrade Context Engine, Planning Runtime, repo intelligence, code graph, memory reuse, test adjacency, and edit-target ranking so the live proposal capability from Route227A has better task context and target selection.
