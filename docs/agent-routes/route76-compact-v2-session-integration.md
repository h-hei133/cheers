# Route 76: Compact v2 session integration and handoff command

## Goal

Make Compact v2 usable from the session/command surface.

Route 74 created the context engineering baseline. Route 75 added Compact v2 packet, redaction, handoff builder, and markdown renderer, but explicitly deferred runtime/session integration.

Route 76 should connect that core to a real user-operable path:

- add a Compact v2 command contract
- add a Compact v2 command runner
- add a session-facing formatter
- register `/compact` or `/handoff` if the existing command registry makes it clean
- render compact-safe markdown handoff with structured packet data
- preserve redaction, edit closeout facts, mutation evidence, recovery references, validation status, constraints, and next action
- keep memory/sidebar/startup/provider/MCP/package/default-gate/schema work out of scope

This is not docs-only.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-route-continuity.md
- docs/design/edit-capability-roadmap.md
- Route 75 Compact v2 core modules under packages/ts-shell/src/core/context

Current phase baseline:

- edit capability is closeout-candidate
- Compact v2 core packet/rendering exists
- session/compact runtime integration is deferred
- no memory system, sidebar UI, startup cache, or SessionManager schema change exists yet

## Reference scan

Do a bounded scan before code edits.

Reference repos:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- 12 files total by default
- may exceed by 2 only for a direct compact/session command integration file

Search focus:

- compact
- handoff
- session
- command
- slash command
- summary
- context
- resume
- tool result

Answer in docs/design/compact-v2-session-integration.md:

1. How do references expose compact/session handoff?
2. Is compact triggered by command, threshold, resume flow, or session lifecycle?
3. What is user-visible versus structured internal state?
4. How do they avoid persisting raw tool/file/recovery content?
5. What is the smallest local equivalent using this project’s existing command/session system?

## This route changes

Allowed:

- docs/design/compact-v2-session-integration.md
- docs/design/compact-v2-route-continuity.md, Route 76 note only
- docs/design/context-engineering-continuity-baseline.md, Route 76 note only
- docs/design/edit-capability-roadmap.md, concise Route 76 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/compactCommandContract.ts
- packages/ts-shell/src/core/context/compactCommandRunner.ts
- packages/ts-shell/src/core/context/compactSessionSurface.ts

Allowed if clean:

- register `/compact` or `/handoff` through the existing command registry
- add a pure command handler reachable from session runtime
- add JSON/structured output only if existing command result conventions support it

## This route must preserve

Route-specific boundaries:

- no memory system
- no persistent memory storage
- no sidebar UI
- no startup cache
- no provider/MCP behavior changes
- no package script/default gate changes
- no SessionManager persistence schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw recovery content, raw original content, secrets, provider credentials, or hidden reasoning in compact output
- no broad cli.tsx rewrite; inspect cli.tsx only if necessary

## Tasks

### 1. Design and audit

Create docs/design/compact-v2-session-integration.md.

Include:

- reference scan summary
- current command/session audit
- how Route 66 `/restore` command is registered and rendered
- whether `/compact` or `/handoff` can be added without cli.tsx
- command contract decision
- runner design
- session-facing formatter design
- redaction and safety guarantees
- integration status and deferred work

### 2. Add Compact v2 command contract

Add packages/ts-shell/src/core/context/compactCommandContract.ts.

Expected concepts:

- mode: "preview" | "render" | "json"
- source: "session" | "route" | "manual"
- optional taskGoal / routeInfo / projectInfo
- optional mutationEvidence / recoverySummary / validationEvidence
- includeMarkdown
- includeJson

Required behavior:

- default is render/preview-only
- validates incompatible flags
- rejects or redacts raw content fields
- never persists
- never calls provider/model
- separates packet from rendered markdown

Add focused tests.

### 3. Add Compact v2 command runner

Add packages/ts-shell/src/core/context/compactCommandRunner.ts.

Runner should:

- consume the command contract
- build or adapt contextStateProjection inputs
- build Compact v2 route continuity packet
- apply redaction
- render markdown handoff
- optionally return structured packet
- emit warnings for missing critical facts
- never persist
- never call provider/model
- never imply memory write
- never imply automatic recovery or atomic rollback

Add focused tests.

### 4. Add session-facing formatter

Add packages/ts-shell/src/core/context/compactSessionSurface.ts.

Formatter should produce user-facing output with:

- Compact v2 handoff generated
- current task / route
- edit capability status
- mutation evidence
- recovery / restore state
- validation status
- redactions / warnings
- next action

It must not include raw content or secrets.

Add focused tests.

### 5. Register `/compact` or `/handoff` if clean

Use the existing command registry / slash command path if clean.

Preferred:

- register `/compact`
- default renders markdown preview
- optional JSON mode only if existing parser patterns support it
- no mutating mode
- no provider/model call
- no persistence

If registration is coupled:

- keep compactCommandRunner fully implemented and tested
- document the blocker
- recommend a follow-up command polish route

### 6. Wire session rendering if clean

If sessionRuntime or sessionStateSurface can render command output narrowly:

- render compact handoff summary for explicit compact command results
- do not change unrelated session output
- do not alter lifecycle or persistence

If too coupled:

- keep compactSessionSurface tested
- document runtime integration blocker

### 7. Add integration tests

Required tests:

- command preview builds packet and markdown
- output includes edit closeout facts
- output includes mutation evidence when provided
- output includes recovery references safely
- restore execute remains explicit-only
- secrets/raw content are redacted
- markdown contains required sections
- command registration works if implemented
- invalid args are rejected
- no persistence side effect

### 8. Update docs and roadmap

Update:

- docs/design/compact-v2-session-integration.md with final implementation notes
- docs/design/compact-v2-route-continuity.md with Route 76 note
- docs/design/context-engineering-continuity-baseline.md with Route 76 note
- docs/design/edit-capability-roadmap.md with concise status and next recommendation

Recommended next route should be one of:

- Project memory candidate extraction
- Compact command polish if registration/rendering was deferred
- Sidebar state model
- Startup warm context cache

## Validation

Use docs/agent-routes/COMMON_BOUNDARIES.md validation discipline.

Route-specific final validation:

- focused tests for touched core/context command/session modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad `src/core/shell` or `src/session` paths expose unrelated existing failures, narrow to touched tests and document the unrelated failures.

## Stop conditions

Stop and report if:

- command integration requires broad cli.tsx rewrite
- session integration requires broad lifecycle rewrite
- SessionManager schema changes become necessary
- memory implementation becomes necessary
- sidebar UI becomes necessary
- startup cache implementation becomes necessary
- provider/MCP changes become necessary
- edit runtime behavior changes become necessary
- raw content or secrets would need to be persisted

## Final report

1. What changed
2. Reference scan summary
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.
