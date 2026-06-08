# SP069 Transcript Driven Provider Recovery

## Goal

Upgrade SP068 from deterministic provider-shaped actions to transcript-driven provider recovery.

This task is failed unless transcript-like provider outputs with mistakes, omissions, generic verification claims, false completion claims, wrong edits, bad repairs, incomplete artifacts, or lost continuation are corrected by product behavior through runtime harness, trajectory, source discovery, repair planning, targeted verification, artifact proof, durable restore, evidence proof, and result verdict.

This is not a new reducer task, not an old-diagnostic task, not docs-only, tests-only, proof-only, receipt-only, catalog, liveRun, or evaluation-only work.

## Required Tools

Use Serena MCP for owner discovery, symbol references, diagnostics, and targeted edits.

Use Spec-Driven Develop for decomposition and coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Then inspect /home/wang/projects/pi after owner inspection. Inspect only agent loop, harness, transcript or tool result reduction, session trajectory, source discovery, repair iteration, verification rerun, artifact handling, and result reduction.

## Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected. Isolated source adoption is preferred for small pure reducers, transcript reducers, lifecycle transitions, safe codecs, failure classifiers, and settlement helpers when compatible. Behavior-only alignment is fallback only and requires a written reason.

Do not copy names, paths, fields, user wording, terminal truth rules, or architecture wholesale.

## Required Product Behavior

Implement or fix product behavior only where transcript trajectories expose gaps:

1. false completion claims cannot complete without evidence/result proof
2. generic verification claims cannot settle targeted verification
3. wrong edit is blocked or redirected into source discovery
4. real source facts from reads drive hypothesis and repair plan
5. bad repair fails rerun and creates a distinct next hypothesis
6. incomplete artifact proof remains pending until source and verification evidence exist
7. lost continuation restores durable trajectory and continues safely
8. incomplete chains remain stopped_not_proven with exact missing proof
9. evidence/result remains terminal truth owner

## Product Owner Rule

Product fixes must be in rightful owners:

- runtime harness or trajectory
- transcript or tool feedback reduction
- execution seam or dispatch
- session, replay, or compact carry-forward
- source discovery
- repair flow or planner
- verification command
- artifacts
- evidence or result only as consumers

If transcript trajectories expose no product gap, provide a strict no-change finding with primary evidence. Do not mark complete from old diagnostics or regression evidence.

## Required Primary Trajectories

Create or update:

docs/sprint/transcript-driven-provider-recovery.md

Define 3 new disposable workspace transcript trajectories that are not recycled from SP044 through SP068.

Required coverage:

- each trajectory has at least 6 phases
- each trajectory has at least 2 provider-like mistakes
- at least 2 trajectories use transcript-like text with false completion or generic verification claims
- at least 3 use real failing command output
- at least 3 perform actual writes
- at least 2 require source discovery before successful repair
- at least 2 require bad repair, failed rerun, distinct next hypothesis, and targeted pass
- at least 1 includes incomplete artifact proof then proof completion after restore
- at least 1 crosses replay or compact restore
- at least 1 remains stopped_not_proven with exact missing proof
- manual correction count is zero

Existing diagnostics are regression only and cannot satisfy primary evidence.

## Required Diagnostics

Create before-failing and after-passing diagnostics for the primary trajectories.

At least three diagnostics must use normal QueryEngine plus execution seam, disposable workspace writes, real command output, and transcript-like provider text.

At least one diagnostic must cross replay or compact restore.

At least one diagnostic must prove not-proven honesty.

## Non-Substitution Rule

Do not substitute completion with:

- old diagnostics
- ideal action script
- simulated files or command output
- proof-only or receipt-only changes
- docs-only or tests-only work
- evaluation-only behavior
- catalog or liveRun behavior
- provider or fallback success
- owner count or mission count

If transcript-like outputs do not drive product recovery behavior, do not mark complete.

## Coverage Table

Final report must include:

- trajectory
- transcript mistakes
- phases
- source facts and hypothesis chain
- repair writes and reruns
- durable restore evidence
- artifact or not-proven evidence
- verification proof
- product files changed
- why not old diagnostic
- why not proof-only or evaluation-only
- remaining risk

## Hard Gates

Not complete until:

1. transcript recovery document exists
2. 3 primary transcript trajectories execute
3. each has at least 6 phases
4. each has at least 2 provider-like mistakes
5. at least 2 include false completion or generic verification claims
6. at least 3 use real failing command output
7. at least 3 perform actual writes
8. at least 2 complete after second or third hypothesis
9. at least 1 crosses replay or compact restore
10. at least 1 artifact proof is completed after being incomplete
11. at least 1 trajectory remains honestly not-proven
12. old diagnostics are regression only
13. focused changed-owner tests pass
14. SP044 through SP068 regressions pass
15. build passes
16. truthfulness gate passes
17. anti-false-success gate passes
18. diff checks pass
19. live catalog passes if run

## Blocked Rule

Live provider is not required.

If live is run and fails only from provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set status blocked. Report retest command, expected fields, failure class, why not product failure, git status, and uncommitted state. Do not retry live repeatedly.

## Naming And Safety

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or outside project names. Use domain language only.

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, transcript, trajectory entry, hypothesis, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run primary transcript diagnostics before and after, focused changed-owner tests, SP044 through SP068 regressions, build, truthfulness gate, anti-false-success gate, diff checks, and live catalog only if needed.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
