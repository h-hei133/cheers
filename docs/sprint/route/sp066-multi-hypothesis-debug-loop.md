# SP066 Multi Hypothesis Debug Loop

## Goal

Build a real multi-hypothesis debug loop for disposable workspace failures.

This task is failed unless real failing command output drives hypothesis creation, source discovery, repair planning, actual file edits, targeted rerun, and a distinct second or third hypothesis after failed repair.

This is not a lifecycle field task. This is not proof cleanup, receipt cleanup, docs-only, tests-only, catalog, liveRun, evaluation-only, or old diagnostic reuse.

## Required Tools

Use Serena MCP for owner discovery, references, diagnostics, and targeted edits.

Use Spec-Driven Develop for decomposition and coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Then inspect /home/wang/projects/pi after owner inspection. Inspect only agent loop, harness, tool results, debug flow, source discovery, repair iteration, verification rerun, session trajectory, and result reduction.

## Four Level Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected. Isolated source adoption is preferred for small pure reducers, hypothesis transition helpers, failure-output classifiers, and safe codecs when compatible. Behavior-only alignment is fallback only and requires a written reason.

Do not copy names, paths, runtime fields, user-visible wording, terminal truth rules, or architecture wholesale.

## Required Product Behavior

Implement or fix product behavior only where debug tasks expose gaps:

1. real command failure output is classified into a repair hypothesis
2. hypothesis records confidence, target files, context need, and rejected cause
3. context need drives source discovery before repair when source facts are missing
4. discovered source facts are recorded in append-only trajectory
5. repair plan references hypothesis and source facts before writing
6. failed rerun rejects the current hypothesis and creates a distinct next hypothesis
7. repeated same repair is blocked unless new source facts justify it
8. targeted rerun verifies the changed target and cannot be replaced by generic green
9. incomplete debug chains remain stopped_not_proven with exact missing proof
10. evidence/result remains terminal truth owner

## Required Product Owners

Product changes must include at least four rightful owners from:

- repair flow or planner
- context or source discovery
- verification command
- core runtime trajectory
- tools policy or feedback
- execution seam or dispatch
- session trajectory
- evidence or result only as consumers

Changes only in docs, tests, liveRun, catalog, quality, surface, event output, proof boundary, or receipt boundary do not satisfy this task.

## Required Workspace Debug Tasks

Create or update:

docs/sprint/multi-hypothesis-debug-loop.md

Define 3 to 4 disposable workspace debug tasks that are not recycled from SP044 through SP065.

Required coverage:

- at least 3 tasks execute
- at least 3 tasks start with real failing command output
- at least 3 tasks perform actual repair writes
- at least 2 tasks require first repair failure and second or third hypothesis success
- at least 2 tasks require source discovery before successful repair
- at least 1 task requires multi-file repair
- at least 1 task crosses replay or compact restore with hypothesis state
- at least 1 task remains stopped_not_proven if source facts are insufficient
- manual correction count is zero

## Required Diagnostics

Create before-failing and after-passing diagnostics for:

1. failure output creates first hypothesis
2. missing source facts trigger discovery before repair
3. source facts change repair plan
4. failed rerun rejects hypothesis and creates distinct next hypothesis
5. repeated same repair is blocked
6. targeted rerun settles changed target after repair
7. replay or compact restores active hypothesis and next action
8. incomplete debug chain remains stopped_not_proven

At least six diagnostics must use normal QueryEngine plus execution seam. At least three must use disposable workspace writes and real command output. Existing diagnostics are regression only and cannot satisfy primary evidence.

## Non-Substitution Rule

Do not substitute completion with:

- attempt count only
- failure category only
- repeated repair to read only
- lifecycle entry only
- old diagnostics
- simulated files or command output
- proof-only or receipt-only changes
- docs-only or tests-only work
- evaluation-only behavior
- catalog or liveRun behavior
- provider or fallback success
- owner count or mission count

If real failure output does not create hypothesis-driven repair behavior, do not mark complete.

## Coverage Table

Final report must include:

- task or diagnostic
- failure output
- hypothesis chain
- source facts
- repair plan
- product files changed
- normal runtime path
- command output
- targeted verification proof
- why not old diagnostic
- why not proof-only or evaluation-only
- remaining risk

If any row lacks product behavior evidence, do not mark complete.

## Hard Gates

Not complete until:

1. hypothesis model exists
2. source discovery fact capture exists
3. repair plan consumes hypothesis and source facts
4. failed rerun creates a distinct next hypothesis
5. repeated same repair is blocked
6. at least 3 workspace debug tasks execute
7. at least 2 tasks succeed after second or third hypothesis
8. at least 2 tasks require source discovery
9. at least 1 task crosses replay or compact restore
10. at least 1 insufficient-source task remains not-proven
11. at least eight diagnostics pass after failing before changes
12. product changes include at least four rightful owners
13. coverage table is complete
14. SP044 through SP065 regressions pass
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

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, trajectory entry, hypothesis, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run debug diagnostics before and after, primary workspace debug tasks, focused changed-owner tests, SP044 through SP065 regressions, build, truthfulness gate, anti-false-success gate, diff checks, and live catalog only if needed.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
