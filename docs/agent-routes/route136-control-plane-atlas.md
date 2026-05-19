# Route 136: Control-plane module atlas

## Goal

Build a practical control-plane module atlas across the current central files, then extract small projection-only seams where safe.

Route 131 established that modules are responsibility boundaries, not folders.
Route 135 proved that a large central script can be decomposed behind a compatibility entrypoint without behavior drift.

Route 136 should be more aggressive than the module backlog: combine the planned Agent Loop, CLI, Session, Policy, and Result ledgers into one control-plane atlas, then make only low-risk projection/helper extractions.

This route owns:

- `runMvpIntegratedFlow.ts` responsibility ledger
- `SessionManager.ts` projection / codec / replay boundary map
- `cli.tsx` entrypoint responsibility ledger
- permission / policy contract inventory
- result surface ownership map
- cross-file coupling map
- projection-only extraction candidates
- small behavior-preserving helper extraction if clearly safe

This is not a rewrite route.

## Expected outcome

By the end of Route 136:

1. The project has one control-plane atlas covering agent loop, CLI, session, policy, and result responsibilities.
2. The largest central files have responsibility ledgers based on actual code, not assumptions.
3. Cross-layer concentration points are explicitly named.
4. Capability lifecycle gaps are mapped against current implementation.
5. Safe projection-only seams are identified.
6. At least one small no-behavior-change extraction is completed if it is obviously safe.
7. Validation proves no behavior drift.
8. The next 3-5 routes are rewritten into a more aggressive, implementation-ready roadmap.

## Required Route 131 / 135 inputs

Read:

- `docs/architecture/module-atlas.md`
- `docs/architecture/capability-contract.md`
- `docs/architecture/reference-architecture-maps.md`
- `docs/architecture/reference-module-matrix.md`
- `docs/architecture/module-backlog.md`
- `docs/design/verifier-decomposition.md`

Use these as constraints.

## Reference scan

Use references only for control-plane boundaries.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 8 files
- opencode: max 10 files
- OpenHands: max 8 files
- gemini-cli: max 8 files
- Inspect AI + mini-swe-agent: max 6 files total

Focus:

- query / turn loop ownership
- tool execution context
- session / transcript / compact / replay boundary
- CLI/core split
- permission and approval boundaries
- result projection and terminal surface
- event / observation modeling

Do not re-read browser internals unless they are needed as an example of capability lifecycle alignment.

## Files

Likely docs:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/session-manager-boundary.md`
- `docs/architecture/cli-boundary.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/module-backlog.md`

Likely source files to inspect:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/entrypoints/cli.tsx`
- result mapper / session runtime files
- permission / policy files
- tool registry / tool runner files

Allowed source changes:

- small projection-only helper extraction
- small type/helper movement
- no behavior change
- no schema change
- no CLI behavior change
- no provider/model behavior change

Avoid renaming major files.

## Implementation tasks

### 1. Build the control-plane atlas

Create `docs/architecture/control-plane-atlas.md`.

Cover these responsibility modules:

- Agent Loop
- Tool
- Permission / Policy
- Runtime
- Result Surface
- Session / Continue
- CLI / UX
- Provider / Model
- Browser as a lifecycle example
- Edit / Patch as a lifecycle example
- Harness / Eval as gate owner

For each module, document:

- current owner files
- current mixed responsibilities
- capability lifecycle coverage
- missing boundary
- safe extraction candidates
- unsafe refactor areas

### 2. Agent loop ledger

Create `docs/architecture/run-mvp-ledger.md`.

Classify responsibilities inside `runMvpIntegratedFlow.ts`:

- prompt classification
- tool planning
- capability dispatch
- browser transaction integration
- edit/patch flow
- provider/model readiness
- permission/policy gating
- result construction
- transcript/evidence handoff
- verification / fallback paths

Identify projection-only candidates.

Do not refactor the main loop unless the extraction is tiny and fully covered.

### 3. Session boundary map

Create `docs/architecture/session-manager-boundary.md`.

Map `SessionManager.ts` into:

- persistence
- codecs
- projections
- compact/checkpoint
- transcript/event construction
- continue/replay evidence
- current-session state
- CLI-facing summaries

Identify pure helper candidates.

No schema change.

### 4. CLI boundary map

Create `docs/architecture/cli-boundary.md`.

Map `cli.tsx` into:

- argument parsing
- command routing
- interactive shell
- print mode
- slash command bridge
- session selection
- result rendering
- compatibility behavior

Identify future CLI/core split candidates.

No CLI behavior change.

### 5. Policy and result boundary map

Create `docs/architecture/policy-result-boundary.md`.

Map:

- approval states
- workspace/file authority
- provider opt-in
- browser policy
- command allowlist
- MCP policy
- result success/stopped/error mapping
- terminal user-facing surface
- evidence handoff

Identify duplicated or divergent result semantics.

### 6. Projection-only extraction

After the ledgers, choose at most one or two safe extractions.

Allowed examples:

- result summary projector
- transcript evidence projector
- policy reason normalizer
- CLI display helper
- session summary codec helper

Rules:

- no behavior change
- no schema change
- focused tests required
- if risk is unclear, document candidate only and do not extract

### 7. Update module backlog aggressively

Update `docs/architecture/module-backlog.md`.

Replace the overly conservative ordering with fewer, larger follow-up routes.

Suggested next route families:

- Route 137: Agent loop projection extraction
- Route 138: Session codec and continuation seam extraction
- Route 139: Tool/policy/result contract unification
- Route 140: CLI/core split preparation
- Route 141: Capability lifecycle adoption across edit/browser/shell

Keep the backlog practical and implementation-oriented.

### 8. Validation

Run validation based on touched files.

Required:

- focused tests for any extracted helper
- existing tests for touched module area
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If no source changes are made, run doc/diff/build plus the two verifier gates.

Do not run broad unrelated suites.

## Boundaries

Hard boundaries:

- no product behavior changes
- no provider/model live calls
- no browser feature expansion
- no edit/patch feature expansion
- no SessionManager schema changes
- no CLI UX redesign
- no broad runMvpIntegratedFlow refactor
- no package dependency changes
- no route that only produces vague architecture prose
- no commit or push

## Final report

Include:

1. What changed
2. Control-plane atlas summary
3. runMvpIntegratedFlow responsibility ledger
4. SessionManager boundary map
5. CLI boundary map
6. Policy/result boundary map
7. Any projection-only extraction completed
8. Validation
9. Remaining risks
10. Revised next-route recommendation
11. Proposed commit message

Do not commit or push.
