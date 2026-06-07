# SP067 Debug Loop Truth Audit And Hardening

## Goal

Strictly audit SP066 multi-hypothesis debug behavior and fix any real product gaps found in the same goal.

This is not a new broad direction. This is a truth gate before the next large gauntlet.

Completion is allowed only if SP066 debug behavior is proven as product behavior or repaired in rightful owners.

## Required Tools

Use Serena MCP for owner discovery, symbol references, diagnostics, and targeted edits.

Use Spec-Driven Develop for requirement coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Use /home/wang/projects/pi only if needed after owner inspection. Inspect only debug flow, repair hypothesis, source discovery, runtime trajectory, verification rerun, session restore, and result reduction.

## Four Level Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected for repair and session patterns. Isolated source adoption is allowed only for small pure reducers or classifiers after review. Behavior-only alignment is fallback only.

Do not copy names, paths, fields, wording, terminal truth rules, or architecture wholesale.

## Audit Claims

Audit these claims with code evidence and tests:

1. real command output creates hypothesis
2. hypothesis records confidence, target files, context need, and rejected cause
3. source facts are collected from actual source reads
4. source facts change the repair plan
5. repair plan references hypothesis and source facts before writing
6. failed rerun rejects current hypothesis
7. failed rerun creates a distinct next hypothesis
8. repeated same repair is blocked unless new source facts justify it
9. replay or compact restores active hypothesis and next action
10. insufficient source facts remain stopped_not_proven
11. evidence/result remains terminal truth

If any claim is weak, fix it in the same goal.

## Product Owner Rule

Product fixes must be in rightful owners only:

- repair flow or planner
- context or source discovery
- verification command
- runtime trajectory
- tools feedback or dispatch
- session restore
- evidence or result only as consumers

Do not expand unrelated harness fields.

Docs-only audit, old diagnostics, lifecycle entries without behavior, string labels without repair impact, proof-only changes, receipt-only changes, catalog, liveRun, evaluation-only behavior, owner count, or mission count do not satisfy this task.

## Required Document

Create or update:

docs/sprint/debug-loop-truth-audit.md

It must include:

- verdict: COMPLETE, PARTIAL, or NOT COMPLETE
- claim-by-claim evidence table
- product files inspected
- diagnostics inspected
- missing or weak claims
- fixes made if any
- remaining risk
- whether the project may proceed to the next gauntlet

## Required Diagnostics

If gaps are found, add or update primary diagnostics.

Diagnostics must use normal QueryEngine plus execution seam, real workspace writes, and real command output when relevant.

Existing diagnostics are regression only unless the audit proves they directly establish the audited claim.

## Non-Substitution Rule

Do not substitute completion with:

- old diagnostics only
- docs-only audit
- attempt count only
- failure category only
- lifecycle entry only
- string classifier only
- simulated files or command output
- proof-only or receipt-only changes
- evaluation-only behavior
- catalog or liveRun behavior
- provider or fallback success

If real failure output does not drive hypothesis, source discovery, repair planning, rerun rejection, and next hypothesis behavior, do not mark complete.

## Hard Gates

Not complete until:

1. audit document exists
2. all audit claims have evidence or a recorded gap
3. weak claims are fixed in rightful owners or verdict is PARTIAL or NOT COMPLETE
4. any new fixes have primary diagnostics
5. focused changed-owner tests pass
6. SP044 through SP066 regression band passes
7. build passes
8. truthfulness gate passes
9. anti-false-success gate passes
10. diff checks pass

## Blocked Rule

Live provider is not required.

If live is run and fails only from provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set status blocked. Report retest command, expected fields, failure class, why not product failure, git status, and uncommitted state. Do not retry live repeatedly.

## Naming And Safety

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or outside project names. Use domain language only.

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, trajectory entry, hypothesis, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run audit diagnostics, focused changed-owner tests, SP044 through SP066 regression band, build, truthfulness gate, anti-false-success gate, and diff checks.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
