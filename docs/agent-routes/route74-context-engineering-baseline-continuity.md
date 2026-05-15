# Route 74: context engineering baseline and continuity map

## Objective

Start Phase 2 after edit capability closeout.

Route 73 sealed edit capability as a closeout candidate. Route 74 should establish the context engineering baseline that future compact, memory, startup cooling, sidebar, undo/restore UX, and sandbox policy can share.

This route should not be docs-only.

It should create:

- a context engineering design map
- a layered context model
- a compact/continuity survivability contract
- a minimal context state projection helper
- a machine-checkable context continuity manifest or typed equivalent
- tests proving critical edit/recovery/route facts survive context projection
- roadmap update from edit closeout into context engineering phase

This route must not implement a full memory system, full sidebar UI, full startup cache, provider changes, MCP behavior changes, broad compact rewrite, or large CLI/session lifecycle rewrite.

## Current state

Build on the current working tree. Do not reset Route 57-73 changes.

Current completed phase:

- Edit capability is closeout-candidate.
- Supported bounded edit surface:
  - selected-workspace single-file update/create/move/delete
  - bounded 2-32 update-only
  - bounded 2-32 mixed
  - bounded 2-32 delete-only
  - bounded 2-32 move-only
  - marker apply_patch candidates
  - safe git-style broad patch subset
  - fenced safe git-style broad diff subset
  - rename-with-content decomposition
- Explicit restore / recovery surface exists:
  - recovery authority store
  - restore preview
  - restore execution bridge
  - recovery authority index
  - recovery surface projection
  - local /restore command
- Blocked by design:
  - 33+ writes
  - arbitrary broad apply_patch
  - fuzzy patch
  - binary/mode/symlink/submodule/copy
  - directory operations
  - overwrite
  - automatic recovery
  - atomic rollback
  - default durable persistence

Known next phase:

- Context engineering
- Compact v2
- Project memory candidates
- Startup cooling / warm context cache
- Sidebar state model
- Undo/restore productization
- Runtime/tool sandbox hardening

Route 74 should define the shared context substrate for those phases.

## Reference scan first

Do a bounded context/continuity-oriented scan before code edits.

Primary references:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- ClaudeCode: inspect at most 6 directly relevant files
- opencode: inspect at most 5 directly relevant files
- gemini-cli: inspect at most 5 directly relevant files
- total external files: at most 16
- exceed by at most 2 files only if a direct compact/session/context file is clearly useful
- do not copy implementation code verbatim
- record architecture patterns, data boundaries, and implications only

Search focus:

ClaudeCode:

- compact
- context
- session
- memory
- resume
- todo
- file history
- tool result

opencode:

- session
- context
- snapshot
- revert
- summary
- tool result
- project
- command

gemini-cli:

- checkpoint
- memory
- context
- compression
- session
- restore
- tool result
- project

The scan should answer:

1. What information survives compact/resume/session continuity?
2. How do references separate immediate prompt context, project context, session history, and tool result memory?
3. How do they preserve file edits / restore / checkpoint facts across continuation?
4. What should be kept machine-readable versus natural-language summary?
5. What local context model is best for this project?

Record findings in docs/design/context-engineering-continuity-baseline.md.

## Validation policy

Use focused validation. Do not run broad package tests.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

After docs-only tasks:

- rtk git diff --check

After code/test tasks:

- run focused tests for touched modules only
- rtk git diff --check

Final:

- rtk npm run verify:edit-capability-closeout
- rtk npm run test -w packages/ts-shell -- src/core src/session src/orchestration/patchResult src/orchestration/patchRecovery
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If the focused src/core or src/session test path includes unrelated existing failures, narrow to touched tests and document the unrelated failures. Do not expand into unrelated shell/session failures.

Do not run provider/default/MCP gates.

## Read first

Edit closeout docs:

- docs/design/edit-capability-roadmap.md
- docs/design/edit-capability-closeout-seal.md
- docs/design/edit-closeout-readiness-and-fenced-broad-diff.md
- docs/design/realistic-edit-compatibility-gauntlet.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/minimum-recovery-authority-loop.md

