# Route 10: three-file planning no-write evaluation

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Evaluate whether "3-file planning no-write" should be the next bounded surface after Routes 01-09.

This route must not implement 3-file writes.

The goal is to produce an evidence-based recommendation for the next phase:

- whether 3-file planning no-write is worth doing
- what the smallest safe surface would be
- what must remain unsupported
- what verification would be required
- what risks would make this a bad next investment

Route 10 is a planning/evaluation route only.

## Current context

Routes 01-09 established:

- Route 01: opt-in real candidate mutation happy path passed for selected-workspace single-file update, single-file create, and exactly-two-file update.
- Route 02: candidate mutation failure taxonomy stabilized.
- Route 03: deterministic CLI/user-entry two-file evidence added.
- Route 04: mutation routing projection helper extracted.
- Route 05: compact continuity summary builder extracted.
- Route 06: MCP error taxonomy improved without external MCP readiness claims.
- Route 07: live TTY limited dogfood manual checklist created.
- Route 08: unsupported patch E2E verifier added for real-model-like unsupported outputs.
- Route 09: release/readiness claims audited after Routes 01-08.

The current supported mutation surface remains bounded. The project still must not claim:

- broad/general release readiness
- arbitrary project mutation
- broad apply_patch
- 3+ file writes
- delete/move
- rollback/atomicity
- external/user-configured MCP readiness
- default real-provider readiness

## Core question

Should the next phase introduce a planning-only capability for 3-file tasks, where the system can recognize and explain a possible 3-file plan but must not write files?

The answer may be:

- yes, do 3-file planning no-write next
- no, choose another bounded surface first
- not yet, because evidence or architecture is insufficient
- split into a smaller prerequisite first

The answer must be evidence-based.

## Non-goals

Do not implement:

- 3-file write support
- 3+ file mutation support
- delete/move support
- broad apply_patch support
- rollback
- atomic multi-file recovery
- arbitrary project mutation
- external MCP readiness
- default real-provider release gate
- broad/general release readiness

Do not modify product behavior to make 3-file planning work.

Do not add a new mutation lane unless explicitly stopped/no-write and documentation-only evaluation proves it is necessary. Prefer no product code changes.

Do not weaken existing unsupported guards.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Prefer documentation/research output only.
- Do not change product behavior.
- Do not change default gate membership.
- Do not make real-provider tests part of default release verification.
- Do not claim 3-file readiness.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 10 should not require real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

If an optional real-provider observation is considered, stop and ask for explicit approval. Do not run real-provider checks by default in Route 10.

## Preflight state check

Before editing, verify that Routes 01-09 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -24
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:release:deterministic

If Route 09 is not committed or baseline gates fail for unrelated reasons, stop and report instead of starting Route 10.

## Reference comparison before analysis

Before making changes, perform a narrow read-only comparison against the two reference repositories.

Reference repositories, read-only:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume specific file paths exist.
Do not copy architecture wholesale.
Do not perform a broad audit.
Do not modify either reference repository.

Use rtk for searching and reading.

### Claude Code comparison

Search /home/wang/projects/source-claudecode using keywords related to:

- planning
- edit plan
- file edit
- multi file edit
- todo
- task plan
- patch
- unsupported edit
- read first
- stale edit
- failed edit
- changed files
- failed files
- no write
- dry run

Focus only on how the reference system plans or explains multi-file edits, especially where it separates planning from writing or failure from success.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- plan
- edit plan
- multiedit
- apply_patch
- patch parse
- patch apply
- dry run
- no write
- snapshot
- revert
- changed files
- failed files
- unsupported
- permission

Focus only on how multi-file edit/apply_patch planning, verification, failure, or rollback boundaries are represented.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to 3-file planning no-write
- ideas not applicable to this project
- confirmation that no reference architecture was copied wholesale

If relevant material is not found, report that honestly with search terms used.

## Required target reading

Read these before analysis:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- docs/manual-checks/live-tty-limited-dogfood-checklist.md
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-release-deterministic.mjs
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileCreateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/twoFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts

## Allowed modification scope

Prefer docs-only changes.

Allowed:

- a new planning/evaluation document, preferably:
  - docs/agent-routes/route10-three-file-planning-no-write-evaluation.md
  - docs/design/three-file-planning-no-write-evaluation.md
  - docs/development/three-file-planning-no-write-next-surface.md
