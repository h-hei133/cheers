# Route 221C: Evidence Provenance Gate

## Goal

Route221 created the anti-false-success harness.
Route221B made future route reports machine-checkable.

Route222 reality audit exposed a new bypass:

- the report referenced a frozen task id
- the report passed the Route221B static report gate
- but the execution evidence came from a route-local script/harness
- the frozen task definition was not loaded and executed as the driver
- the repair proposal was hardcoded
- confirmation was a harness boolean
- verification was readback-only inside a fixture
- therefore COMPLETE was too strong

Route221C must close this evidence provenance gap.

This is not a coding-agent feature route.
Do not implement repair, provider, planning, apply, or verification runtime capability.

Route221C must extend the Route221B report gate so future route reports cannot claim product/frozen COMPLETE unless they record and pass evidence-source checks.

## Core principle

A valid report is not enough.

A future route must prove where its evidence came from:

- frozen task definition loaded from frozen-capability-tasks-route221.json
- task prompt or task id actually used as route driver
- product path or accepted composition root actually consumed the task
- proposal source was not hardcoded route-local text when claiming product/frozen repair success
- confirmation source was not merely a harness boolean when claiming product confirmation
- verification source was appropriate for the frozen task
- helper-only composition is not product-proven
- route-local harness evidence is secondary unless explicitly scoped as benchmark/focused evidence

## Completion rule

COMPLETE requires:

- future route report template updated with machine-checkable evidence provenance fields
- anti-false-success verifier updated to validate evidence provenance
- good report fixture passes
- bad report fixtures fail for the new bypass classes
- an old-Route222-style report fixture fails under Route221C rules
- Route221B existing good/bad fixtures still behave correctly
- no runtime behavior change
- no new coding-agent capability
- no provider run
- validation passes

PARTIAL if provenance is only documented but not enforced by the verifier.

BLOCKED if the existing static report gate cannot be extended without broad churn.

## Phase and commit policy

Execute in phases.

For each phase:

1. Inspect only the local harness files and templates needed.
2. Implement the phase.
3. Validate.
4. Audit.
5. If green, commit with message starting route221c:.

Rules:

- Do not push.
- Do not commit failing states.
- Maximum 3 commits.
- No runtime feature changes.
- No broad refactor.
- No live provider.
- No raw provider output.
- No private config reads.

## Files in scope

Allowed:

- docs/implementation-context/future-route-report-template-route221.md
- docs/implementation-context/capability-evidence-schema-route221.md if a short provenance note is needed
- docs/implementation-context/route221c-report-fixtures/
- docs/implementation-context/route222-reality-audit-downgrade.md if useful
- scripts/verify-route221-anti-false-success-gate.mjs
- package.json only if a new script alias is needed

Avoid:

- runtime files under packages/ts-shell unless absolutely necessary

Not allowed:

- new writer
- fuzzy apply
- repair runtime implementation
- provider behavior changes
- live provider run
- new dependencies
- broad Claim Ledger rewrite
- manual private config reads

## Phase 0: Define provenance model

Purpose:

Add a machine-checkable provenance section to the future route report template.

Required report fields:

```json
{
  "primaryEvidence": {
    "source": "frozen-task-product-path",
    "frozenTaskId": "frozen-upper-bound-challenge-verification-failure-repair-case",
    "frozenTaskLoadedFromFile": true,
    "frozenTaskPromptHash": "sha256-or-stable-fingerprint",
    "executionEntrypoint": "product-runtime | product-composition-root | route-gate | helper-composition | route-local-script-only",
    "productConsumer": "module/function or null",
    "routeLocalHarnessUsed": false,
    "helperOnlyComposition": false,
    "proposalSource": "live-provider | deterministic-from-product-read-evidence | deterministic-from-failure-evidence | route-local-hardcoded | fake-focused | not-applicable",
    "confirmationSource": "product-approval | explicit-authority-contract | harness-boolean | none",
    "verificationSource": "task-relevant-command | product-verification-route | runtime-readback | fixture-readback-only | marker-only | not-run"
  }
}
```
Also allow per-task provenance overrides inside taskVerdicts when needed.

Deliverable:

update future-route-report-template-route221.md
document allowed provenance values and meanings

Acceptance:

template explains that frozen task id reference is not enough
template explains helper-only composition cannot be product-proven
template explains hardcoded repair proposal cannot prove frozen repair-to-success
template explains harness boolean confirmation cannot prove product confirmation

