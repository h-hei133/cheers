# SP028 Live Quality And Workspace Readiness

## Goal

Measure and improve live task output quality, then prepare reviewed real-workspace apply readiness.

SP027 proved explicit live tasks can run through the product task loop. This task must prove whether live write, repair, report, and artifact outputs are useful enough for real work. Execution count is not enough.

Do not use subagents.

## Core Direction

The target path is:

short prompt
-> task loop
-> live provider turn
-> action proposal
-> safe quality record
-> dry-run or artifact validation
-> review decision
-> isolated apply when applicable
-> post-action verification
-> real-workspace readiness decision
-> proof
-> verdict

Scripts may set gates and call the runtime. Scripts must not own task behavior.

## Four-Level Component Adoption

Use the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Prefer isolated source adoption or structured port when legal, narrow, and safe. Behavior-only alignment is allowed only with a concrete reason.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, callers, side-effect boundary, truth boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, origin wording, or outside project names.

## Required Starting Point

Read these first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP023 through SP027 outcomes as evidence.

## Required Code-Path Inspection

Inspect the mature local implementation and public docs already named in sprint docs for concrete behavior in:

- patch quality assessment
- diff safety classification
- target file matching
- review decision inputs
- worktree or isolated apply handling
- post-apply verification
- repair quality scoring
- artifact quality checks
- result reporting without leaking raw output

Convert useful behavior into local product code.

## Required Implementation

Strengthen rightful owners for:

- task loop
- live action proposal
- edit dry-run and apply
- verification
- repair
- artifacts
- evidence and result
- host or evaluation
- scripts as thin callers

Add safe quality records. They must not print patch bodies, raw provider text, tokens, headers, secrets, private paths, or command output.

## Quality Record

For each live write or artifact entry, record safe metadata:

- task id
- action kind
- target file count
- target file match
- hunk count or artifact section count
- expected verification
- verification relevance
- manual correction needed
- apply scope
- isolated apply status
- post-action verification status
- final readiness
- remaining blocker

## Hard Outcomes

Do not claim completion unless all pass:

1. At least five live write or artifact entries produce safe quality records.
2. At least three write-capable entries produce dry-run quality records.
3. At least three entries reach reviewed isolated apply plus post-apply verification.
4. At least two entries are marked ready for reviewed real-workspace apply with exact requirements.
5. At least one entry performs reviewed real-workspace apply only if a safe explicit gate and isolated disposable workspace are available.
6. At least one debug or repair entry proves failure to repair to verification.
7. At least one multi-file or coordinated edit entry has target-file quality metadata.
8. At least one artifact or report entry passes content or format quality checks.
9. Every non-ready entry names the exact fix needed.
10. Existing no-write safety and redaction checks remain passing.

If a required quality or apply gate fails, fix the rightful owner and rerun. Do not replace the gate with a blocker report unless a safety, license, or missing user-provided credential limit prevents progress.

## Valid Proof

Valid proof examples:

- patch quality record plus dry-run result
- explicit review authority plus isolated apply
- changed-file accounting
- post-apply verification
- failure evidence plus repair evidence plus verification
- artifact source receipts plus content or format validation
- real-workspace readiness record with exact gate and rollback requirement

Invalid proof examples:

- provider output only
- patch intent only
- dry-run only
- review approval without apply
- apply without verification
- artifact existence only
- host output emitted
- status rendered
- relabeling

## Explicit Exclusions

Do not implement:

- SDK
- extension or plugin system
- browser automation
- external tool servers
- dynamic loading
- default live provider behavior
- broad command expansion
- arbitrary writers
- broad server behavior

## Safety And Truth

Do not:

- use subagents
- manually read provider secret directories
- print, summarize, copy, clean, or modify private provider material
- run live provider outside existing explicit opt-in gates
- enable provider defaults
- mutate the main workspace without explicit reviewed gate and disposable isolation
- bypass sanctioned provider, host, session, tool, edit, execution, artifact, evidence, or result owners
- make terminal text the machine API
- weaken tests or mass-rebaseline snapshots

Missing proof stays partial or not-proven. Report-safe surfaces must redact transcripts, provider output, command output, edit text, patch bodies, hidden reasoning, secrets, tokens, headers, and private paths.

## Documentation

After all gates pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if needed
- docs/sprint/component-adoption-log.md

Rewrite priorities from measured quality outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including task loop, live execution, edit dry-run/apply, quality records, verification, repair, artifacts, host/evaluation, scripts, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Run explicit live commands through existing gates when safe.

## Final Report

Report quality records, write entries, artifact entries, real-workspace readiness, any real-workspace apply result, manual correction counts, verification outcomes, fixes made after failed gates, owner domains changed, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

Commit only after every hard gate passes. After commit, one push attempt is allowed. If push fails, do not retry.
