# SP049 Remaining Gap Closure

## Goal

Close all five remaining gaps from the final real task trial without introducing new architecture debt.

This is one of the last convergence goals. It must be broad enough to cover every ranked gap, but disciplined enough to avoid shallow fixes, duplicated policies, or new owner confusion.

Remaining gaps to close:

1. dependent verification graph completeness
2. continuation proof durability from replay or persisted inputs
3. broader stale tool observation recovery
4. deeper artifact claim-to-source matching
5. transition cycle permissiveness in long normal runs

## Required Balance

Use a P0 and P1 model.

P0 gaps require product-level closure:

- dependent verification graph completeness
- continuation proof durability from replay or persisted inputs

P1 gaps require either product-level closure or strong diagnostics proving current behavior is sufficient:

- stale tool observation recovery across broader tool classes
- artifact claim-to-source matching beyond shallow string-aligned receipts
- transition cycle permissiveness in long normal runs

Do not treat all five gaps equally with shallow tests. P0 must receive deeper implementation. P1 must receive explicit closure status, diagnostics, and product fixes when weakness appears.

## Required Tool Discipline

Use Serena MCP for semantic owner discovery, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers to choose relevant skills
- systematic-debugging for root cause analysis
- test-driven-development for focused diagnostics
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for independent gap audits
- requesting-code-review or receiving-code-review before final closeout

Do not let any tool create process bloat, extra process documents, or stopping excuses.

## Required Inputs

Use these sprint documents as active evidence:

- docs/sprint/final-real-task-trial.md
- docs/sprint/real-development-mission-pack.md
- docs/sprint/hard-mission-gauntlet.md
- docs/sprint/final-development-acceptance-record.md
- docs/sprint/development-capability-catalog.json

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it for dependent target graph design, verification graph, replay durability, continuation/session state, tool feedback reduction, artifact evidence binding, loop cycle control, and result reduction patterns.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Gap Closure Packets

For each of the five gaps, produce a closure packet in docs/sprint/final-gap-closure-record.md.

Each packet must include:

- current weakness or proof of sufficient behavior
- owner domains inspected
- mature source area inspected
- four-level introduction decision
- product owner responsible
- diagnostic added or strengthened
- product fix or no-fix justification
- regression commands
- architecture debt risk
- final closure status

A no-fix closure is allowed only for P1 gaps and only when diagnostics prove the current behavior is sufficient.

P0 gaps cannot be closed with no-fix justification.

## P0 Gap 1: Dependent Verification Graph Completeness

Do not satisfy this with path lists only.

Required behavior:

- dependent targets are ranked or explained by owner facts
- impacted verification targets attach to the dependent graph
- source, contract or implementation, dependent target, and impacted test or check remain distinct
- changed-file accounting covers every target
- failed dependent verification routes repair or re-verification to the failed dependent changed file
- global pass cannot hide an unverified dependent target
- normal runtime consumes the graph directly or through an owner it already consumes

## P0 Gap 2: Continuation Proof Durability

Do not satisfy this with direct seed injection only.

Required behavior:

- pending action, changed files, verification targets, artifact claims, and proof gap can be restored from replay or persisted continuation facts
- continuation restoration enters normal runtime decision
- restored pending verification leads to targeted verification
- restored artifact claim evidence remains claim-specific and verification-backed
- missing persisted proof remains not-proven
- direct seed tests may remain, but at least one diagnostic must prove replay or persisted input behavior

## P1 Gap 3: Stale Tool Observation Recovery

Required behavior:

- broader tool failure classes are checked, not only one failed read case
- stale or failed observations cannot drive unsafe edit or repeated repair
- recovery action should prefer discovery, targeted verification, safe repair, or stop-not-proven depending on evidence
- terminal success cannot come from failed tool output

## P1 Gap 4: Artifact Claim-To-Source Matching

Required behavior:

- artifact claims bind to source and verification evidence
- shallow duplicate or string-only evidence must not be enough when claim/source relation is ambiguous
- changed artifact output must require changed-file verification evidence
- missing semantic evidence remains not-proven

## P1 Gap 5: Transition Cycle Permissiveness

Required behavior:

- reason-distinct loops remain possible for legitimate multi-step work
- excessive loop permissiveness is detected in long normal runs
- repeated same-action or same-reason cycles block or stop not-proven safely
- cycle detection must not prevent necessary repair, discovery, re-verification, or continuation loops

## Architecture Cleanliness Rules

Do not create new duplicate policy or proof paths.

Required boundaries:

