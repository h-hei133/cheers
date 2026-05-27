# Reset Route I: Final Architecture Compatibility Audit

## Goal

Prove the architecture reset preserved current capability claims and did not promote unproven claims.

This route is audit-only plus narrow compatibility fixes. It is not feature development.

Expected final status: `COMPLETE` if compatibility and truthfulness are preserved.

## Scope

Allowed:

- final audit docs
- final compatibility report
- narrow fixes for broken aliases/imports introduced by reset routes
- focused regression selectors

Not allowed:

- feature development
- broad refactor
- new provider behavior
- edit/verification/repair expansion
- weakening evidence gates
- deleting historical evidence

## Required Subagents

1. Capability preservation subagent
   - compare current capability claims against Route227/228 baseline.
2. Import/boundary audit subagent
   - check product/dev/history import boundaries.
3. Script/docs compatibility subagent
   - check aliases, docs indexes, and historical evidence discovery.
4. Truthfulness audit subagent
   - check no PARTIAL/NOT-PROVEN claim was upgraded.

## Phases

### Phase 1: Baseline collection

Collect current claimed capabilities from Route227/228 and post-reset reports.

### Phase 2: Product path smoke

Run a small smoke set appropriate to touched areas:

- no-provider/no-apply default
- deterministic proposal/edit path if edit/proposal touched
- verification/repair smoke if touched
- CLI/session smoke if touched
- package aliases if scripts touched

### Phase 3: Evidence/report gates

Run anti-false-success/evidence gates if evidence/report semantics changed.

### Phase 4: Import/dependency audit

Check:

- product runtime does not import dev/history/docs
- CLI/session use product facades where expected
- provider does not import edit authority
- edit does not import CLI presentation
- result does not import route reports

Use lightweight scans first.

### Phase 5: Final compatibility report

Create or update a final reset compatibility artifact summarizing:

- what changed
- what stayed compatible
- what remains PARTIAL/BLOCKED/NOT-PROVEN
- which routes are safe to start next

## Completion Criteria

This route is `COMPLETE` only if:

- all reset route outputs are accounted for
- required validations pass
- old aliases and current docs remain discoverable
- no product capability regression is found
- no false-success rule is weakened
- import boundary violations are either absent or documented with follow-up debt
- final report honestly classifies remaining issues

## Validation

Run according to touched scope:

- product path smoke tests
- focused capability regressions
- evidence/report gates
- result contract
- package script alias checks
- release deterministic if command routing changed
- build if product TS changed
- diff check and status

Do not run live provider unless provider-facing code changed and explicit opt-in is required for validation.

## Stop Conditions

Stop if:

- capability regression is found and cannot be fixed narrowly
- false-success semantics weaken
- import boundary breaks require broad refactor
- old evidence/route history is not discoverable

## Final Report

Report:

1. Final status
2. Reset routes completed
3. Compatibility validations
4. Product capability preservation
5. Evidence/truthfulness preservation
6. Import/dependency audit summary
7. Scripts/docs compatibility summary
8. Remaining architecture debt
9. Recommended next work

## No Next Reset Route

This is the final route in the current product architecture reset program.

Do not start another structural migration without user review.
