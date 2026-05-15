# Route 74: context engineering baseline and continuity map

## Objective

Start the context engineering phase after edit capability closeout.

Route 73 sealed the current edit capability as a closeout candidate. The next phase should not immediately build a full memory system, sidebar, or large compact rewrite. Route 74 should establish the shared context model that compact, memory, startup warmup, sidebar, restore UX, and future route execution can build on.

Primary goal:

- audit current context/session/compact continuity surfaces
- define context layers and continuity anchors
- define what must survive compact
- define memory candidate categories without implementing full memory
- define startup warmup candidates without implementing full startup cache
- define sidebar state candidates without implementing sidebar UI
- define how edit capability closeout state and recovery/restore state enter context
- add a small pure context engineering projection / manifest if useful
- add focused tests for the pure model
- update roadmap/design docs for the next phase

This route should be a baseline and contract route with a small pure implementation. It must not become a large compact rewrite, memory system, sidebar implementation, startup cache implementation, or UI project.

## Current state

Build on the current working tree. Do not reset Route 57-73 changes.

Edit capability state after Route 73:

- edit capability is closeout-candidate
- selected-workspace bounded edit surface is defined
- bounded cap is 32
- safe marker-style and git-style/fenced broad patch subsets are supported
- unsupported broad/fuzzy/binary/mode/symlink/submodule/copy/directory/overwrite shapes are blocked by design
- recovery authority capture is non-default / explicit
- restore preview and restore execute are explicit
- local restore command exists
- automatic recovery remains absent
- atomic rollback remains absent
- default durable persistence remains absent
- edit closeout manifest/readiness/verifier exist

The next phase should preserve this edit capability state across context operations and compact. The agent should not forget:

- current capability envelope
- blocked-by-design edit boundaries
- restore availability and explicitness
- recent changed / failed / planned files
- route state
- validation state
- user decisions and constraints

## Reference scan first

Do a bounded context/compact/session scan before edits.

Reference repositories:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- ClaudeCode: inspect at most 6 directly relevant files
- opencode: inspect at most 6 directly relevant files
- gemini-cli: inspect at most 6 directly relevant files
- total external files: at most 18
- exceed by at most 2 files only if a direct compact/context/session continuity file is clearly useful
- do not copy implementation code verbatim
- record path references, architectural patterns, and implications only

Search focus:

ClaudeCode:

- compact
- context
- conversation
- summary
- session
- memory
- fileHistory
- tool result

opencode:

- session
- context
- summarize
- compact
- message
- state
- snapshot
- tool result

gemini-cli:

- context
- memory
- checkpoint
- session
- tool result
- compression
- summary
- restore

The scan should answer:

1. How do references preserve task continuity across long sessions?
2. What is summarized versus preserved as structured state?
3. How are tool results / file edits / restore checkpoints represented after compaction?
4. How is project-level context loaded or warmed?
5. What should this project copy conceptually for context engineering?
6. What should remain deferred until memory/sidebar/compact v2 routes?

Record findings in docs/design/context-engineering-baseline-continuity.md.

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
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If a pure context model is added, run its focused tests in final validation.

Do not run broad package tests.

Do not run provider/default/MCP gates.

Do not expand into unrelated shell/session failures unless this route directly touches those files.

## Read first

Edit closeout / recovery baseline:

- docs/design/edit-capability-closeout-seal.md
- docs/design/edit-capability-roadmap.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/realistic-edit-compatibility-gauntlet.md
- packages/ts-shell/src/orchestration/patchResult/editCapabilityReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts if present
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandRunner.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandContract.ts

Current session / shell / compact / continuity surfaces:

- locate existing files using bounded repo search for:
  - compact
  - context
  - summary
  - sessionRuntime
  - sessionStateSurface
  - continuation
  - route
  - memory
  - restore summary
  - command registry
