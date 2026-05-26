# Route 228: Live Provider Exact Proposal Success Cut-through

## Goal

Cut through the live-provider bottleneck.

Route227A reached the real CLI/product live provider path, but ended PARTIAL:

- provider-called=true
- proposalValidation=review-only
- anchorQuality=review-only
- apply=blocked
- verification=not-run
- verified live exact proposal success not proven

Route228 must turn this into at least one live-provider product-path success:

real CLI/product path
-> live provider called
-> valid exact proposal
-> exact-ready anchor
-> explicit selected-workspace authority
-> existing exact apply backend
-> task-relevant verification
-> verified success

Expected final status: COMPLETE.

If provider/auth/network is truly unavailable, report BLOCKED. If provider responds but still cannot produce usable exact proposal after the allowed fixes, report PARTIAL honestly. Do not fake success with deterministic proposal.

## Main problem to solve

Before changing prompts broadly, audit the Route227A contradiction:

- providerFailureClass=auth
- exitCode=0
- providerCalled=true
- proposalValidation=review-only
- contractRetry not attempted

Route228 must explain whether this is:

1. real auth failure misclassified,
2. provider returned usable text but parser downgraded it,
3. provider returned review text instead of exact JSON,
4. CLI smoke path swallowed provider failure,
5. contract retry trigger bug,
6. report classification bug.

This diagnosis is mandatory.

## Required subagents

Use focused subagents only.

Before implementation:

1. Provider classification subagent
   Inspect Route227A live result, provider attempt classifier, exit/status mapping, auth/network/error classes, and retry trigger.

2. Exact proposal contract subagent
   Inspect live provider prompt, output parser, exact proposal schema, anchor classifier, and review-only fallback.

3. Product path subagent
   Inspect real CLI/product path from cliPlanningMutationExecution through runMvpIntegratedFlow and planningRuntimeProductProposal.

After implementation:

1. Redaction audit subagent
   Confirm no provider.env, API key, raw provider output, oldText, or newText is printed or committed.

2. Live evidence audit subagent
   Confirm fake/default/deterministic evidence did not become live-provider success.

3. Apply/verification audit subagent
   Confirm exact-ready did not imply authority, apply used existing backend, provider-call-during-apply=false, and success required verification.

## Provider policy

Use only approved provider loading path.

User has private provider config at /home/wang/.private-agents-real/provider.env.

Never print, cat, quote, commit, or manually parse provider.env.

Never print:

- API keys
- raw provider output
- oldText
- newText
- private config contents

Use primary SiliconFlow first.

Fallback only for eligible provider/network/endpoint failure. Do not fallback for local route bug, missing authority, unsafe proposal, apply failure, verification failure, or provider output that is simply unsafe unless explicitly classified safe.

For provider-output-insufficient or invalid-format, allow at most one contract-repair retry.

## Phases

### Phase 1: Route227A failure audit

Inspect:

- route227a report
- live provider attempt classifier
- provider output classification path
- contract retry trigger
- CLI live-provider proposal wiring
- report generation path

Deliver:

- exact explanation for auth+exitCode0+review-only
- whether contract retry should have triggered
- whether provider output was redacted correctly
- whether report classification was correct

No raw provider output may be printed.

### Phase 2: Fix classification and retry trigger

Fix only what is needed.

Required behavior:

- auth/network/endpoint failure classified separately from output-insufficient
- exitCode=0 cannot automatically erase provider failure class
- review-only provider output is distinguished from invalid-format and output-insufficient
- contract retry triggers exactly once for invalid-format or output-insufficient
- retry does not trigger for missing authority, apply failure, verification failure, or unsafe local bug
- fallback eligibility remains narrow

Add focused tests.

### Phase 3: Tight live exact proposal contract

Improve live prompt and parser for a tiny exact task.

Provider must be asked for a minimal exact proposal:

- targetFile
- oldText
- newText
- reason
- verificationHint

Rules:

