# Reset Route C: Provider/Proposal Boundary Facade

## Goal

Separate provider receipts from proposal exactness, review state, fallback, retry, and redaction.

Provider-called must not mean proposal-valid. Proposal exact-ready must not mean authority. This route makes that boundary explicit in product code.

Expected final status: `COMPLETE`.

## Scope

Allowed:

- provider receipt facade
- proposal contract facade
- adapters for current planning mutation paths
- focused provider/proposal classification tests
- redaction-safe status projection

Not allowed:

- provider expansion
- live provider default behavior
- auth-core redesign
- write/apply behavior change
- raw provider output in transcript/report
- broad prompt rewrites unless needed to preserve existing behavior

## Required Subagents

1. Provider receipt subagent
   - inspect provider readiness, credential-safe status, provider call receipts, failure classification.
2. Proposal contract subagent
   - inspect exact patch contract, providerEditProposal, anchoredProposal, proposal bridge.
3. Redaction/evidence audit subagent
   - check raw output, oldText/newText, provider.env, live/fake/default labels.

## Phases

### Phase 1: Boundary audit

Identify all places where provider call success, proposal validation, anchor quality, and apply readiness are conflated or co-located.

### Phase 2: Provider receipt facade

Define a stable product facade for:

- provider identity
- provider mode
- provider-called
- readiness/failure class
- retry/fallback info
- redaction status
- raw-output-excluded status

### Phase 3: Proposal contract facade

Define a stable product facade for:

- proposal source
- exactness
- target files
- anchor quality
- review-only status
- unsupported/unsafe status
- redaction-safe review summary

### Phase 4: Compatibility adapters

Adapt current planning mutation, live provider, deterministic proposal, and repair proposal paths to use the facades.

Do not force all legacy fields to move at once.

### Phase 5: Tests and audit

Add focused tests proving:

- provider-called does not imply proposal-valid
- proposal exact-ready does not imply apply authority
- fake/default provider evidence cannot become live
- raw provider output remains excluded

## Completion Criteria

This route is `COMPLETE` only if:

- provider receipt and proposal contract are separated by facades
- current product proposal path still works
- Route228 live-provider success distinctions remain preserved
- default no-provider behavior remains preserved
- raw provider output remains excluded
- no apply behavior changes

## Validation

Run as applicable:

- focused provider/proposal tests
- deterministic no-provider/no-apply checks
- result contract if result/evidence projection touched
- build if TS product code changed
- diff check and status

Do not run live provider unless the route changed provider-facing behavior and explicit opt-in is necessary to validate. If live provider is not run, preserve existing Route228 evidence rather than upgrading claims.

## Stop Conditions

Stop if:

- provider-called becomes proposal/apply success
- raw provider output enters transcript/report
- provider modules import edit authority/writers
- auth or live-provider default behavior would change

## Final Checkpoint Report

Report:

1. Final status
2. Provider receipt facade
3. Proposal contract facade
4. Adapters changed
5. Redaction result
6. Behavior compatibility
7. Tests run
8. Remaining provider/proposal debt
9. Whether safe to continue to Reset Route D

## Next Route

Continue to:

`reset-route-d-edit-verification-repair-facades.md`
