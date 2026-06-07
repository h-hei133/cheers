# SP064 Primary Trajectory Completion

## Goal

Complete the strict missing SP064 requirement. Do not start a new direction.

SP064 is currently PARTIAL because generic green rejection followed by targeted rerun is not present inside a primary SP064 trajectory. Existing regression diagnostics do not count.

This task is failed unless generic green rejection and targeted rerun become primary SP064 trajectory evidence.

## Required Scope

Only fix the SP064 gap.

Do not broaden into new harness fields, new acceptance matrix, catalog work, liveRun work, evaluation-only work, proof-only work, receipt-only work, or documentation-only work.

## Required Tools

Use Serena MCP for owner discovery, references, diagnostics, and targeted edits.

Use Spec-Driven Develop for requirement coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Use /home/wang/projects/pi only if needed after owner inspection. Inspect only harness, tool result ledger, pending verification, verification, repair, artifact handling, and result reduction.

## Four Level Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is preferred. Isolated source adoption is allowed only for small pure reducers or settlement helpers after review. Behavior-only alignment is fallback only.

Do not copy names, paths, runtime fields, wording, terminal truth rules, or architecture wholesale.

## Mandatory Fix

Add or extend a primary SP064 disposable workspace trajectory so that it includes:

1. at least five phases
2. at least two wrong or incomplete actions
3. normal QueryEngine plus execution seam
4. real disposable workspace writes
5. real command output
6. generic green output that must not settle targeted verification
7. targeted rerun that settles the correct verification target
8. evidence/result-owned final verdict or exact stopped_not_proven missing proof

This must be primary SP064 evidence, not regression evidence.

## Product Owner Rule

If product behavior is missing, fix rightful owners only:

- core runtime harness
- execution seam or dispatch
- verification
- tools policy or feedback
- repair
- artifacts
- evidence or result only as consumers

Changes only in docs, tests, liveRun, catalog, quality, surface, event output, proof boundary, or receipt boundary do not satisfy this task.

## Documentation Fix

Update docs/sprint/end-to-end-provider-shaped-trajectories.md.

The document must state that generic green rejection plus targeted rerun is primary SP064 trajectory evidence, not old regression coverage.

## Non-Substitution Rule

Do not substitute completion with:

- old diagnostics
- existing regression coverage
- proof-only changes
- receipt-only changes
- docs-only changes
- evaluation-only behavior
- catalog or liveRun behavior
- simulated files or command output
- provider or fallback success
- owner count or mission count

If generic green rejection is not inside a primary trajectory, do not mark complete.

## Required Evidence

Final report must include:

- trajectory name
- five or more phases
- wrong or incomplete actions
- real command output
- real workspace writes
- product files changed
- normal runtime path
- targeted verification queue behavior
- final proof or not-proven result
- why this is primary evidence
- why this is not old regression, proof-only, or evaluation-only

## Hard Gates

Not complete until:

1. SP064 primary trajectory includes generic green rejection
2. targeted rerun follows and settles the correct target or remains exactly not-proven
3. trajectory has at least five phases
4. trajectory has at least two wrong or incomplete actions
5. normal QueryEngine plus execution seam is used
6. real workspace writes are used
7. real command output is used
8. SP064 document is updated
9. focused trajectory tests pass
10. SP044 through SP063 regression band passes
11. build passes
12. truthfulness gate passes
13. anti-false-success gate passes
14. diff checks pass

## Blocked Rule

Live provider is not required.

If live is run and fails only from provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set status blocked and report retest command, expected fields, failure class, git status, and uncommitted state. Do not retry live repeatedly.

## Naming And Safety

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or outside project names. Use domain language only.

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, harness ledger, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run focused primary trajectory tests, changed-owner tests, SP044 through SP063 regression band, build, truthfulness gate, anti-false-success gate, and diff checks.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
