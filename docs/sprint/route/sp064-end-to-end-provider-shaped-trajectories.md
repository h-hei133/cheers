# SP064 End To End Provider Shaped Trajectories

## Goal

Run end to end provider-shaped workspace trajectories and force product fixes from the stronger local harness structure.

This goal is failed unless multiple wrong or incomplete actions occur inside the same disposable workspace trajectory and the product harness recovers through durable ledger, pending queues, source discovery, repair strategy, targeted verification, artifact proof, evidence proof, and result verdict.

This is not a single guard task, not a diagnostics reuse task, not docs-only, tests-only, proof-only, receipt-only, catalog, liveRun, or evaluation-only work.

## Required Tools

Use Serena MCP for owner discovery, references, diagnostics, and targeted edits.

Use Spec-Driven Develop for decomposition and coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Then inspect /home/wang/projects/pi after owner inspection. Inspect only agent loop, harness, tool result ledger, settlement, pending writes, session state, compaction, verification, repair, artifact handling, and result reduction.

## Four Level Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected by default. Isolated source adoption is preferred for small pure reducers, ledger settlement helpers, queue transition helpers, and safe state codecs when compatible. Behavior-only alignment is fallback only and requires a written reason.

Do not copy names, paths, runtime fields, user-visible wording, terminal truth rules, or architecture wholesale.

## Required Product Behavior

Implement or fix product behavior only where trajectories expose gaps:

1. wrong edit while discovery is required is blocked and converted to discovery
2. generic verification cannot hide targeted failure
3. bad repair produces failed rerun and a distinct second strategy
4. incomplete artifact proof remains pending until source and verification evidence exist
5. lost continuation restores durable harness state and resumes work
6. ordered ledger and pending queues drive next runtime action
7. ledger, provider output, command output, restore, or artifact existence cannot complete alone
8. evidence and result remain terminal truth owners

## Required Product Owners

Product changes must include at least three rightful owners from:

- core runtime harness
- execution seam or dispatch
- session, replay, or compact carry-forward
- verification
- repair
- artifacts
- tools policy or feedback
- evidence or result only as consumers

Changes only in docs, tests, liveRun, catalog, quality, surface, event output, proof boundary, or receipt boundary do not satisfy this goal.

## Required Trajectories

Create or update:

docs/sprint/end-to-end-provider-shaped-trajectories.md

Define 2 to 3 disposable workspace trajectories. They must not recycle SP044 through SP063 tasks.

Each trajectory must include at least five phases and at least two wrong or incomplete actions.

Required combined coverage:

- at least 2 trajectories execute
- at least 2 trajectories use real failing command output
- at least 2 trajectories perform actual writes
- at least 1 trajectory includes wrong edit, discovery recovery, failed verification, bad repair, second strategy, targeted rerun
- at least 1 trajectory includes generic green rejection and targeted rerun
- at least 1 trajectory includes incomplete artifact proof, restore, and later proof completion
- at least 1 trajectory crosses replay or compact restore
- incomplete trajectories remain stopped_not_proven with exact missing proof
- manual correction count is zero

Existing diagnostics may be regression only. They do not count as primary SP064 evidence.

## Required Diagnostics

Create before-failing and after-passing diagnostics for the primary trajectories.

At least two diagnostics must use normal QueryEngine plus execution seam, disposable workspace writes, and real command output. At least one must restore durable harness state mid-trajectory.

## Coverage Table

Final report must include:

- trajectory
- wrong or incomplete actions
- local source areas inspected
- introduction level used
- product files changed
- normal runtime path
- durable state source
- command output
- repair and verification proof
- why not old diagnostics
- why not proof-only or evaluation-only
- remaining risk

If any row lacks product behavior evidence, do not mark complete.

## Hard Gates

Not complete until:

1. trajectory document exists
2. at least 2 primary trajectories execute
3. each primary trajectory has at least five phases
4. each primary trajectory has at least two wrong or incomplete actions
5. at least 2 use real failing command output
6. at least 2 perform actual writes
7. at least 1 crosses replay or compact restore
8. at least 1 bad repair changes strategy after failed rerun
9. at least 1 artifact proof is incomplete then completed
10. existing diagnostics are not primary evidence
11. product changes include at least three rightful owners
12. coverage table is complete
13. SP044 through SP063 regressions pass
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

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, harness ledger, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run primary trajectory diagnostics before and after, focused changed-owner tests, SP044 through SP063 regressions, build, truthfulness gate, anti-false-success gate, diff checks, and live catalog only if needed.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
