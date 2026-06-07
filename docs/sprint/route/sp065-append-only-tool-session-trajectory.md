# SP065 Append Only Tool Session Trajectory

## Goal

Implement append-only tool, write, repair, verification, artifact, and session trajectories in product runtime.

This goal is failed unless product code records lifecycle events as append-only trajectory entries and restores enough trajectory state to continue normal runtime work after replay or compact carry-forward.

This is not another task gauntlet. This is not a state-field expansion. This is not docs-only, tests-only, proof-only, receipt-only, catalog, liveRun, or evaluation-only work.

## Required Tools

Use Serena MCP for owner discovery, symbol lookup, diagnostics, and targeted edits.

Use Spec-Driven Develop for decomposition and coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Then inspect /home/wang/projects/pi after owner inspection. Inspect only agent loop, harness, session state, tool lifecycle, tool result ledger, pending writes, compaction, verification, repair, artifact handling, and result reduction.

## Four Level Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected by default. Isolated source adoption is preferred for small pure reducers, lifecycle transition helpers, append-only ledger helpers, and safe codecs when compatible. Behavior-only alignment is fallback only and requires a written reason.

Do not copy names, paths, runtime fields, user-visible wording, terminal truth rules, or architecture wholesale.

## Required Product Behavior

Implement or fix product behavior only where lifecycle gaps exist:

1. Tool lifecycle entries cover planned, started, completed, failed, retried, and settled.
2. Write lifecycle entries cover intended, applied, changed-file accounted, verification queued, and verification settled.
3. Verification lifecycle entries cover targeted, started, passed, failed, wrong-target ignored, and settled.
4. Repair lifecycle entries cover failure classified, hypothesis, context need, attempt, rerun, next hypothesis, and settled.
5. Artifact lifecycle entries cover requested, written, source evidence missing, verification missing, completed, or pending.
6. Session trajectory is append-only and survives replay or compact carry-forward.
7. Restored trajectory drives normal QueryEngine next action.
8. Terminal success still requires evidence/result proof and verdict.

## Required Product Owners

Product changes must include at least four rightful owners from:

- core runtime harness
- execution seam or dispatch
- session, replay, or compact carry-forward
- verification
- repair
- artifacts
- tools policy or feedback
- evidence or result only as consumers

Changes only in docs, tests, liveRun, catalog, quality, surface, event output, proof boundary, or receipt boundary do not satisfy this goal.

## Required Diagnostics

Create before-failing and after-passing diagnostics for:

1. append-only tool lifecycle preserves failed result before later success
2. write lifecycle blocks completion until changed-file accounting and verification settle
3. wrong-target generic verification is recorded but cannot settle targeted verification
4. repair lifecycle records failed hypothesis and drives a distinct next hypothesis
5. artifact lifecycle remains pending until source and verification evidence exist
6. compact or replay restores trajectory and drives next runtime action
7. restored trajectory alone cannot complete a task
8. trajectory order is preserved across partial failure and later success

At least six diagnostics must use normal QueryEngine plus execution seam. At least three must use disposable workspace writes and real command output. Existing diagnostics are regression only and cannot satisfy primary evidence.

## Required Workspace Tasks

Create or update:

docs/sprint/append-only-tool-session-trajectory.md

Define 2 to 3 disposable workspace trajectories that are not recycled from SP044 through SP064.

Required coverage:

- at least 2 trajectories execute
- each has at least six lifecycle phases
- at least 2 use real failing command output
- at least 2 perform actual writes
- at least 1 includes bad repair, failed rerun, next hypothesis, and targeted pass
- at least 1 includes wrong-target generic verification ignored before targeted rerun
- at least 1 crosses replay or compact restore
- incomplete trajectories remain stopped_not_proven with exact missing proof
- manual correction count is zero

## Non-Substitution Rule

Do not substitute completion with:

- current-state snapshot only
- mutable queue state only
- old diagnostics
- simulated files or command output
- proof-only or receipt-only changes
- docs-only or tests-only work
- evaluation-only behavior
- catalog or liveRun behavior
- provider or fallback success
- owner count or mission count

If append-only trajectory is not implemented in product code, do not mark complete.

## Coverage Table

Final report must include:

- trajectory or diagnostic
- lifecycle entries
- local source areas inspected
- introduction level used
- product files changed
- normal runtime path
- durable state source
- command output
- repair or verification proof
- why not old diagnostic
- why not proof-only or evaluation-only
- remaining risk

If any row lacks product behavior evidence, do not mark complete.

## Hard Gates

Not complete until:

1. append-only trajectory model exists
2. tool lifecycle is recorded
3. write lifecycle is recorded
4. verification lifecycle is recorded
5. repair lifecycle is recorded
6. artifact lifecycle is recorded
7. replay or compact restores trajectory
8. restored trajectory drives next runtime action
9. restored trajectory alone cannot complete a task
10. at least eight required diagnostics pass after failing before changes
11. at least two primary workspace trajectories execute
12. product changes include at least four rightful owners
13. coverage table is complete
14. SP044 through SP064 regressions pass
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

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, harness ledger, trajectory entry, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run lifecycle diagnostics before and after, primary workspace trajectories, focused changed-owner tests, SP044 through SP064 regressions, build, truthfulness gate, anti-false-success gate, diff checks, and live catalog only if needed.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
