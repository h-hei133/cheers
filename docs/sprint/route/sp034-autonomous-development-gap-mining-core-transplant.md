# SP034 Autonomous Development Gap Mining Core Transplant

## Goal

Find and fix core autonomous development capability gaps without letting live provider noise become the main development driver.

Live provider is an acceptance standard, not the primary discovery mechanism. The primary discovery mechanism is mature capability diff, adversarial diagnostics, failure injection, and code-level transplant into core owner domains.

This task must not end as catalog expansion, profile expansion, quality counter work, fallback smoke, validation replay, or documentation-only output.

## Required Inputs

Use existing external task support from docs/sprint/development-capability-catalog.json.

Use the local playbook first:

/home/wang/projects/pi-docs-playbook

Read:

- README.md
- AGENTS.md
- usage/task-reading-matrix.md

Then read only matching source files for capability areas being diagnosed.

Use the mature source only after target owner inspection and playbook navigation:

/home/wang/projects/pi

## Required Capability Areas

Diagnose at least 5 areas and implement fixes for at least 3 weak areas.

Candidate areas:

- context discovery and owner narrowing
- executable planning and action sequencing
- edit strategy and patch construction
- multi-file coordination
- verification selection
- failure diagnosis and repair retry
- artifact validation
- continuation and resume
- tool result to next action
- task loop control
- changed-file accounting
- evidence/result proof integrity

## Required Diagnostic Method

Create or extend diagnostics that precisely attack capability gaps.

Use deterministic, adversarial, or failure-injection cases before relying on live provider results.

Required diagnostics:

- at least 3 adversarial or failure-injection cases
- each case must identify the expected weak phase
- each case must map to a core owner domain
- each case must have a before and after outcome
- at least 2 cases must improve from failed or weak to passed or strong after product code changes

If all initial diagnostics pass, make the cases harder until a real weakness appears. A first-pass all-green result is not completion.

## Required Document

Create or update:

docs/sprint/autonomous-development-gap-map.md

This document must contain:

- inspected target owner domains
- playbook files used
- mature source areas inspected
- capability gaps found
- diagnostics created
- selected transplant targets
- four-level introduction decision for each migrated capability
- before and after results

The document is evidence and navigation only. It is not completion by itself.

## Four Level Introduction Rule

When bringing capability into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Prefer structured port or isolated source adoption for real missing behavior. Behavior-only alignment is last and must be justified.

Do not mechanically copy implementation code, names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Hard Completion Gates

This task is not complete until all gates pass:

1. at least 5 capability areas diagnosed
2. at least 3 weak areas selected for product improvement
3. at least 3 adversarial or failure-injection diagnostics created or strengthened
4. at least 2 diagnostics improve after code changes
5. product code changes touch core capability owners
6. changes limited to evaluation task, catalog, quality, liveRun, thin scripts, docs, or tests do not satisfy this task
7. external live catalog passes after product changes
8. primary provider success is covered
9. fallback configured skipped on primary success is covered
10. forced primary failure triggers fallback through shared runtime and passes
11. at least 2 write tasks complete with reviewed isolated apply and post-apply verification
12. at least 1 debug repair task complete
13. manual correction count is 0 for counted complete tasks
14. changed-file accounting is reported
15. task proof, verification, repair status, artifact validation, and result verdict are reported

Not complete:

- diagnosis only
- gap map only
- new metric only
- validation replay only
- live provider smoke only
- deterministic pass count only
- catalog or profile work only
- fallback work only
- partial outcomes without safety, credential, provider, or isolated workspace blocker

## Blocker Policy

Ordinary technical blockers are implementation targets, not stopping points.

Do not stop because owner discovery is hard, diagnostics fail, patch fails, repair fails, validation fails, source shape differs, or live output is noisy.

Allowed stop conditions only:

- safety boundary would be violated
- required credential or explicit provider opt-in is unavailable
- provider remains unreachable after explicit opt-in
- isolated workspace cannot be created safely
- user authorization is required for a write this task cannot authorize

## Architecture Rules

Deterministic, diagnostic, and live paths must share product runtime owners wherever behavior is product behavior.

Scripts must stay thin callers.

Product behavior belongs in rightful owner domains such as context, planning, edit, verification, repair, artifact, continuation, provider, tools, task loop, evidence, result, session, and presentation.

Do not add behavior to compatibility shims.

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or names of outside codebases. Use domain language only.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, presentation, profile inclusion, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

Live provider use must be explicit opt-in and isolated.

## Required Tools

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use parallel subagents for target owner inspection, playbook navigation, mature source inspection, diagnostic design, transplant implementation, and validation.

## Validation

Run:

- before and after diagnostics
- focused tests for every changed owner
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- external live catalog after product changes
- diff checks

## Final Report

Report:

- capability areas diagnosed
- weak areas selected
- playbook files used
- mature source areas inspected
- introduction level per capability
- diagnostics and before/after outcomes
- product code changes
- live acceptance results
- write/debug/fallback results
- manual correction count
- changed-file accounting
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