Optional commit:

route221c: document evidence provenance report shape

Phase 1: Extend verifier provenance checks

Purpose:

Update scripts/verify-route221-anti-false-success-gate.mjs.

New verifier rules:

If finalStatus is COMPLETE for a capability route, primaryEvidence must exist.
If a frozen task is primary COMPLETE evidence, primaryEvidence.frozenTaskLoadedFromFile must be true.
If a frozen task is primary COMPLETE evidence, primaryEvidence.frozenTaskId must be a known frozen task id.
If claiming product-proven, executionEntrypoint must not be route-local-script-only.
If claiming product-proven, helperOnlyComposition must not be true.
If claiming frozen repair-to-success COMPLETE, proposalSource must not be route-local-hardcoded or fake-focused.
If claiming frozen repair-to-success COMPLETE, confirmationSource must not be harness-boolean.
If claiming frozen repair-to-success COMPLETE, verificationSource must not be marker-only, not-run, or fixture-readback-only.
If routeLocalHarnessUsed is true, the report must still identify separate primary frozen/product evidence; otherwise COMPLETE is rejected.
If primaryEvidence.source is route-local-benchmark, finalStatus cannot be COMPLETE.
Route-local tasks remain secondary and cannot become primary COMPLETE evidence.
Existing Route221B checks must still pass.

The verifier should keep static scope.
It should not execute the frozen task.

Optional commit:

route221c: enforce evidence provenance gate

Phase 2: Add good and bad provenance fixtures

Purpose:

Add fixtures that prove the new gate catches the Route222 bypass class.

Add one good fixture:

frozen task loaded from file
known frozen task id
product-composition-root or product-runtime entrypoint
helperOnlyComposition=false
proposalSource=deterministic-from-failure-evidence or live-provider
confirmationSource=explicit-authority-contract or product-approval
verificationSource=product-verification-route or task-relevant-command
route-local tasks secondary

Add bad fixtures:

frozen task id referenced but frozenTaskLoadedFromFile=false
primary evidence source route-local-benchmark
executionEntrypoint=route-local-script-only with product-proven COMPLETE
helperOnlyComposition=true with product-proven COMPLETE
proposalSource=route-local-hardcoded for repair-to-success COMPLETE
confirmationSource=harness-boolean for repair-to-success COMPLETE
verificationSource=fixture-readback-only for frozen repair-to-success COMPLETE
routeLocalHarnessUsed=true without separate primary frozen/product evidence
old Route222-style report passes old fields but fails provenance

Acceptance:

built-in verifier passes good fixture
built-in verifier rejects all bad fixtures
explicit --report works with good fixture
explicit --report rejects at least one bad fixture when run manually or through built-in suite

Optional commit:

route221c: add provenance report fixtures

Phase 3: Route222 downgrade note

Purpose:

Record the Route222 reality audit conclusion durably so future sessions do not build on the overclaim.

Deliverable:

docs/implementation-context/route222-reality-audit-downgrade.md

Must state:

original Route222 COMPLETE is too strong
accurate status is PARTIAL for product repair-to-success
helper composition proof is useful but not product-proven
frozen task id was referenced, not executed from frozen task definition
repair proposal was hardcoded
confirmation was harness boolean
post-repair verification was fixture readback
Route222B should redo repair-to-success after Route221C

Do not modify Route222 runtime unless needed to keep gates passing.

Optional commit:

route221c: record route222 provenance downgrade

Phase 4: Final validation and audit

Required validation:

npm run verify:route221-anti-false-success-gate
npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route221c-report-fixtures/good-provenance-report.json
npm run verify:result-contract
npm run build -w packages/ts-shell
git diff --check
git status --short --branch

Do not run live provider.

Final audit must answer:

Does the gate now reject frozen task id reference without frozen task loading?
Does it reject helper-only composition as product-proven COMPLETE?
Does it reject hardcoded repair proposal as frozen repair-to-success COMPLETE?
Does it reject harness boolean confirmation as product confirmation?
Does it reject fixture-readback-only verification for frozen repair-to-success COMPLETE?
Do prior Route221B fixture checks still pass?
Is Route222 downgraded clearly?
Can Route222B safely proceed?
Final report

Include:

Final status: COMPLETE / PARTIAL / BLOCKED
Phase commits
Provenance fields added
New verifier rules
Good fixture result
Bad fixtures rejected
Route222 downgrade note
Validation pass/fail
Files changed
Remaining risks
Recommended next route
