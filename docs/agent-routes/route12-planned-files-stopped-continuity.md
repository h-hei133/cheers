# Route 12: planned-files stopped result continuity

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Improve continuity and user-visible preservation for exactly-three planning/no-write stopped results, without adding write capability.

Route 11 added deterministic evidence for exactly-three existing-file Update File planning/no-write:

- outcome=stopped
- classification=three-file-planning-no-write
- plannedFiles=[three files]
- changedFiles=[]
- writerInvoked=false
- workspaceUnchanged=true

Route 12 must ensure this stopped planning result remains clear and preserved across result surfaces, session/compact continuity, and next-turn context where applicable.

This route is about continuity and result surface. It is not about adding three-file writes.

## Desired user-visible invariant

When exactly-three planning/no-write occurs, the system should consistently preserve and surface:

- terminal outcome: stopped
- classification/reason: three-file-planning-no-write or equivalent bounded unsupported reason
- plannedFiles: the three intended files, if the current schema supports it
- changedFiles=[]
- failedFiles or reason explaining no write was performed
- no writer invocation
- no rollback/atomicity claim
- a user-understandable explanation that exactly-three writes remain unsupported
- enough context for a follow-up turn to understand what was planned and why it stopped

## Current context

Routes 01-11 established:

- Route 01: opt-in real candidate mutation happy path passed.
- Route 02: candidate mutation failure taxonomy stabilized.
- Route 03: deterministic CLI/user-entry two-file evidence added.
- Route 04: mutation routing projection helper extracted.
- Route 05: compact continuity summary builder extracted.
- Route 06: MCP error taxonomy improved.
- Route 07: live TTY limited dogfood manual checklist created.
- Route 08: unsupported patch E2E verifier added.
- Route 09: release/readiness claims audited.
- Route 10: 3-file planning/no-write evaluated.
- Route 11: exactly-three existing-file Update File planning/no-write implemented as stopped/no-write.

Route 12 should build on Route 11 but must not expand it into write support.

## Non-goals

Do not add:

- 3-file write support
- 3+ mutation support
- broad apply_patch support
- delete/move support
- rollback
- atomic multi-file recovery
- arbitrary project mutation
- external/user-configured MCP readiness
- real-provider default gate
- broad/general release readiness

Do not convert planning/no-write stopped results into success.

Do not add a broad planned-files schema migration unless the narrow surface requires it and it is behavior-preserving.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve the no-write invariant from Route 11.
- Do not weaken existing unsupported guards.
- Do not change default gate membership.
- Do not make real-provider tests part of default release verification.
- Do not claim 3-file write readiness.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 12 should not require real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

If real-provider execution appears necessary, stop and report.

## Preflight state check

Before coding, verify that Route 11 is present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -30
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:session-durability:long
- rtk npm run verify:release:deterministic

If Route 11 is not committed or the baseline gates fail for unrelated reasons, stop and report instead of starting Route 12.

## Reference comparison before coding

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

- stopped result
- failed tool result
- planned files
- changed files
- failed files
- compact
- resume
- session transcript
- continue
- tool result persistence
- edit failure
- unsupported edit
- user-visible error

Focus only on how stopped/failed edit or tool results are preserved in user-visible output and continuation context.

Read at most 3-5 relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- tool result
- failed tool
- changed files
- failed files
- apply_patch failure
- session output
- snapshot
- revert
- permission denied
- user-visible error
- plan
- no write

Focus only on how stopped/failed edit/apply results are represented and preserved for users or future turns.

Read at most 3-5 relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to planned-files stopped continuity
- ideas not applicable
- confirmation that no reference architecture was copied wholesale

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- docs/design/three-file-planning-no-write-evaluation.md
- package.json
- scripts/verify-real-user-capabilities.mjs
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/compactContinuitySummary.test.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts

## Allowed modification scope

Prefer the narrowest possible change.

Allowed:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/compactContinuitySummary.test.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- scripts/verify-real-user-capabilities.mjs
- package.json only for a clearly named non-default verifier if necessary
- docs only to keep claim wording accurate

Allowed behavior:

- preserve plannedFiles in stopped/no-write evidence
- improve stopped result formatting if behavior-preserving
- add deterministic verifier coverage for plannedFiles continuity
- add focused tests for resultMapper/sessionStateSurface/compact summary if needed
- ensure plannedFiles is not confused with changedFiles
- ensure terminal outcome remains stopped

## Conditional allowed scope

Only if strictly necessary, a narrow change may be made in:

- packages/ts-shell/src/session/SessionManager.ts

