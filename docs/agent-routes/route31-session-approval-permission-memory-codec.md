# Route 31: SessionManager approval / permission memory codec batch

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue maintainability extraction by moving approval / permission memory parsing and projection responsibilities out of:

- packages/ts-shell/src/session/SessionManager.ts

Target modules, if safe:

- packages/ts-shell/src/session/approvalMemoryCodec.ts
- packages/ts-shell/src/session/permissionRequestMemoryCodec.ts
- packages/ts-shell/src/session/approvalAuditProjection.ts

This route should migrate 2-3 related parser/codec/projection seams if safe.

The goal is to reduce `SessionManager.ts` ownership of approval audit parsing, permission request parsing, approval memory serialization/deserialization, approval durable record projection, and approval summary fallback logic while preserving authorization semantics, allow/deny behavior, approval persistence timing, session schema, history DB schema, replay behavior, compact behavior, CLI behavior, provider behavior, package scripts, and default gates.

Do not change authorization behavior.
Do not change approval persistence semantics.
Do not change session schema.

## Current context

Completed SessionManager extraction modules include:

- sessionResumeContextBuilder.ts
- sessionContinuityTypes.ts
- compactRetentionPlanner.ts
- mutationContinuityState.ts
- sessionReplayBuilder.ts
- obsolete replayPlanBuilder.ts removed

The current ownership map says `SessionManager.ts` should continue to retain:

- public session lifecycle facade
- persistence read/write timing
- locking and atomic write boundaries
- session loading
- current session facade
- project binding facade
- recovery trust boundary
- compact trigger control

Remaining SessionManager candidates include:

- approval context persistence / approval request parsing
- session persistence gateway
- project binding helper
- current-session selection helper expansion

Route 31 should handle only approval / permission memory parsing and projection, not persistence gateway or schema work.

## Non-goals

Do not add or change:

- approval authorization semantics
- allow/deny behavior
- approval policy
- allow-once cache behavior
- allow-always persistence behavior
- approval persistence timing
- session schema
- history DB schema
- session loading semantics
- current session selection
- project binding
- recovery trust boundary
- replay ordering
- compact trigger behavior
- compact retention semantics
- provider behavior
- CLI behavior
- tool/MCP behavior
- mutation behavior
- package scripts
- default gates
- readiness claims

Do not extract session persistence gateway in this route.
Do not rewrite `SessionManager.ts`.
Do not touch `runMvpIntegratedFlow.ts`.
Do not touch `cli.tsx`.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve session schema.
- Preserve history DB schema.
- Preserve approval authorization semantics.
- Preserve approval persistence timing.
- Preserve replay order.
- Preserve compact trigger behavior.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 31 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize anything under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Allowed real-provider-related checks:

- default skip/readiness checks
- dry-run/listing checks
- classification self-test

Do not run full opt-in real-provider execution unless explicitly approved.

## Reference comparison

Do a narrow read-only comparison if useful, not a broad audit.

Reference repos, if present:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode
- /home/wang/projects/gemini-cli

Search terms:

- permission
- approval
- permission request
- permission reply
- approval memory
- audit
- tool permission
- deny
- allow once
- allowlist
- session persistence

Read at most 2 relevant snippets per reference repo.

Use comparison only to calibrate boundaries:

- permission request/reply/audit data can be represented separately from authorization
- approval display/provenance can be separate from durable memory codec
- session persistence timing should not change during codec extraction
- authorization semantics must not move into codecs

Do not copy code or architecture.

## Required first step

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/sessionContinuityTypes.ts
- packages/ts-shell/src/session/sessionResumeContextBuilder.ts
- packages/ts-shell/src/session/compactRetentionPlanner.ts
- packages/ts-shell/src/session/mutationContinuityState.ts
- packages/ts-shell/src/session/sessionReplayBuilder.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- package.json

Then locate inside `SessionManager.ts`:

- approval audit parsing
- approval audit durable record shape projection
- permission request parsing
- approval memory serialization/deserialization
- approval summary fallback parsing
- trust/permission memory formatting
- approval/request history reconstruction
- approval-related compact/replay handoff facts
- any pure codec/parser/projection helper still inline

This is seam inventory inside the migration task, not a separate audit artifact.

Before coding, prepare an internal inventory for the final report:

1. Approval audit / memory codec responsibilities currently inline.
2. Permission request parser responsibilities currently inline.
3. Approval summary / durable record projection responsibilities currently inline.
4. Which seams are pure and migrated.
5. Which seams are authorization/persistence-timing-adjacent and retained.
6. Local validation after each migrated module.

## Preflight state check

Before coding, verify current baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -140
- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/compactRetentionPlanner.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationContinuityState.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If Route 30 changes are still uncommitted, proceed only if they are exactly the expected Route 30 files and do not conflict with this route. Report that Route 31 is stacked on top of Route 30 changes.
If baseline gates fail for unrelated reasons, stop and report.

## Batch migration targets

### A. approvalMemoryCodec.ts

Extract approval memory serialization/deserialization if safe.

Possible responsibilities:

- encode/decode approval memory records
- normalize approval durable record shape
- parse approval memory facts from already-loaded session data
- format approval memory facts for handoff/summary without changing semantics

Suggested exports:

- `encodeApprovalMemory`
- `decodeApprovalMemory`
- `normalizeApprovalMemoryRecord`
- `ApprovalMemoryRecord`

The module must not:

- decide allow/deny
- change approval policy
- mutate allow-once cache
- persist records
- choose write timing
- change session schema
- change history DB schema

### B. permissionRequestMemoryCodec.ts

Extract permission request parsing / normalization if safe.

Possible responsibilities:

- parse permission request memory entries
- normalize permission request facts
- project permission request durable metadata
- preserve request/reply/provenance facts

