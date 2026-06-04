# SP032 Unseen Live Development Transplant

## Goal

Force the project to improve real live autonomous development ability on unseen tasks.

This is not a documentation task, not a validation replay, not a metric expansion, not a deterministic-only task, and not a provider smoke task.

The task is complete only after unseen live development failures are converted into product code changes and the same task set is rerun with improved outcomes.

## Required Work

Create and run 6 to 8 new unseen live development tasks. These tasks must not reuse existing adapted entries as the main proof set.

The task set must include:

- at least 2 write-capable coding tasks
- at least 1 failed-check debug repair task
- at least 1 multi-file coordination task
- at least 1 artifact or report task with validation
- at least 1 continuation or resume task
- at least 1 provider fallback coverage task through the shared task runtime

Do not hand the runtime exact implementation file names unless the task itself naturally requires them. The agent must discover owners and context.

## Required External Navigation

Use the local document navigation repository at:

/home/wang/projects/pi-docs-playbook

Before inspecting mature implementation code, read:

- README.md
- AGENTS.md
- usage/task-reading-matrix.md

Classify each failure area into the matrix categories, then read only the matching source files under source. Use it to decide which mature implementation areas to inspect next.

Use the mature implementation at:

/home/wang/projects/pi

Use it only after document navigation and target owner inspection.

## Four Level Introduction Rule

When taking capability from the mature implementation, use this order:

1. dependency use: reuse an existing package or stable public API when the target project can safely depend on it
2. structured port: port the design shape into current owner domains with target naming and target contracts
3. isolated source adoption: adapt a small isolated implementation unit only when licensing, ownership, and target contracts allow it
4. behavior-only alignment: reproduce only behavior after explaining why the first three levels are not appropriate

Do not mechanically copy code, names, paths, user-visible wording, runtime field names, or architecture wholesale.

## Hard Completion Gates

This task is not complete until all gates pass:

1. at least 6 unseen live tasks executed through the shared task runtime
2. at least 4 tasks complete with task proof
3. at least 2 write-capable tasks complete with reviewed isolated apply and post-apply verification
4. at least 1 failed-check debug repair task complete
5. primary provider success is covered
6. fallback configured skipped on primary success is covered
7. forced primary failure triggers fallback through shared task runtime and passes
8. no manual correction is required for any task counted as complete
9. product code changes are made to address observed failures
10. the same task set is rerun after product code changes
11. changed-file accounting is reported for write tasks
12. task proof, verification, repair status, artifact validation, and result verdict are reported

A failure report is not completion.
A new task list is not completion.
A docs-only change is not completion.
A validation-only rerun is not completion.
A quality record is not completion.
A provider smoke alone is not completion.
A deterministic-only improvement is not completion.
A partial outcome is not completion unless blocked by safety, credentials, or provider availability.

## Blocker Policy

Ordinary technical blockers are work items, not stopping points.

Do not stop because context is large, owner discovery is hard, tests fail, patch fails, repair fails, mature implementation differs, validation fails, or initial live tasks fail.

Allowed stop conditions are only:

- safety boundary would be violated
- required credential or opt-in provider access is unavailable
- provider is unreachable after the explicit opt-in gate is invoked
- isolated workspace cannot be created safely
- user authorization is required for a write that this task cannot authorize

## Architecture Rules

Deterministic and live paths must share the product task runtime.

Scripts must stay thin callers. They may set gates, pass inputs, and print safe receipts only.

Product behavior belongs in rightful owner domains such as runtime, task, provider, tools, context, planning, edit, verification, repair, evidence, result, session, and presentation.

Do not add behavior to compatibility shims.

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or outside project names. Use domain language only.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, or presentation.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

Live provider use must be explicit opt-in and isolated.

## Required Tools

Use Serena MCP for owner discovery, symbol navigation, references, and diagnostics.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use parallel subagents aggressively for live task design, target owner inspection, document navigation, mature implementation inspection, failure taxonomy, code migration, and validation.

## Validation

Run the live task set before and after product code changes.

Run focused tests for every changed owner domain.

Run build when imports, contracts, or runtime-facing code change.

Run result truthfulness gates and anti-false-success gates when task proof, verdict, status, or completion logic changes.

Run diff checks.

## Final Report

Report:

- unseen task set
- initial outcomes and failure stages
- document navigation files used
- mature implementation areas inspected
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

Commit only after the hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
