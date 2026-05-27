# Reset Route G: Scripts And Package Surface Grouping

## Goal

Introduce grouped command aliases for product, release, evidence, provider, and route-history commands.

This route makes package scripts easier to understand without breaking existing route-era commands.

Expected final status: `COMPLETE`.

## Scope

Allowed:

- add grouped package script aliases
- add script index docs
- add compatibility notes
- add lightweight script checks if already standard

Not allowed:

- deleting old route scripts
- changing existing script behavior
- running live provider by default
- moving scripts before aliases exist
- changing product runtime

## Required Subagents

1. Package script subagent
   - classify current scripts using Reset Route A inventory.
2. Script compatibility subagent
   - determine alias strategy and old-command preservation.
3. Provider/release safety audit subagent
   - ensure no provider opt-in behavior changes.

## Proposed Grouping

New grouped aliases may use namespaces such as:

- `verify:product:*`
- `verify:release:*`
- `verify:evidence:*`
- `verify:provider:*`
- `verify:route-history:*`
- `scripts:list` or `scripts:index` if useful

Use the actual repository conventions after inspection.

## Phases

### Phase 1: Script grouping plan

Use inventory to map old scripts into groups.

Do not edit scripts yet.

### Phase 2: Add aliases

Add new aliases that call existing commands.

Do not remove old commands.

### Phase 3: Docs/index updates

Document grouped command usage and keep old names as compatibility.

### Phase 4: Validation

Check representative old and new aliases.

Do not run expensive/live-provider commands unless explicitly safe and necessary.

## Completion Criteria

This route is `COMPLETE` only if:

- product/release/evidence/provider/route-history command groups are introduced or clearly documented
- old aliases still work
- live provider remains opt-in
- route history remains reachable
- no script behavior changed unintentionally

## Validation

Run:

- representative new alias checks
- representative old alias checks
- diff check and status
- release deterministic only if release command routing changed

## Stop Conditions

Stop if:

- old route evidence becomes unreachable
- package script changes require behavior changes
- provider opt-in behavior would change
- command grouping becomes too broad to validate

## Final Checkpoint Report

Report:

1. Final status
2. Script groups added
3. Old aliases preserved
4. Docs/index updated
5. Commands checked
6. Remaining package script debt
7. Whether safe to continue to Reset Route H

## Next Route

Continue to:

`reset-route-h-route-history-quarantine-move.md`
