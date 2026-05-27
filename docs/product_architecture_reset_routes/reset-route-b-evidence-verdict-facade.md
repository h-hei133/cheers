# Reset Route B: Evidence/Verdict Facade

## Goal

Introduce a product-owned evidence, claim, and verdict facade without changing capability behavior.

The current project has strong anti-false-success ideas, but they are spread across runtime projections, result mapping, route reports, report gates, and route runners. This route begins moving that concept into a product-owned layer.

Expected final status: `COMPLETE`.

## Scope

Allowed:

- new or existing evidence/verdict facade files
- compatibility adapters for existing report consumers
- small result projection adjustments if needed
- tests for evidence/verdict truthfulness
- report-safe redaction and cleanup status shape

Not allowed:

- changing provider behavior
- changing write authority
- changing verification behavior
- changing CLI UX except if needed to consume the facade without semantic change
- weakening Route221/Route227/Route228 evidence distinctions
- deleting old reports or old report fields

## Design Principle

Capabilities produce evidence. Evidence is evaluated into claims. Claims determine verdicts. Result/session/CLI present verdicts. Reports summarize verdicts.

Reports must not become the source of runtime truth.

## Required Subagents

1. Evidence surface subagent
   - inspect claimLedger/resultMapper/sessionTerminalState/report gates and identify the smallest product facade.
2. Compatibility adapter subagent
   - inspect route report consumers and propose adapters that preserve old field shapes.
3. Truthfulness audit subagent
   - check false-success patterns and not-proven/partial/stopped semantics.

## Phases

### Phase 1: Current evidence inventory

Use Reset Route A outputs plus current code to map evidence/verdict surfaces.

Identify:

- runtime evidence producers
- claim/verdict projections
- result/session consumers
- report/gate consumers
- duplicated or route-specific evidence fields

### Phase 2: Define facade shape

Create or strengthen a product facade for:

- evidence row
- provenance/source
- redaction status
- receipt reference
- claim input
- verdict
- not-proven claim
- report-safe summary

Keep it small. Do not attempt to model every historical report field.

### Phase 3: Add compatibility adapters

Provide adapters so existing route reports and gates can consume the product facade without breaking old schemas.

Do not remove old fields yet.

### Phase 4: Wire selected product consumers

Move a minimal set of product consumers to the facade, such as result projection or a current capability route, without changing behavior.

### Phase 5: Focused truthfulness tests

Add focused tests covering:

- not-run is not success
- apply without verification is not success when verification is required
- repair proposal is not repair success
- fake/focused/default-safe is not live/product success
- partial remains partial

## Completion Criteria

This route is `COMPLETE` only if:

- product evidence/verdict facade exists or is clearly strengthened
- at least one product path consumes it
- existing report/gate compatibility is preserved
- not-proven/partial semantics are not weakened
- focused evidence/verdict tests pass
- Route221 anti-false-success gate still passes if touched
- result contract passes if result/session behavior is touched

## Validation

Run as applicable:

- focused evidence/verdict tests
- anti-false-success gate if evidence/report code changed
- result mapper/session truthfulness tests if touched
- `npm run build -w packages/ts-shell` if TS product code changed
- `git diff --check`
- `git status --short --branch`

## Stop Conditions

Stop if:

- any not-proven/partial/stopped state becomes success
- old report consumers break
- product runtime must import route reports/docs
- behavior change becomes necessary outside facade/adapters

## Final Checkpoint Report

Report:

1. Final status
2. Facade files changed
3. Compatibility adapters added
4. Product consumers migrated
5. Truthfulness tests
6. Old schemas preserved
7. Remaining evidence debt
8. Whether safe to continue to Reset Route C

## Next Route

Continue to:

`reset-route-c-provider-proposal-boundary-facade.md`
