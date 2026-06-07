# SP068 Provider Shaped End To End Gauntlet

## Goal

Prove the current harness, trajectory, and debug loop on end to end provider-shaped disposable workspace tasks.

This task is failed unless multiple imperfect action sequences are recovered by product behavior through source discovery, hypothesis repair, targeted verification, artifact proof, durable restore, evidence proof, and result verdict.

This is not an audit-only task, single-guard task, old-diagnostic task, proof-only task, receipt-only task, catalog task, liveRun task, or evaluation-only task.

## Required Tools

Use Serena MCP for owner discovery, symbol references, diagnostics, and targeted edits.

Use Spec-Driven Develop for decomposition and coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Then inspect /home/wang/projects/pi after owner inspection. Inspect only agent loop, harness, tool results, session trajectory, source discovery, repair iteration, verification rerun, artifact handling, and result reduction.

## Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected. Isolated source adoption is preferred for small pure reducers, lifecycle transitions, safe codecs, failure classifiers, and settlement helpers when compatible. Behavior-only alignment is fallback only and requires a written reason.

Do not copy names, paths, fields, user wording, terminal truth rules, or architecture wholesale.

## Required Product Behavior

Implement or fix product behavior only where primary trajectories expose gaps:

1. wrong edit is blocked or redirected into discovery
2. generic green cannot settle targeted verification
3. real failure output creates source-backed hypothesis
4. missing source facts trigger source discovery before repair
5. bad repair fails rerun and creates a distinct next hypothesis
6. repair writes real files and targeted rerun verifies changed targets
7. incomplete artifact proof stays pending until source and verification evidence exist
8. replay or compact restores active trajectory and continues safely
9. incomplete chains remain stopped_not_proven with exact missing proof
10. evidence/result remains terminal truth owner

## Product Owner Rule

Product fixes must be in rightful owners:

- core runtime harness or trajectory
- execution seam or dispatch
- session, replay, or compact carry-forward
- source discovery
- repair flow or planner
- verification command
- artifacts
- tools feedback or policy
- evidence or result only as consumers

If primary trajectories expose no product gap, harden them in the same goal until they do, or provide a strict no-change finding with primary evidence. Do not mark complete with docs and tests only unless product behavior is proven by new primary trajectories and review.

## Required Primary Trajectories

Create or update:

docs/sprint/provider-shaped-end-to-end-gauntlet.md

Define 3 to 5 new disposable workspace trajectories that are not recycled from SP044 through SP067.

Required coverage:

- at least 3 trajectories execute
- each primary trajectory has at least 6 phases
- each primary trajectory has at least 2 wrong or incomplete actions
- at least 3 use real failing command output
- at least 3 perform actual writes
- at least 2 require source discovery before successful repair
- at least 2 require bad repair, failed rerun, distinct next hypothesis, and targeted pass
- at least 1 includes generic green rejection before targeted rerun
- at least 1 includes incomplete artifact proof then later proof completion
- at least 1 crosses replay or compact restore
- at least 1 remains stopped_not_proven with exact missing proof
- manual correction count is zero

Existing diagnostics are regression only and cannot satisfy primary evidence.

## Required Diagnostics

Create before-failing and after-passing diagnostics for the primary trajectories.

At least three diagnostics must use normal QueryEngine plus execution seam, disposable workspace writes, and real command output.

At least one diagnostic must cross replay or compact restore.

At least one diagnostic must prove not-proven honesty.

## Non-Substitution Rule

Do not substitute completion with:

- old diagnostics
- simulated files or command output
- ideal summaries
- proof-only or receipt-only changes
- docs-only or tests-only work
- evaluation-only behavior
- catalog or liveRun behavior
- provider or fallback success
- owner count or mission count

If primary trajectories do not prove end to end recovery, do not mark complete.

## Coverage Table

Final report must include:

- trajectory
- phases
- wrong or incomplete actions
- product files changed
- source facts and hypothesis chain
- repair writes and reruns
- durable restore evidence
- artifact or not-proven evidence
- verification proof
- why not old diagnostic
- why not proof-only or evaluation-only
- remaining risk

## Hard Gates

Not complete until:

1. gauntlet document exists
2. at least 3 primary trajectories execute
3. each primary trajectory has at least 6 phases
4. each primary trajectory has at least 2 wrong or incomplete actions
5. at least 3 use real failing command output
6. at least 3 perform actual writes
7. at least 2 complete after second or third hypothesis
8. at least 1 crosses replay or compact restore
9. at least 1 artifact proof is completed after being incomplete
10. at least 1 trajectory remains honestly not-proven
11. existing diagnostics are regression only
12. focused changed-owner tests pass
13. SP044 through SP067 regressions pass
14. build passes
15. truthfulness gate passes
16. anti-false-success gate passes
17. diff checks pass
18. live catalog passes if run

## Blocked Rule

Live provider is not required.

If live is run and fails only from provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set status blocked. Report retest command, expected fields, failure class, why not product failure, git status, and uncommitted state. Do not retry live repeatedly.

## Naming And Safety

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or outside project names. Use domain language only.

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, trajectory entry, hypothesis, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run primary trajectory diagnostics before and after, focused changed-owner tests, SP044 through SP067 regressions, build, truthfulness gate, anti-false-success gate, diff checks, and live catalog only if needed.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
