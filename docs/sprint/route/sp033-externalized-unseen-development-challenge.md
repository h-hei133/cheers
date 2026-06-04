# SP033 Externalized Unseen Development Challenge

## Goal

Force real improvement in live autonomous development ability by using externalized unseen tasks.

This task must not end as another compiled profile, quality counter, gate policy, validation replay, or documentation update. It is complete only after an external unseen task set exposes real capability weakness, product code changes address that weakness, and the same task set is rerun with improved outcomes.

## Required Challenge Shape

Create external task material under docs/sprint.

Use names that describe the task purpose. Do not use process wording, comparison wording, reading-process wording, or names of outside codebases in product file names, product content, runtime fields, or user-visible output.

The external task set must contain 6 to 8 live development tasks and must include:

- at least 2 write-capable coding tasks
- at least 1 failed-check debug repair task
- at least 1 multi-file coordination task
- at least 1 artifact or report task with validation
- at least 1 continuation or resume task
- at least 1 provider fallback coverage task through the shared task runtime

Do not hard-code the task set as a compiled profile. The shared task runtime must consume the external task material through a thin caller or runtime-owned input boundary.

## Required First Run

Run the external task set before product capability changes.

The first run must record:

- task outcome
- failed or weak phase
- owner domain likely responsible
- proof status
- verification status
- repair status
- artifact validation status
- changed-file accounting for write tasks
- manual correction count
- provider fallback coverage

If all tasks pass on the first run, do not declare completion. Add harder unseen tasks within the same required categories until a real capability weakness appears. A first-pass all-green result is not enough for this task.

## Required Failure Transplant

Use failures as implementation targets.

Ordinary technical blockers are not stopping points. Do not stop because context is large, owner discovery is hard, tests fail, patch fails, repair fails, validation fails, the mature source differs, or initial live tasks fail.

Allowed stop conditions are only:

- safety boundary would be violated
- required credential or explicit provider opt-in is unavailable
- provider remains unreachable after the explicit gate is invoked
- isolated workspace cannot be created safely
- user authorization is required for a write that this task cannot authorize

Product code changes must address observed weakness in core capability owners such as:

- context
- planning
- edit
- verification
- repair
- artifact validation
- continuation
- provider
- tools
- task loop
- evidence
- result
- session
- presentation

Only changing evaluation profiles, quality counters, tests, or verify scripts is not enough.

## Local Playbook And Mature Source Use

Use the local playbook repository first:

/home/wang/projects/pi-docs-playbook

Read:

- README.md
- AGENTS.md
- usage/task-reading-matrix.md

Classify each failure area through that matrix, then read only matching source files.

Use the mature source repository only after target owner inspection and playbook navigation:

/home/wang/projects/pi

Use it to find concrete lifecycle, retry, provider, session, event, tool, and failure-handling patterns relevant to the failure.

## Four Level Introduction Rule

When bringing capability into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Prefer structured port or isolated source adoption for missing real behavior. Behavior-only alignment is the last option, not the default.

Do not mechanically copy implementation code, names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Hard Completion Gates

This task is not complete until all gates pass:

1. external task set is consumed through the shared product task runtime
2. initial run happens before capability changes
3. a real weakness is recorded
4. product code changes are made in core capability owners
5. same external task set is rerun after product code changes
6. rerun shows improved outcome on the same task set
7. at least 6 tasks executed
8. at least 4 tasks complete with task proof
9. at least 2 write tasks complete with reviewed isolated apply and post-apply verification
10. at least 1 failed-check debug repair task complete
11. primary provider success is covered
12. fallback configured skipped on primary success is covered
13. forced primary failure triggers fallback through shared runtime and passes
14. manual correction count is 0 for counted complete tasks
15. changed-file accounting is reported for write tasks
16. task proof, verification, repair status, artifact validation, and result verdict are reported

Not complete:

- failure report only
- documentation only
- validation replay only
- new metric only
- compiled profile only
- quality gate only
- provider smoke only
- deterministic-only improvement
- partial outcomes without safety, credential, or provider availability blocker
- changes limited to evaluation profile, quality counter, tests, or thin script

## Runtime And Script Rules

Deterministic and live paths must share the product task runtime.

Scripts must stay thin callers. They may set explicit gates, pass external task input, and print safe metadata only.

Product behavior must live in rightful owner domains.

Do not add behavior to compatibility shims.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from:

- provider output
- tool execution
- dry-run
- apply
- status
- host output
- artifact existence
- event emission
- presentation
- profile inclusion
- quality counter

Protect:

- raw provider output
- patch body
- tokens
- headers
- secrets
- private paths
- hidden reasoning

Do not manually read or print files under /home/wang/.private-agents-real.

Live provider use must be explicit opt-in and isolated.

## Required Tools

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use parallel subagents for:

- external challenge design
- target owner inspection
- playbook navigation
- mature source inspection
- failure taxonomy
- code migration
- validation

## Validation

Run:

- external live task set before changes
- same external live task set after changes
- focused tests for every changed owner
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- diff checks

Do not claim validation passed unless commands actually ran and passed.

## Final Report

Report:

- external task file
- initial outcomes and failure stages
- playbook files used
- mature source areas inspected
- introduction level used for each migrated capability
- product code changes made
- rerun outcomes on the same task set
- complete count improvement
- write complete count
- debug repair complete count
- fallback coverage results
- manual correction count
- changed-file accounting
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