- PROJECT_STATE.md, only to add a narrow Route 10 outcome note if appropriate
- RUNBOOK.md, only to link to the evaluation if appropriate
- docs/manual-checks/live-tty-limited-dogfood-checklist.md, only if Route 10 reveals a documentation mismatch
- package.json only if a non-default documentation helper is truly necessary; avoid it

Strongly prefer no product code changes.

## Conditional allowed scope

Only if absolutely necessary to answer the evaluation question, a small non-default deterministic analysis script may be added under scripts/.

Such a script must:

- not change product behavior
- not write project files
- not join default gates
- not imply 3-file readiness
- not require real provider
- not require external MCP
- only inspect existing fixtures or produce a report

Avoid this unless docs-only analysis is insufficient.

## Forbidden modification scope

Do not modify product behavior in:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- mutation lane capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

If analysis suggests these files must change to support a future bounded surface, document it as future scope. Do not implement it in Route 10.

## Evaluation questions

Route 10 must answer:

1. What exactly would "3-file planning no-write" mean?
2. How is it different from 3-file write support?
3. Why might it be useful after Routes 01-09?
4. What user problem would it solve?
5. What user problem would it not solve?
6. What evidence from Routes 01-09 supports attempting it?
7. What evidence argues against attempting it now?
8. What would be the smallest safe implementation surface?
9. What files would be allowed in a future Route 11?
10. What files should remain forbidden in a future Route 11?
11. What default gates must remain unchanged?
12. What verification would prove it is no-write?
13. What verification would prove unsupported writes remain stopped?
14. What would be the success criteria?
15. What would be the failure criteria?
16. What would be the stop conditions?
17. What claim wording would be allowed?
18. What claim wording would be forbidden?
19. Would this route create risk of broad apply_patch creep?
20. Would another next route be better?

## Required evaluation output

Produce a document that includes:

1. Executive recommendation
   - yes / no / not yet / split prerequisite
2. Proposed bounded surface
3. Explicit non-goals
4. Capability boundary
5. User-visible behavior
6. No-write invariant
7. Failure classification
8. Evidence from existing routes
9. Architecture impact
10. Files likely to change in a future route
11. Files that should remain forbidden
12. Validation plan
13. Manual checklist impact
14. Release claim impact
15. Rollback/atomicity impact
16. Real-provider impact
17. MCP impact
18. Risks
19. Anti-goals
20. Recommended next prompt

## Suggested definition to evaluate

A possible definition of 3-file planning no-write:

- The system may identify that a user request appears to require changes across 3 files.
- The system may produce a structured plan listing the files, intended change summaries, and why writing is unsupported.
- The system must not write any file.
- The terminal outcome must be stopped, not success.
- changedFiles must be empty.
- failedFiles or plannedFiles may list the 3 files depending on existing schema.
- The result must explicitly say 3+ file writes are unsupported.
- It must not claim rollback or atomicity.
- It must preserve context for next-turn/manual continuation.
- It must not add broad apply_patch parsing.

Codex should evaluate this definition and refine it if necessary.

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test

Baseline:

- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell

After changes:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary planning reports
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 10 is complete only if:

- a clear evidence-based recommendation exists
- the recommendation does not implement 3-file writes
- the recommendation defines no-write invariant clearly
- future allowed scope is bounded
- future forbidden scope is explicit
- verification plan is concrete
- release claim impact is explicit
- broad apply_patch / 3+ write / delete/move / rollback remain unsupported
- external MCP remains not claimed
- real provider remains opt-in
- no product behavior was changed
- no default gate membership was changed
- all required validation commands pass
- no forbidden product files were modified
- no secret or provider config is printed

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01-09 baseline is missing
- completing this route requires changing product code
- completing this route requires implementing 3-file writes
- completing this route requires changing default gate membership
- completing this route requires real-provider full execution
- completing this route requires external MCP execution
- docs contain a claim conflict requiring product-direction input
- deterministic release gate breaks for reasons unrelated to this route
- the only viable next step would be broad apply_patch or arbitrary mutation

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Evaluation document created
5. Files changed
6. Product code touched? yes/no
7. Capability expanded? yes/no
8. 3-file write implemented? yes/no
9. Default gates changed? yes/no
10. Real provider touched? yes/no
11. External MCP touched? yes/no
12. Secret exposure risk? yes/no
13. Executive recommendation
14. Proposed future bounded surface
15. Future allowed files
16. Future forbidden files
17. No-write invariant
18. Verification plan
19. Claim/readiness impact
20. Validation commands and results
21. Residue cleanup status
22. Residual risks
23. Recommended Route 11 prompt summary
24. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push