Edit closeout code/evidence:

- packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts
- packages/ts-shell/src/orchestration/patchResult/editCapabilityReadiness.ts
- scripts/verify-edit-capability-closeout.mjs

Recovery/restore:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityIndex.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandRunner.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandContract.ts

Session/shell/context/compact candidates:

- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/session/sessionStateSurface.ts
- packages/ts-shell/src/session/*
- packages/ts-shell/src/core/*
- packages/ts-shell/src/entrypoints/cli.tsx, inspect only unless necessary
- any existing compact/context/memory/resume modules found by search
- existing tests for touched modules

Do not touch cli.tsx unless a blocker is reported first.

## Allowed scope

Allowed:

- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md, concise Route 74 update only
- docs/design/edit-capability-closeout-seal.md, Route 74 note only if needed
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- this route spec

If no suitable context directory exists, preferred new location:

- packages/ts-shell/src/core/context/contextLayerModel.ts
- packages/ts-shell/src/core/context/contextContinuityManifest.ts
- packages/ts-shell/src/core/context/contextStateProjection.ts

Conditionally allowed:

- a minimal context fixture/test helper under local test conventions
- small integration with sessionStateSurface if clean
- small integration with sessionRuntime summary projection if clean

Forbidden unless a blocker is reported first:

- full memory system
- persistent memory storage
- full compact rewrite
- broad session lifecycle rewrite
- sidebar UI
- startup cache implementation
- provider behavior changes
- MCP behavior changes
- package scripts
- default gates
- SessionManager persistence schema changes
- automatic recovery
- atomic rollback
- edit capability expansion beyond Route 73 closeout state

## Batched tasks

### Task 1: context engineering baseline design

Create docs/design/context-engineering-continuity-baseline.md.

Include:

- post-edit-closeout baseline
- bounded reference scan summary
- why context engineering is the next phase
- context layers
- continuity contract
- compact survivability contract
- memory candidate boundaries
- startup warm context boundaries
- sidebar state boundaries
- undo/restore context boundaries
- sandbox policy context boundaries
- non-goals
- next-route decision criteria

Define the context layers:

1. Immediate prompt context
2. Task/goal context
3. Project context
4. Route/history context
5. Edit capability context
6. Mutation/evidence context
7. Recovery/restore context
8. Tool/MCP/skills availability context
9. Compact summary context
10. Future memory candidate context
11. Sidebar state context
12. Startup warm context

Minimum validation:

- rtk git diff --check

### Task 2: audit current context/compact/session state

Audit current session, compact, resume, and context-related modules.

Document findings in the design note.

The audit should answer:

- what current state is already machine-readable
- what current state is only natural-language summary
- what survives session continuation
- what survives compact if compact exists
- what edit/recovery facts are currently lost or not surfaced
- where route history is represented
- where project facts are represented
- where user-facing summaries are generated
- where future memory extraction could hook in
- what should not be implemented in Route 74

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: add context layer model

Add a typed context layer model.

Preferred file:

- packages/ts-shell/src/core/context/contextLayerModel.ts

Required concepts:

- ContextLayerId
  - immediate-prompt
  - task-goal
  - project
  - route-history
  - edit-capability
  - mutation-evidence
  - recovery-restore
  - tool-availability
  - compact-summary
  - memory-candidate
  - sidebar-state
  - startup-warm

- ContextRetentionClass
  - current-turn-only
  - task-scoped
  - session-scoped
  - compact-survivor
  - project-scoped-candidate
  - user-memory-candidate
  - never-persist

- ContextSensitivity
  - public-summary
  - project-internal
  - secret-sensitive
  - raw-content-sensitive
  - execution-sensitive

- ContextPayloadKind
  - natural-language-summary
  - structured-evidence
  - capability-manifest
  - recovery-authority-reference
  - validation-evidence
  - tool-state
  - unknown

The model should be pure types/constants/helpers. It must not persist data.

Minimum validation:

- focused tests for classification helpers if added
- rtk git diff --check

### Task 4: add continuity manifest

Add a machine-checkable continuity manifest for what must survive compact/session continuation.

Preferred file:

- packages/ts-shell/src/core/context/contextContinuityManifest.ts

Required sections:

- mustSurviveCompact
- shouldSurviveCompact
- mustNotSurviveCompact
- memoryCandidateOnly
- sidebarOnly
- startupWarmCandidate

Must-survive compact candidates:

- current user goal / route objective
- active constraints / forbidden files
- current project root if safe
- edit capability closeout status
- supported edit capability envelope
- blocked-by-design edit capabilities
- last mutation changedFiles / failedFiles / plannedFiles
- recovery availability summary
- restore authority references, not raw original content
- validation status summary
- explicit user decisions / approvals if current contract supports it
- unresolved blockers / next action

Must-not-survive compact:

- raw original content blobs
- raw secrets
- raw recovery authority content
- ephemeral temp paths unless needed as explicit user-provided ledgerRoot
- full command output unless summarized
- provider credentials
- hidden chain-of-thought
- broad raw file dumps

The manifest should reference Route 73 edit closeout capability status without duplicating large data where possible.

Minimum validation:

- focused tests for manifest consistency
- rtk git diff --check

### Task 5: add context state projection helper

Add a pure projection helper.

Preferred file:

- packages/ts-shell/src/core/context/contextStateProjection.ts

The helper should build a compact-safe context state from explicit inputs.

Preferred inputs:

- taskGoal
- routeInfo
- projectInfo
- editCapabilityReadiness / closeout manifest
- mutation evidence:
  - plannedFiles
  - changedFiles
  - failedFiles
  - postWriteVerification
  - writer flags
- recovery summary:
  - recoveryAvailable
  - restorePreviewAvailable
  - restoreExecuteAvailable
  - recoveryAuthorityId references
  - blocked reasons
- validation evidence:
  - tests run
  - verifier results
  - build/result-contract status
- tool availability summary:
  - MCP/tools/skills availability as optional placeholders, do not implement discovery
- compact summary, optional

Preferred output:

- layers
- compactSurvivorFacts
- memoryCandidates
- sidebarFacts
- startupWarmCandidates
- redactions
- warnings
- evidence

Required behavior:

- raw original content must not be included
- recovery authority references may be included only as references/ids, not content
- unsupported/blocked capabilities must remain visible
- edit closeout status must be represented
- automatic recovery and atomic rollback must not be implied
- output should be deterministic and testable

Minimum validation:

- focused tests for contextStateProjection
- rtk git diff --check

### Task 6: connect edit/recovery closeout to context projection

Integrate existing edit closeout/readiness/recovery projection into the new context model if clean.

Preferred behavior:

- context projection can consume editCapabilityCloseoutManifest or editCapabilityReadiness
- context projection can consume recoverySurfaceProjection output
- context projection can summarize restore availability without exposing raw content
- context projection can preserve blocked-by-design edit capabilities
- no runtime behavior change unless called in tests or a small pure surface helper

If direct integration is too coupled, keep it as pure adapter functions and document future integration.

Minimum validation:

- focused context + edit/recovery projection tests
- rtk git diff --check

### Task 7: add continuity regression tests

Add tests proving critical continuity facts survive projection.

Required tests:

1. Edit closeout facts survive:
   - bounded cap 32
   - bounded safe patch supported
   - arbitrary broad blocked
   - fuzzy blocked
   - automatic recovery blocked
   - atomic rollback blocked

2. Mutation facts survive:
   - plannedFiles
   - changedFiles
   - failedFiles
   - postWriteVerification
   - writer flags

3. Recovery facts survive safely:
   - restore preview available where authority exists
   - restore execute explicit-only
   - recovery authority id/reference preserved
   - raw original content not included
   - hidden user edit guard summary preserved

4. Compact redaction:
   - raw content sensitive facts are excluded
   - secret-sensitive placeholders are redacted
   - full command output can be summarized but not blindly persisted

5. Memory candidates:
   - project-scoped facts can be marked as candidates
   - route-specific transient details do not become user memory
   - blocked-by-design decisions can be project memory candidates

6. Sidebar facts:
   - changed/failed/restorable/blocked facts can be projected as sidebar facts
   - MCP/tools/skills placeholders are represented without discovery implementation

Minimum validation:

- focused context tests
- rtk git diff --check

### Task 8: optional session surface hook

If clean, expose a minimal context continuity summary through existing session state surface.

Preferred behavior:

- no new CLI command
- no broad lifecycle change
- add pure formatter/helper only
- session surface can show:
  - current task goal
  - edit closeout status
  - changed/failed files
  - restore available
  - blocked next action
- no raw content
- no provider/MCP behavior changes

If this is too coupled, skip and document future route.

Minimum validation:

- focused sessionStateSurface/sessionRuntime tests if touched
- rtk git diff --check

### Task 9: roadmap update

Update docs/design/context-engineering-continuity-baseline.md with final implementation notes:

- modules added
- manifest sections
- projection behavior
- continuity tests
- session hook status
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark edit closeout phase as complete/candidate
- mark context engineering phase started
- add Route 74 evidence
- do not reopen edit scope unless a concrete blocker appears

Recommended next route should be one of:

1. Route 75: Compact v2 route continuity
   - if context baseline is stable

2. Route 75: Project memory candidate extraction
   - if compact already preserves enough context

3. Route 75: Startup warm context cache
   - if session/project context projection is stable

4. Route 75: Sidebar state model
   - if context projection already provides sidebar facts cleanly

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of context projection:

- edit closeout behavior
- parser/routing/write behavior
- recovery/restore execution behavior
- bounded cap 32 behavior
- arbitrary broad apply_patch blocked behavior
- fuzzy/binary/mode/symlink/submodule blocked behavior
- automatic recovery absence
- atomic rollback absence
- provider/MCP behavior
- package scripts
- default gates
- SessionManager persistence schema
- full compact behavior unless a tiny pure helper is added

New context projection paths may:

- summarize edit capability state
- summarize mutation evidence
- summarize recovery/restore availability
- mark memory candidates
- mark sidebar facts
- mark startup warm candidates

New context projection paths must not:

- persist data
- store raw original content
- expose secrets
- alter runtime write behavior
- imply automatic recovery
- imply atomic rollback
- discover MCP/tools/skills dynamically unless already available via input

## Success criteria

Route is complete if:

- context engineering design note exists
- bounded reference scan is summarized
- current context/compact/session audit is documented
- context layer model exists and is tested if helper logic exists
- continuity manifest exists and is tested
- context state projection helper exists and is tested
- edit closeout / recovery state can be projected safely
- compact-survivor facts are machine-checkable
- raw recovery content / secrets are excluded
- memory candidates are distinguished from compact survivors
- sidebar facts are represented without full UI
- startup warm candidates are represented without full cache
- optional session surface hook is implemented or explicitly deferred
- edit closeout verifier still passes
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- context projection requires full compact rewrite
- memory implementation becomes necessary
- sidebar UI becomes necessary
- startup cache implementation becomes necessary
- SessionManager persistence schema changes become necessary
- provider/MCP changes become necessary
- edit runtime behavior changes become necessary
- raw content or secrets would need to be persisted

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Current context/compact/session audit summary
5. Context layer model status
6. Continuity manifest status
7. Context state projection status
8. Edit/recovery integration status
9. Continuity tests covered
10. Optional session surface hook status
11. Files changed
12. Forbidden files touched? yes/no
13. Edit runtime behavior changed? yes/no
14. Provider/MCP behavior changed? yes/no
15. Package scripts/default gates changed? yes/no
16. Raw content/secrets persisted? yes/no
17. Memory system implemented? yes/no
18. Sidebar UI implemented? yes/no
19. Startup cache implemented? yes/no
20. Focused validation
21. Edit closeout verifier validation
22. Final validation
23. Residue cleanup
24. Residual risks
25. Next recommended route
26. Proposed commit message

Do not commit or push.