- QueryEngine and runQueryLoop remain loop and wiring owners
- AgentRunner remains execution boundary
- tools/policy owns action policy
- planning owns action graph and dependent planning
- verification owns verification target and execution facts
- repair owns repair strategy
- artifacts/workflow owns artifact validation
- session continuation owns durable pending work facts
- evidence/task owns proof normalization
- result/task owns verdict reduction
- evaluation and live catalog consume product behavior and do not own competing behavior

## Required Diagnostics

Create or strengthen at least 10 diagnostics.

Required diagnostics:

1. owner-ranked dependent graph attaches impacted verification target
2. dependent changed target cannot be hidden by global verification pass
3. repair re-verifies the failed dependent changed file
4. replay or persisted continuation facts restore pending action and proof gap
5. restored continuation drives targeted verification or artifact proof
6. broader stale tool observation recovers safely before mutation
7. failed tool output cannot terminal-complete
8. artifact claim requires source and verification evidence
9. ambiguous artifact evidence remains not-proven
10. long normal run detects excessive repeated cycle without blocking legitimate reason-distinct progress

At least 7 diagnostics must improve or prove gap closure after product changes.

## Required Product Changes

Implement product changes in rightful owners.

At least 5 core owners must change. At least 4 must be from planning/action, planning/execution, context/selection, verification/execution, core/query/runtime, tools/policy, session continuation, artifacts/workflow, evidence/task, or result/task.

Changes limited to docs, tests, surface, presentation, evaluation task, liveRun, quality, catalog, scripts, or proof boundary only do not satisfy this task.

## Hard Completion Gates

This task is not complete until all gates pass:

1. final gap closure record exists under docs/sprint
2. all five gaps have closure packets
3. both P0 gaps have product fixes and strengthened diagnostics
4. all P1 gaps have product fixes or diagnostic-backed closure
5. at least 10 diagnostics created or strengthened
6. at least 7 diagnostics improve or prove closure
7. at least 5 core product owners changed
8. dependent verification graph has owner-level ranking or explanation beyond path lists
9. continuation proof restores from replay or persisted facts, not only direct seed injection
10. broader stale tool classes are covered
11. artifact claim-to-source matching is strengthened beyond shallow receipt presence
12. transition cycle permissiveness is bounded in long normal runs
13. SP044 hard mission gauntlet still passes
14. SP045 real development mission pack still passes
15. SP047 final acceptance still passes
16. SP048 final real task trial still passes
17. build passes
18. result truthfulness gate passes
19. anti-false-success gate passes
20. external live catalog passes after product changes
21. live acceptance shows manualCorrectionCount 0
22. write tasks include reviewed isolated apply and post-apply verification
23. debug repair complete is true
24. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
25. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- closing only the two P0 gaps
- shallow checks across all gaps
- direct-seed-only continuation closure
- path-list-only dependent graph
- proof safety only
- docs only
- diagnostics only
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- tests without normal runtime behavior
- duplicated policy or proof paths
- stopping because implementation is difficult

## Blocked Rule

Do not use temporary stop language.

If product implementation, focused diagnostics, SP044, SP045, SP047, SP048, build, truthfulness gates, anti-false-success gates, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, set the goal status to blocked.

Blocked is not complete.

When blocked, report:

- exact retest command
- required environment variables
- expected pass fields
- observed provider failure class
- why this is not a product runtime failure
- current git status
- whether product changes are uncommitted

Do not commit or push while blocked unless the user provides passing live evidence and explicitly tells you to continue.

## Blocker Policy

Ordinary technical blockers are work items, not stopping points.

Do not stop because owner discovery is hard, diagnostics fail, implementation is hard, validation fails, source shape differs, or live output is noisy.

Allowed blocked states only:

- safety boundary would be violated
- required credential or explicit provider opt-in is unavailable
- provider remains unreachable after explicit opt-in
- isolated workspace cannot be created safely
- user authorization is required for a write this task cannot authorize

## Naming And Content Rules

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or names of outside codebases. Use domain language only.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, presentation, profile inclusion, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

Live provider use must be explicit opt-in and isolated.

## Validation

Run:

- focused SP049 diagnostics
- strengthened FT-01, FT-02, and FT-03 paths
- SP044 hard mission gauntlet
- SP045 real development mission pack
- SP047 final acceptance
- SP048 final real task trial
- focused tests for changed owners
- build when needed
- result truthfulness gate
- anti-false-success gate
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- all five gap closure packets
- P0 fixes
- P1 closure status
- diagnostics before and after
- product changes by owner
- architecture debt avoided or removed
- Superpowers skills used
- playbook files used
- mature source areas inspected
- introduction level per capability
- SP044, SP045, SP047, SP048 rerun outcomes
- live acceptance or blocked details
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