But prefer not to touch it. If touching SessionManager.ts is required, stop first and explain why compactContinuitySummary.ts or stoppedSessionContinuity.ts is insufficient.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- provider/auth core behavior
- MCP core behavior
- mutation lane write capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

If completing this route requires touching forbidden files, stop and report.

## Required scenarios

At minimum, cover:

1. exactly-three planning/no-write result surface
   - outcome stopped
   - plannedFiles visible where intended
   - changedFiles=[]
   - writerInvoked=false
   - successLike=false

2. plannedFiles vs changedFiles distinction
   - plannedFiles may contain three files
   - changedFiles must remain empty
   - no UI/report wording implies files were modified

3. compact/session continuity
   - stopped/no-write reason survives compact or continuity summary if current architecture supports it
   - planned files or a safe summary of planned files survives if current schema supports it
   - no false success in next-turn context

4. exactly-two supported path remains green
   - Route 03 verifier still passes
   - wording does not make exactly-two look stopped

5. unsupported adjacent cases remain stopped/error
   - 4-file
   - delete/move
   - malformed patch-like output

6. Route 11 no-write invariant remains intact
   - workspace unchanged
   - writer unreachable
   - no write intent

## Verification strategy

Prefer deterministic tests and a non-default verifier.

A good verifier name would be:

- verify:real-user-capabilities:planned-files-continuity

The verifier must be non-default and must not join release deterministic or release core by default in this route.

It should report:

- scenario name
- outcome
- classification
- plannedFiles
- changedFiles
- failedFiles
- writerInvoked
- workspaceUnchanged
- compactContinuityIncludesPlannedFiles or compactContinuityIncludesStoppedReason
- terminalSurfaceIncludesNoWrite
- successLike=false

## Result surface requirements

For the Route 11 planned-files stopped result, final evidence should show:

- stopped reason is user-understandable
- planned files are not labeled as changed files
- changedFiles remains empty
- failedFiles or stopped reason communicates why writes were not done
- no rollback/atomicity claim appears
- session/compact summary does not drop the stopped/no-write nature
- follow-up context can understand the prior result was planning/no-write, not a successful mutation

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
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

- run any new Route 12 planned-files continuity verifier
- run any focused tests added
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Documentation requirements

If docs are updated, allowed wording is:

- planned-files stopped/no-write continuity has deterministic evidence
- exactly-three planning/no-write remains stopped and non-writing
- exactly-three write remains unsupported
- plannedFiles are not changedFiles
- 3+ mutation readiness is not claimed
- broad apply_patch remains unsupported
- delete/move remains unsupported
- rollback/atomicity remains unsupported

Forbidden wording:

- 3-file writes supported
- 3+ mutation ready
- broad apply_patch ready
- arbitrary mutation ready
- rollback ready
- broad release ready

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary continuity workspaces
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 12 is complete only if:

- plannedFiles stopped/no-write continuity has deterministic evidence
- plannedFiles are not confused with changedFiles
- changedFiles remains empty for exactly-three planning/no-write
- terminal/session/compact surface preserves stopped/no-write nature where applicable
- exactly-two supported path remains green
- 4-file/delete/move/malformed unsupported paths remain stopped/error
- Route 11 no-write invariant remains intact
- no mutation write capability was added
- no broad apply_patch was added
- no default gates changed
- no real-provider default dependency was added
- all required validation passes
- no forbidden product files were modified
- no secret or provider config is printed

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01-11 baseline is missing
- completing this route requires changing cli.tsx, runMvpIntegratedFlow.ts, patchMutationLane.ts, or patchApplication/*
- completing this route requires adding 3-file writes
- completing this route requires broad apply_patch
- completing this route requires delete/move/rollback
- completing this route requires changing default gates
- completing this route requires real-provider execution
- no safe continuity/result surface seam exists
- the only way to pass is to label planned files as changed files

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Continuity seam chosen
5. Files changed
6. Forbidden files touched? yes/no
7. Capability expanded? yes/no
8. 3-file write implemented? yes/no
9. Default gates changed? yes/no
10. Real provider touched? yes/no
11. Secret exposure risk? yes/no
12. Planned-files stopped continuity evidence
13. plannedFiles vs changedFiles evidence
14. Session/compact continuity evidence
15. Exactly-two regression evidence
16. Unsupported adjacent evidence
17. Route 11 no-write invariant evidence
18. Validation commands and results
19. Residue cleanup status
20. Claim/readiness changes
21. Residual risks
22. Recommended next route
23. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push
