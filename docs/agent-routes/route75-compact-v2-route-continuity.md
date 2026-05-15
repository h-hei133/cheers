# Route 75: Compact v2 route continuity and handoff packet

## Objective

Implement Compact v2 route continuity on top of the Route 74 context engineering baseline.

Route 74 added:

- context layer model
- continuity manifest
- compact-safe context state projection
- edit/recovery/mutation evidence projection
- redaction and continuity tests

Route 75 should now make that baseline operational for compact and session handoff.

This route should implement:

- a structured compact continuity packet
- route/task handoff projection
- compact-safe markdown handoff rendering
- redaction and survivability enforcement
- integration with existing compact/session summary surfaces where clean
- tests proving edit closeout, mutation evidence, recovery references, validation evidence, and route constraints survive compact
- documentation that defines Compact v2 semantics and future memory/sidebar/startup hooks

This route must not implement a full memory system, sidebar UI, startup cache, provider/MCP changes, broad session lifecycle rewrite, SessionManager persistence schema changes, automatic recovery, atomic rollback, or edit runtime changes.

## Current state

Build on the current working tree. Do not reset Route 57-74 changes.

Current completed phases:

- Edit capability is closeout-candidate.
- Context engineering baseline exists.
- Context layer model exists under packages/ts-shell/src/core/context.
- Continuity manifest exists.
- Context state projection exists.
- Edit/recovery/mutation facts can be projected safely.

Current known next need:

- Compact must preserve route continuity, not just shorten text.
- New-session handoff should be structured, copyable, and machine-checkable.
- Compact should preserve supported/blocked edit capability facts.
- Compact should preserve recovery references without raw recovery content.
- Compact should preserve validation and next action.

## Reference scan first

Do a bounded compact/session/handoff scan before code edits.

Primary references:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- ClaudeCode: inspect at most 7 directly relevant files
- opencode: inspect at most 5 directly relevant files
- gemini-cli: inspect at most 5 directly relevant files
- total external files: at most 17
- exceed by at most 2 files only if a direct compact/handoff/session-summary file is clearly useful
- do not copy implementation code verbatim
- record architecture patterns and implications only

Search focus:

ClaudeCode:

- compact
- summarize
- conversation
- resume
- session
- todo
- file history
- tool result

opencode:

- session
- summary
- compact
- context
- snapshot
- revert
- command
- tool result

gemini-cli:

- compact
- compression
- memory
- checkpoint
- restore
- session
- context
- summarize

The scan should answer:

1. What facts survive compact/resume?
2. How are tool results summarized versus structured?
3. How are file edits / restore / checkpoint facts preserved?
4. How are user goals and constraints kept across continuation?
5. What local Compact v2 packet should this project implement?

Record findings in docs/design/compact-v2-route-continuity.md.

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

- rtk npm run test -w packages/ts-shell -- src/core/context
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If you touch session/compact runtime files, also run the focused tests for exactly those touched files.

If focused src/core/session/shell suites include unrelated existing failures, narrow to touched tests and document unrelated failures. Do not fix unrelated failures unless caused by Route 75.

Do not run provider/default/MCP gates.

## Read first

Context baseline:

- docs/design/context-engineering-continuity-baseline.md
- packages/ts-shell/src/core/context/contextLayerModel.ts
- packages/ts-shell/src/core/context/contextContinuityManifest.ts
- packages/ts-shell/src/core/context/contextStateProjection.ts
- tests under packages/ts-shell/src/core/context

Edit/recovery closeout:

- docs/design/edit-capability-roadmap.md
- docs/design/edit-capability-closeout-seal.md
- packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts
- packages/ts-shell/src/orchestration/patchResult/editCapabilityReadiness.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts
- scripts/verify-edit-capability-closeout.mjs

Session/compact candidates:

- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/session/sessionStateSurface.ts
- packages/ts-shell/src/session/*
- packages/ts-shell/src/core/*
- any existing compact/context/resume/session-summary modules found by search
- existing tests for touched modules

Do not touch cli.tsx unless a blocker is reported first.

## Allowed scope

Allowed:

- docs/design/compact-v2-route-continuity.md
- docs/design/context-engineering-continuity-baseline.md, Route 75 note only
- docs/design/edit-capability-roadmap.md, concise Route 75 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/session/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- this route spec

Preferred new files:

- packages/ts-shell/src/core/context/compactContinuityPacket.ts
- packages/ts-shell/src/core/context/routeContinuityHandoff.ts
- packages/ts-shell/src/core/context/compactHandoffRenderer.ts
- packages/ts-shell/src/core/context/compactRedactionPolicy.ts

Conditionally allowed:

- narrow integration into existing compact/session summary surface if clean
- no broad lifecycle rewrite

Forbidden unless a blocker is reported first:

- full memory system
- persistent memory storage
- sidebar UI
- startup cache implementation
- provider behavior changes
- MCP behavior changes
- package scripts
- default gates
- SessionManager persistence schema changes
- broad compact rewrite
- broad session lifecycle rewrite
- edit runtime behavior changes
- automatic recovery
- atomic rollback
- raw recovery content persistence
- secret persistence

## Batched tasks

### Task 1: Compact v2 design note

Create docs/design/compact-v2-route-continuity.md.

Include:

- post-Route 74 baseline
- bounded reference scan summary
- Compact v1/current compact audit
- Compact v2 objectives
- compact continuity packet model
- route handoff model
- compact-safe markdown rendering
- redaction policy
- edit capability survivability
- mutation evidence survivability
- recovery/restore survivability
- validation evidence survivability
- memory candidate boundary
- sidebar/startup future hooks
- non-goals
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: audit current compact/session continuity

Audit existing compact, session summary, resume, and state surface implementation.

Document findings in the design note.

The audit should answer:

- is there already a compact summary path?
- is compact structured or natural-language only?
- what facts are currently lost on compact?
- what session state survives continuation?
- where mutation evidence is summarized?
- where recovery/restore facts appear?
- where user constraints are preserved?
- where future memory extraction could hook in?
- where sidebar/startup could consume state later?
- what must not be implemented in Route 75?

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: add compact continuity packet model

Add a typed compact packet.

Preferred file:

- packages/ts-shell/src/core/context/compactContinuityPacket.ts

Required concepts:

- packetVersion
- generatedAt
- source:
  - compact
  - session-handoff
  - route-handoff
  - manual-export
- taskGoal
- route:
  - routeId/name
  - objective
  - currentPhase
  - nextAction
  - stopConditions
  - forbiddenScope
- project:
  - projectRoot, optional and redacted if unsafe
  - branch/base, optional
  - repository hints, optional
- editCapability:
  - closeout status
  - supported envelope
  - blocked-by-design envelope
  - default/non-default distinctions
- mutationEvidence:
  - plannedFiles
  - changedFiles
  - failedFiles
  - postWriteVerification summary
  - writer flags summary
- recovery:
  - restoreAvailable
  - restorePreviewAvailable
  - restoreExecuteExplicitOnly
  - recoveryAuthorityReferences
  - blocked reasons
  - no raw content
- validation:
  - tests run
  - verifier status
  - build/result-contract status
- context:
  - compactSurvivorFacts
  - memoryCandidates
  - sidebarFacts
  - startupWarmCandidates
- redactions
- warnings
- evidence

The model must be pure. It must not persist data.

Minimum validation:

- focused compactContinuityPacket tests if helper logic exists
- rtk git diff --check

### Task 4: add redaction policy for compact packets

Add redaction helper.

Preferred file:

- packages/ts-shell/src/core/context/compactRedactionPolicy.ts

Required behavior:

- exclude raw original content
- exclude raw recovery authority content
- exclude secrets and provider credentials
- exclude hidden chain-of-thought
- exclude full command output unless summarized
- allow recovery authority ids / route ids / record refs only as references
- allow file paths if project-safe
- mark redactions in packet.redactions
- produce warnings for unsafe inputs

Tests should prove:

- raw content field is removed
- secret-sensitive field is redacted
- recovery content blob is not included
- references survive
- blocked-by-design capability facts survive
- redaction is deterministic

Minimum validation:

- focused compactRedactionPolicy tests
- rtk git diff --check

### Task 5: add route continuity handoff builder

Add a handoff builder.

Preferred file:

- packages/ts-shell/src/core/context/routeContinuityHandoff.ts

The builder should consume:

- contextStateProjection output
- compactContinuityManifest
- optional task/route metadata
- optional validation status
- optional edit closeout readiness
- optional recovery surface summary

It should produce a CompactContinuityPacket.

Required behavior:

- edit closeout facts survive
- blocked-by-design facts survive
- mutation evidence survives
- recovery references survive without raw content
- validation evidence survives
- next action is preserved
- warnings are produced for missing critical facts
- no automatic recovery / atomic rollback implication
- deterministic output

Minimum validation:

- focused routeContinuityHandoff tests
- rtk git diff --check

### Task 6: add compact handoff markdown renderer

Add a renderer for user-copyable compact handoff.

Preferred file:

- packages/ts-shell/src/core/context/compactHandoffRenderer.ts

Output should be concise but complete.

Required sections:

- Current task / route
- Project state
- Supported edit capability envelope
- Blocked-by-design capabilities
- Mutation evidence
- Recovery / restore state
- Validation evidence
- Constraints / forbidden scope
- Next action
- Redactions / warnings

Renderer must:

- not include raw original content
- not include secrets
- not include hidden chain-of-thought
- not imply automatic recovery
- not imply atomic rollback
- clearly separate supported, non-default, and blocked capabilities
- be stable enough for tests

Minimum validation:

- focused compactHandoffRenderer tests
- rtk git diff --check

### Task 7: integrate with context state projection

Update contextStateProjection or add adapters so the Compact v2 packet can be built from existing Route 74 projection.

Required behavior:

- contextStateProjection remains compact-safe
- compact packet builder reuses projection rather than duplicating logic
- editCapabilityCloseoutManifest / editCapabilityReadiness can be included
- recoverySurfaceProjection can be included
- mutation evidence can be included
- redaction is applied after aggregation
- memory candidates and sidebar facts stay labeled, not implemented as storage/UI

Minimum validation:

- focused context projection / handoff tests
- rtk git diff --check

### Task 8: optional narrow session/compact integration

If clean, expose Compact v2 handoff through existing session/compact summary path.

Preferred behavior:

- no new CLI parser
- no broad lifecycle rewrite
- add a pure formatter invocation where compact/session summary already exists
- output can include Compact v2 handoff markdown or structured packet
- default runtime behavior should remain unchanged unless compact is explicitly invoked
- no persistence schema changes

If integration is coupled, defer and document:

- core Compact v2 packet and renderer exist
- future Route 76 can wire it into actual compact command/session lifecycle

Minimum validation:

- focused session/compact tests if touched
- rtk git diff --check

### Task 9: compact continuity regression tests

Add tests proving compact packet/handoff preserves critical facts.

Required tests:

1. Edit capability survives:
   - cap 32
   - bounded safe patch supported
   - fenced diff supported
   - arbitrary broad blocked
   - fuzzy blocked
   - automatic recovery blocked
   - atomic rollback blocked

2. Mutation evidence survives:
   - plannedFiles
   - changedFiles
   - failedFiles
   - postWriteVerification
   - writer flags

3. Recovery state survives safely:
   - restore preview available
   - restore execute explicit-only
   - recovery authority id/reference preserved
   - raw original content excluded
   - current-content guard summary preserved

4. Route constraints survive:
   - forbidden files/scope
   - stop conditions
   - next action
   - validation status

5. Redaction:
   - secrets excluded
   - raw command output summarized or excluded
   - raw recovery content excluded

6. Markdown handoff:
   - contains the necessary sections
   - does not contain raw sensitive content
   - clearly separates supported/non-default/blocked

Minimum validation:

- focused core/context tests
- rtk git diff --check

### Task 10: roadmap update

Update docs/design/compact-v2-route-continuity.md with final implementation notes:

- modules added
- packet shape
- redaction policy
- renderer behavior
- session integration status
- tests covered
- residual risks
- next recommendation

Update docs/design/context-engineering-continuity-baseline.md with Route 75 note.

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route 75 as Compact v2 route continuity implemented
- keep edit closeout candidate status
- recommend next route

Recommended next route should be one of:

1. Route 76: Compact v2 session integration
   - if core packet exists but session/compact integration was deferred

2. Route 76: Project memory candidate extraction
   - if compact packet is stable enough to feed memory candidates

3. Route 76: Startup warm context cache
   - if packet/renderer can seed startup context

4. Route 76: Sidebar state model
   - if sidebarFacts are strong enough

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of compact handoff:

- edit runtime behavior
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
- full memory behavior
- sidebar UI
- startup cache

New compact paths may:

- summarize edit capability state
- summarize mutation evidence
- summarize recovery/restore availability
- preserve route constraints
- mark memory candidates
- mark sidebar facts
- render compact-safe markdown handoff

New compact paths must not:

- persist data
- store raw original content
- expose secrets
- alter runtime write behavior
- imply automatic recovery
- imply atomic rollback
- discover MCP/tools/skills dynamically unless already available via input

## Success criteria

Route is complete if:

- Compact v2 design note exists
- bounded reference scan is summarized
- current compact/session audit is documented
- compact continuity packet model exists
- redaction policy exists and is tested
- route continuity handoff builder exists and is tested
- compact handoff markdown renderer exists and is tested
- context projection integrates with compact packet
- optional session/compact integration is implemented or explicitly deferred
- compact continuity tests prove edit/recovery/mutation/validation facts survive
- raw recovery content and secrets are excluded
- memory candidates/sidebar facts/startup candidates remain labels, not full implementations
- edit closeout verifier still passes
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- compact packet requires full compact rewrite
- session integration requires broad lifecycle rewrite
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
4. Current compact/session audit summary
5. Compact packet model status
6. Redaction policy status
7. Route handoff builder status
8. Markdown renderer status
9. Context projection integration status
10. Optional session/compact integration status
11. Continuity tests covered
12. Files changed
13. Forbidden files touched? yes/no
14. Edit runtime behavior changed? yes/no
15. Provider/MCP behavior changed? yes/no
16. Package scripts/default gates changed? yes/no
17. Raw content/secrets persisted? yes/no
18. Memory system implemented? yes/no
19. Sidebar UI implemented? yes/no
20. Startup cache implemented? yes/no
21. Focused validation
22. Edit closeout verifier validation
23. Final validation
24. Residue cleanup
25. Residual risks
26. Next recommended route
27. Proposed commit message

Do not commit or push.