Suggested exports:

- `parsePermissionRequestMemory`
- `normalizePermissionRequestMemory`
- `PermissionRequestMemoryRecord`

The module must not:

- authorize requests
- deny/approve tools
- call tools
- mutate permission state
- persist records
- change request lifecycle

### C. approvalAuditProjection.ts

Extract approval audit / summary fallback projection if safe.

Possible responsibilities:

- project approval audit facts
- format safe approval audit summary facts
- parse or normalize approval summary fallback text
- preserve approval provenance facts used in session continuity

Suggested exports:

- `projectApprovalAudit`
- `projectApprovalSummaryFallback`
- `ApprovalAuditProjection`

The module must not:

- write audit logs
- change audit persistence timing
- change approval behavior
- change session schema
- change compact trigger behavior

## Important batching rule

Do not stop after one tiny helper if multiple approval/permission codec seams are safely extractable.

However, do not force extraction when:

- it would change authorization semantics
- it would change persistence timing
- it would change session schema
- it would change compact/replay behavior
- it would require touching forbidden files
- focused tests cannot reasonably cover it

If only one or two modules are safe, extract those and explicitly explain why the others were deferred.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/approvalMemoryCodec.ts
- packages/ts-shell/src/session/approvalMemoryCodec.test.ts
- packages/ts-shell/src/session/permissionRequestMemoryCodec.ts
- packages/ts-shell/src/session/permissionRequestMemoryCodec.test.ts
- packages/ts-shell/src/session/approvalAuditProjection.ts
- packages/ts-shell/src/session/approvalAuditProjection.test.ts
- existing session tests only if behavior-preserving import updates or focused coverage are needed

Only add modules that are actually extracted.

## Conditional allowed scope

Only if strictly necessary for type exports:

- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

If touching these files, explain why type reuse could not stay inside session modules.

Do not change behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/orchestration/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- mutation behavior
- tool execution behavior
- package.json
- scripts/*
- docs/*

If completing this route requires forbidden files, stop and report.

## Behavior preservation requirements

After extraction, these must remain equivalent:

- approval memory parsing
- permission request parsing
- approval audit facts
- approval summary fallback behavior
- session durability
- replay behavior
- compact continuity
- plannedFiles stopped/no-write continuity
- result contract
- deterministic release meta gate

Preserve:

- approval allow/deny behavior
- approval policy behavior
- approval persistence timing
- session schema
- history DB schema
- replay order
- compact trigger behavior
- changedFiles / failedFiles / plannedFiles distinctions
- exit codes
- broadReleaseReady=false
- realProviderTouched=false for deterministic/default checks

## Local validation after each migration

After approval memory codec migration:

- rtk npm run test -w packages/ts-shell -- src/session/approvalMemoryCodec.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After permission request memory codec migration:

- rtk npm run test -w packages/ts-shell -- src/session/permissionRequestMemoryCodec.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After approval audit projection migration:

- rtk npm run test -w packages/ts-shell -- src/session/approvalAuditProjection.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created, do not run its missing test.
Run equivalent focused tests for actual modules.

## Batch validation

After completing all safe Route 31 migrations, run:

- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/compactRetentionPlanner.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationContinuityState.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If any listed test does not exist, inspect package.json/filesystem, report it, and run the closest equivalent.

## Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional behavior comparison

If feasible, capture safe before/after summaries for:

- session durability long
- planned-files continuity
- mutation compact continuity
- release deterministic summary

Compare:

- approval memory facts unchanged
- permission request facts unchanged
- approval audit facts unchanged
- replay/compact behavior unchanged
- changedFiles / failedFiles / plannedFiles unchanged
- release deterministic false claims unchanged

Do not store large logs in repo.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary comparison logs
- temporary /tmp/private-agents-test files created by this route

If residue cannot be cleaned, report why.

## Success criteria

Route 31 is complete only if:

- seam inventory is explicitly reported
- at least one meaningful approval/permission memory codec responsibility is migrated
- 2-3 modules are migrated if safe, or deferred modules are clearly justified
- `SessionManager.ts` delegates migrated responsibilities
- approval authorization semantics are unchanged
- approval persistence timing is unchanged
- session schema is unchanged
- history DB schema is unchanged
- replay and compact behavior are unchanged
- no provider/orchestration/CLI/MCP behavior changed
- no package scripts changed
- no default gates changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- extraction requires changing authorization semantics
- extraction requires changing approval persistence timing
- extraction requires changing session schema
- extraction requires changing history DB schema
- extraction requires changing replay order
- extraction requires changing compact trigger behavior
- extraction requires touching runMvpIntegratedFlow.ts or cli.tsx
- extraction requires touching package.json or scripts
- all approval/permission memory seams are too entangled with persistence lifecycle
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Reference comparison summary, if performed
5. Pre-coding approval/permission memory seam inventory
6. Migrations completed
7. Migrations intentionally left in SessionManager.ts and why
8. Files changed
9. Forbidden files touched? yes/no
10. Product behavior changed? yes/no
11. Approval authorization changed? yes/no
12. Approval persistence timing changed? yes/no
13. Session schema changed? yes/no
14. History DB schema changed? yes/no
15. Replay/compact behavior changed? yes/no
16. Capability expanded? yes/no
17. Default gates changed? yes/no
18. Real provider touched? yes/no
19. Secret exposure risk? yes/no
20. New modules and responsibilities
21. SessionManager responsibilities retained
22. SessionManager responsibilities migrated
23. Focused tests added/reused
24. Approval/permission memory preservation evidence
25. Session durability / plannedFiles preservation evidence
26. Local validation results
27. Batch validation results
28. Full validation results
29. Residue cleanup status
30. Claim/readiness changes
31. Residual risks
32. Recommended next route
33. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.