- inspect likely files, including but not limited to:
  - packages/ts-shell/src/core/shell/sessionRuntime.ts
  - packages/ts-shell/src/session/sessionStateSurface.ts
  - packages/ts-shell/src/core/commands/*
  - packages/ts-shell/src/entrypoints/cliArgs.ts
  - docs/design/*compact*
  - docs/design/*session*
  - docs/design/*context*
  - PROJECT_STATE.md if present
  - RUNBOOK.md if present

Do not touch SessionManager.ts, cli.tsx, provider, MCP, or package scripts unless a blocker is reported first.

## Allowed scope

Allowed:

- docs/design/context-engineering-baseline-continuity.md
- docs/design/context-engineering-roadmap.md if useful
- docs/design/edit-capability-roadmap.md, concise phase transition note only
- docs/design/edit-capability-closeout-seal.md, Route 74 note only if needed
- packages/ts-shell/src/core/context/* if this folder exists or is clearly appropriate
- packages/ts-shell/src/core/shell/* pure projection helpers if more appropriate
- packages/ts-shell/src/session/* pure projection helpers if more appropriate
- focused tests for any new pure context model/helper
- this route spec

Conditionally allowed:

- a pure context manifest/helper, for example:
  - contextEngineeringMap.ts
  - contextContinuityProjection.ts
  - contextLayerManifest.ts
  - contextSurvivalPolicy.ts
- a JSON design manifest if code is unnecessary:
  - docs/design/context-engineering-baseline.manifest.json

Forbidden unless a blocker is reported first:

- large compact rewrite
- full memory system
- persistent memory storage
- startup cache implementation
- sidebar UI implementation
- MCP UI / skills UI implementation
- SessionManager persistence schema changes
- cli.tsx rewrite
- provider behavior changes
- MCP behavior changes
- package script changes
- default gates
- edit capability behavior changes
- automatic recovery
- atomic rollback

## Batched tasks

### Task 1: context engineering design document

Create docs/design/context-engineering-baseline-continuity.md.

Include:

- post-edit-closeout baseline
- bounded reference scan summary
- current local context/session/compact audit
- context layer taxonomy
- continuity anchor model
- compact survival policy
- future memory candidate policy
- startup warmup candidate policy
- sidebar state candidate policy
- edit capability state in context
- recovery/restore state in context
- route history in context
- validation/evidence state in context
- token efficiency implications
- non-goals
- next route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: audit local context and compact surfaces

Audit current local implementation and document findings.

The audit should answer:

- where current session output/state is rendered
- where compact or summary logic exists
- how current session continuity works
- how command results are surfaced
- where restore/recovery summaries are currently available
- whether route history is represented anywhere
- whether edit capability state is currently available to runtime surfaces
- what data is structured versus natural-language only
- what compact would currently lose
- what should be preserved in future compact v2

Do not modify runtime behavior in this task unless a tiny pure projection is necessary later.

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: define context layers and continuity anchors

In the design doc, define context layers.

Required layers:

1. immediate prompt context
2. current task context
3. route context
4. session context
5. project context
6. edit capability context
7. recovery/restore context
8. validation/evidence context
9. tool/MCP/skills availability context
10. compact summary context
11. future memory context
12. future sidebar state context
13. future startup warm context

Define continuity anchors:

- user goal
- current route / task
- constraints / forbidden files
- affected files
- read files
- planned files
- changed files
- failed files
- recovery authority availability
- restore records / restore commands
- validation results
- capability envelope
- unsupported boundaries
- user decisions
- open blockers
- next recommended route

Minimum validation:

- rtk git diff --check

### Task 4: add pure context engineering manifest/helper

Add a pure helper if useful and low churn.

Preferred location:

- packages/ts-shell/src/core/context/contextEngineeringMap.ts

If core/context does not exist and another local folder is more appropriate, choose the least invasive location and document the choice.

Preferred exported concepts:

- ContextLayerId
- ContextArtifactKind
- ContinuityAnchorKind
- CompactSurvivalLevel:
  - "must-preserve"
  - "should-preserve"
  - "summarize"
  - "drop-after-task"
- MemoryCandidateLevel:
  - "not-memory"
  - "session-memory-candidate"
  - "project-memory-candidate"
  - "user-preference-candidate"
  - "capability-memory-candidate"
- StartupWarmCandidateLevel:
  - "not-warm"
  - "cheap-warm"
  - "lazy-warm"
  - "expensive-defer"
- SidebarSurfaceLevel:
  - "not-sidebar"
  - "summary"
  - "detail"
  - "actionable"
- ContextContinuityItem
- ContextEngineeringMap

The helper should be static/pure. It should not:

- read files
- write files
- persist memory
- alter compact behavior
- alter runtime session behavior
- call provider/model
- depend on external services

It should encode the baseline taxonomy and support tests like:

- edit capability envelope is must-preserve across compact
- recovery/restore availability is must-preserve or should-preserve
- raw tool output can be summarized or dropped depending on kind
- user constraints are must-preserve
- validation evidence is should-preserve
- sidebar actionable items include restore availability and current blockers
- memory candidates exclude transient command output by default

If code helper feels premature, create a docs/design/context-engineering-baseline.manifest.json instead and explain why code was deferred.

Minimum validation:

- focused tests for helper if code is added
- rtk git diff --check

### Task 5: define compact survival policy

In the design doc and helper/manifest if added, define what must survive compact.

Must-preserve examples:

- current user goal
- active route/task
- hard constraints and forbidden files
- edit capability envelope / closeout state
- unsupported edit boundaries
- changed/failed/planned file facts for current task
- recovery/restore availability and explicitness
- current restore command hints
- validation status
- unresolved blockers
- next recommended route

Should-preserve examples:

- important design decisions
- relevant docs touched
- recent external reference findings
- validation command summaries
- high-value tool outputs

Summarize examples:

- verbose command logs
- long file excerpts after key facts are extracted
- repeated validation output
- external scan details after path references are recorded

Drop-after-task examples:

- transient failed commands with no impact
- repeated low-level search output
- temporary scratch details
- obsolete candidate paths

Minimum validation:

- focused tests if helper/manifest is code
- rtk git diff --check

### Task 6: define future memory candidate policy

Do not implement memory storage.

Define candidate classes:

- project structure memory
- project command/validation memory
- user preference memory
- route history memory
- edit capability memory
- rejected decision memory
- restore/recovery policy memory
- sandbox/tool policy memory
- compact summary memory

Define non-memory:

- raw secrets
- raw original file content
- raw recovery authority blobs
- transient command output
- temporary scratch paths
- large logs
- private provider credentials
- audit residue

Define explicit future requirement:

- memory writes must be user-visible or policy-controlled
- memory must distinguish project facts from user preferences
- memory must not silently persist recovery authority content

Minimum validation:

- rtk git diff --check

### Task 7: define startup warmup and sidebar candidate policies

Do not implement startup cache or sidebar UI.

Startup warmup candidate policy should include:

- project root / package manager / workspace layout
- recent session summary
- edit capability closeout manifest
- validation command map
- git status summary
- route roadmap pointer
- MCP/tools/skills availability summary, future
- compact summary pointer, future

Sidebar candidate policy should include:

- current route/task
- read files
- changed files
- planned files
- failed files
- restore available / restore commands
- validation results
- current capability envelope
- blocked boundaries
- MCP/tools/skills availability
- token/context budget, future
- compact status, future

Minimum validation:

- rtk git diff --check

### Task 8: roadmap update and next route recommendation

Create docs/design/context-engineering-roadmap.md if useful, or include roadmap section in the baseline doc.

Update docs/design/edit-capability-roadmap.md lightly:

- mark edit capability as closeout-candidate and transition to context engineering phase
- link to context engineering baseline
- do not reopen edit scope unless a targeted blocker appears

Recommended next route should be one of:

1. Route 75: Compact v2 route continuity
   - if context baseline is complete and current compact risks losing route/edit/recovery facts

2. Route 75: Context state projection into session surface
   - if pure model exists but runtime/session surfaces cannot access it

3. Route 75: Project memory candidate extraction
   - if compact baseline is already strong enough

4. Route 75: Startup warm context cache
   - if local startup experience is the priority

Prefer Route 75: Compact v2 route continuity unless audit shows compact is not the immediate risk.

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of pure context baseline:

- edit capability runtime behavior
- restore command behavior
- recovery authority behavior
- compact runtime behavior
- session runtime behavior
- CLI behavior
- provider/MCP behavior
- package scripts
- default gates
- memory persistence absence
- startup cache absence
- sidebar UI absence

## Success criteria

Route is complete if:

- context engineering baseline design doc exists
- bounded reference scan is summarized
- local context/session/compact audit is documented
- context layer taxonomy exists
- continuity anchors are defined
- compact survival policy is defined
- future memory candidate policy is defined
- startup warmup candidate policy is defined
- sidebar state candidate policy is defined
- edit capability state and recovery/restore state are included in context model
- pure context helper/manifest exists and is tested, or code is explicitly deferred with rationale
- roadmap transitions from edit closeout to context engineering
- no runtime compact/session/memory/sidebar behavior is changed unless explicitly pure and tested
- verify:edit-capability-closeout still passes
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- context helper requires runtime session rewrite
- compact survival policy requires large compact rewrite
- memory candidate policy turns into persistent memory implementation
- startup warmup policy turns into cache implementation
- sidebar candidate policy turns into UI implementation
- SessionManager persistence changes become necessary
- provider/MCP changes become necessary
- package script changes become necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Local context/session/compact audit summary
5. Context layers defined
6. Continuity anchors defined
7. Compact survival policy summary
8. Memory candidate policy summary
9. Startup warmup candidate policy summary
10. Sidebar candidate policy summary
11. Pure helper/manifest status
12. Tests covered
13. Files changed
14. Forbidden files touched? yes/no
15. Runtime behavior changed? yes/no
16. Compact behavior changed? yes/no
17. Memory persistence added? yes/no
18. Startup cache added? yes/no
19. Sidebar UI added? yes/no
20. Edit closeout verifier validation
21. Final validation
22. Residue cleanup
23. Residual risks
24. Next recommended route
25. Proposed commit message

Do not commit or push.