- one file only
- oldText copied exactly from current file
- oldText must occur once
- no broad refactor
- no markdown unless parser safely extracts fenced JSON
- no guessing anchors

Safe recovery allowed:

- strict JSON
- fenced JSON
- JSON with small surrounding explanation
- simple single-file diff only if exact oldText/newText can be derived safely

No fuzzy apply.

### Phase 4: Live tiny-task success path

Run 3 small live product-path tasks.

Task 1 must be tiny, explicit, single-file, low ambiguity.

Task 2 may be a small output improvement.

Task 3 may be a second tiny exact case or fallback/classification case.

At least one task must reach:

- providerCalled=true
- providerEvidence=live-provider-proven
- proposalValidation=valid-exact-single-target
- anchorQuality=exact-ready
- explicit selected-workspace authority
- apply.status=applied
- provider-call-during-apply=false
- task-relevant verification passed
- finalVerdict=verified-success

Other tasks may be PARTIAL if classified honestly.

### Phase 5: Report and validation

Create:

docs/implementation-context/route228-live-provider-exact-proposal-success-cut-through-report.json

Report must include:

- schemaVersion
- route=route228
- routeType=live-provider-cut-through
- finalStatus
- primaryEvidence
- route227aFailureDiagnosis
- providerAttempts
- contractRetryEvidence
- fallbackDecision
- liveTasksAttempted
- applyEvidence
- verificationEvidence
- redactionChecks
- requiredNegativeControls
- taskVerdicts
- notProvenClaims
- referenceAdoption if any references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route228-live-provider-exact-proposal-success-cut-through-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- focused tests for touched modules
- git diff --check
- git status --short --branch

Add verify:route228-live-provider-exact-proposal-success-cut-through only if useful.

## Required frozen tasks

Load from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-live-provider-opt-in-classification
- frozen-lower-bound-stable-selected-workspace-authority-case
- frozen-command-only-bypass-negative-control

These protect lower-bound truth.

## Completion criteria

Route228 is COMPLETE only if:

- live provider disabled by default
- approved opt-in live provider path called
- Route227A failure-class contradiction explained or fixed
- at least one live provider output becomes valid exact proposal
- at least one live proposal reaches exact-ready anchor
- exact-ready proposal applies only after explicit selected-workspace authority
- apply uses existing exact backend
- provider-call-during-apply=false
- task-relevant verification passes
- final verdict is verified-success
- no raw provider output, oldText, newText, provider.env, or API key is printed
- deterministic/fake/default evidence is not used as live success
- command-only bypass remains rejected
- Route221 report gate passes

If live provider cannot authenticate or endpoint is unavailable, finalStatus=BLOCKED.

If provider is reached but exact proposal still fails after one contract retry, finalStatus=PARTIAL with exact failure class.

## Scope

Allowed:

- provider attempt classifier
- live provider prompt contract
- output parser/recovery
- contract retry trigger
- live provider proposal report
- CLI/product live proposal wiring
- focused tests
- narrow Route221 gate update for routeType if needed

Avoid unless necessary:

- broad CLI refactor
- broad planning rewrite
- edit engine expansion
- verification engine expansion
- session rewrite
- browser/MCP work

Not allowed:

- provider by default
- production write by default
- new unrestricted writer
- fuzzy apply as success
- arbitrary shell expansion
- raw provider output logging
- raw oldText/newText logging
- manual provider.env parsing
- fake/deterministic evidence as live-provider success
- route-local script as primary COMPLETE evidence

## Final report

Do not paste full stdout.

Include:

1. Final status
2. Route227A failure diagnosis
3. Provider classification changes
4. Contract retry behavior
5. Primary provider result
6. Fallback decision
7. Live exact proposal evidence
8. Apply evidence
9. Verification evidence
10. Redaction checks
11. Negative controls
12. Route221 gate result
13. Validation pass/fail
14. Files changed
15. Remaining not-proven claims
16. Recommended next route
