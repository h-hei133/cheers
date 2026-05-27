# Reset Route H: Route History Quarantine Move

## Goal

Move route/history artifacts behind dev-history/evidence-history namespaces after aliases and indexes exist.

This route should reduce product-surface route pollution while preserving provenance and compatibility.

Expected final status: `COMPLETE`.

## Scope

Allowed:

- move or mirror route/history docs when safe
- move or mirror route-history scripts when aliases exist
- add compatibility links or indexes
- update docs indexes
- preserve provenance metadata

Not allowed:

- product behavior changes
- report field changes
- deleting route history
- breaking old command aliases
- moving product runtime files

## Prerequisites

Reset Route A inventory must exist.

Reset Route G aliases/indexes should exist for scripts/package commands.

If prerequisites are missing, stop or complete as PARTIAL with a plan.

## Required Subagents

1. Docs quarantine subagent
   - identify docs safe to move/mirror and required links.
2. Scripts quarantine subagent
   - identify route-history scripts safe to move/mirror after alias coverage.
3. Provenance audit subagent
   - check old reports and route evidence remain discoverable.

## Phases

### Phase 1: Quarantine readiness audit

Use inventories and aliases to identify safe candidates.

### Phase 2: Docs quarantine

Move or mirror a conservative set of historical route docs behind a dev-history namespace if compatibility is clear.

If moving is risky, create an index and mark future move plan instead.

### Phase 3: Evidence report quarantine

Move or mirror historical route reports only if report discovery, provenance, and compatibility links are preserved.

### Phase 4: Script quarantine

Move or mirror route-history scripts only when old package aliases still resolve.

### Phase 5: Index and status updates

Update docs/script indexes so current docs stay clear and history remains discoverable.

## Completion Criteria

This route is `COMPLETE` only if:

- route/history artifacts are quarantined or an explicit compatibility-preserving index is created
- old references remain discoverable
- provenance is preserved
- old command aliases still work
- product runtime does not import dev/history locations
- no product behavior changes

If actual moves are unsafe, this route may be `PARTIAL` with quarantine readiness artifacts only.

## Validation

Run:

- docs path/link checks where possible
- representative old alias checks
- representative new alias checks
- diff check and status

Run build/tests only if product code changed, which should normally not happen.

## Stop Conditions

Stop if:

- old evidence reports become undiscoverable
- old route scripts break without alias
- product runtime imports route history
- provenance would be lost

## Final Checkpoint Report

Report:

1. Final status
2. Artifacts moved or indexed
3. Compatibility links/aliases
4. Provenance preservation
5. Validation results
6. Remaining route-history debt
7. Whether safe to continue to Reset Route I

## Next Route

Continue to:

`reset-route-i-final-architecture-compatibility-audit.md`
