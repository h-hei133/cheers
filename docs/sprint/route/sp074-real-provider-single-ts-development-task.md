# SP074 Real Provider Single TS Development Task

## Goal

Prove that real provider output can drive the current product path to complete one real TypeScript development task in this repository.

This is the primary evidence task. Deterministic cases, transcript cases, copied worktrees, fixture packages, old diagnostics, no-product-gap findings, and documentation-only work cannot complete this task.

The required live task is:

Make the product task proof reject completion when a real selected workspace apply changes a TypeScript source file but no targeted verification receipt covers that changed source. The missing verification must be exposed as safe status without terminal success.

The provider must discover the rightful owners. The final task patch must not be hand-coded as an outer correction.

## Required Path

The live development task must run through the normal product runtime path:

user task
-> normal runtime
-> QueryEngine
-> execution seam
-> source discovery
-> provider-driven patch intent
-> reviewed apply or isolated selected workspace apply
-> focused verification
-> repair and rerun if needed
-> evidence/result verdict

Scripts may set gates, pass inputs, and print safe metadata only. Scripts must not synthesize task success, proof, verdict, fallback result, or verification result.

## Mandatory Completion Gates

All gates below must pass. If any gate is missing, do not claim complete.

1. Real provider run is mandatory and primary.
2. The task must modify real packages/ts-shell/src product source.
3. The task must modify or add a real TypeScript test.
4. The task must use normal runtime, QueryEngine, and execution seam.
5. The task must use reviewed apply or isolated selected workspace apply.
6. Focused test must run against the real TypeScript owner path.
7. Build must run if imports, contracts, or runtime-facing TypeScript changed.
8. If verification fails, repair and rerun through the product path.
9. Complete must come from evidence/result verdict only.
10. Manual correction for provider task output must be 0.
11. False success must be 0.
12. Raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning must not be printed, summarized, committed, or leaked.
13. Changed-file accounting must show the changed product files and the targeted verification coverage.
14. Missing proof must remain not-proven and must not become success.

## Provider Coverage

The live provider evidence must also cover:

- primary provider success
- fallback configured skipped when primary succeeds
- forced primary failure triggers fallback
- fallback passes through the shared task runtime

Fallback coverage must not be a standalone smoke that bypasses the task runtime.

If provider, network, config, auth, or unreachable failure prevents the mandatory live run, mark the task blocked, not complete. Provide manual retest commands, expected fields, failure classification, git status, and whether changes are uncommitted. Do not commit or push a blocked half-completion as capability progress.

## Tooling Requirements

Use Serena MCP for owner discovery, symbol lookup, references, diagnostics, and targeted semantic edits.

Use Spec-Driven Develop as execution discipline for decomposition, acceptance gates, and progress control. Do not create trackers, issue flows, archives, milestones, or extra process systems.

Use pi-docs-playbook, pi, and Superpowers aggressively to identify mature harness patterns that can improve this product path. Prefer structured port or isolated source adoption for small internal helpers when suitable. Behavior-only alignment is allowed only with an explicit reason.

Inspect the current repository owners first. Mature implementation material is read-only and may guide lifecycle, state, recovery, and validation design. Do not copy code blindly.

## Product Naming And Content Rules

During development, product file names and product content must not contain process-history wording, comparison wording, study wording, or names of outside codebases.

Use domain language only.

Do not add business logic to compatibility shims. Do not place new behavior in broad legacy coordination files when a rightful owner exists.

## Forbidden Work

Do not complete by doing any of the following:

- documentation-only update
- tests-only acceptance
- old diagnostic rerun
- transcript-only case
- copied source fixture
- JS mirror
- harness-only test
- no-product-gap report
- deterministic-only result
- provider readiness without live task completion
- fallback smoke without shared task runtime
- manual patch correction of the provider task output

Do not broaden command allowlists, add browser automation, add external tool server behavior, add dynamic plugin loading, add broad SDK/RPC server behavior, or read private provider material.

## Validation

Run focused validation for every touched owner.

Expected validation includes:

- focused test for changed TypeScript owner
- focused test proving changed-source-without-targeted-verification blocks completion
- negative control proving generic green verification cannot cover changed TypeScript source
- live provider task evidence
- primary success evidence
- fallback configured skipped evidence
- forced primary failure fallback evidence
- redaction safety evidence
- result contract or anti-false-success gate if relevant
- build when required
- git diff --check
- git diff --cached --check

Do not claim validation passed unless the command actually ran and passed.

## Final Report

Report:

- tools used
- owners inspected
- mature harness patterns used and whether structured port, isolated source adoption, or behavior-only alignment was chosen
- changed files
- real provider live task evidence
- primary/fallback evidence
- apply mode
- focused verification evidence
- repair and rerun evidence if any
- changed-file accounting
- remaining not-proven claims
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after all completion gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
