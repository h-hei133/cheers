# Route 158: CLI / UX - cli.tsx module facade extraction

## Module

- Primary module: CLI / UX Engineering
- Secondary modules:
  - Session / Continue Engineering
  - Permission / Policy Engineering
  - Provider / Model Engineering
  - Agent Loop Engineering
  - Result Surface Engineering
  - Workspace / File Context Engineering
  - Harness / Eval Engineering
- Capability: `cli.tsx` owner-module facade extraction
- Cross-module inputs:
  - Route 153 CLI projection helpers
  - Route 156 sessionRuntime facades
  - Route 157 SessionManager facades
  - approval prompt bridge and approval trust policy
  - provider readiness / credential snapshot
  - slash command registry
  - session command surfaces
  - CLI mode dispatch and runtime invocation helpers
- Cross-module outputs:
  - `cli.tsx` responsibility migration table
  - module-owned CLI facades for mode bootstrap, session commands, approval surface, provider/workspace startup, and slash-command action handoff
  - updated `control-plane-atlas.md`
  - focused CLI boundary tests
  - preserved CLI compatibility behavior
- Product behavior boundary:
  - behavior-preserving extraction only
  - no CLI flag/mode/output semantic changes
  - no provider/auth behavior changes
  - no session schema or selection behavior changes
  - no approval behavior changes
  - no runtime execution behavior changes
- Stop conditions:
  - extraction requires changing CLI UX
  - extraction requires changing provider/auth/default gates
  - extraction requires changing approval or session semantics
  - extraction requires changing runtime invocation behavior
  - extraction becomes a broad entrypoint rewrite instead of module facade migration
- Capability lifecycle stage(s):
  - availability: CLI startup, workspace, provider, session availability facts
  - policy: approval/non-interactive policy facts only; no new policy decision
  - planning: CLI mode/startup/session command planning
  - execution: invoke existing runtime helpers unchanged
  - observation: CLI display/session/provider diagnostics
  - evidence: safe startup/session/provider/approval evidence summaries
  - result mapping: preserve result/session rendering semantics
  - transcript: no transcript format change
  - continue / replay: preserve resume/current-session behavior
  - eval: focused CLI boundary tests plus affected CLI suites
  - report: update migration doc and atlas
  - cleanup: no new cleanup behavior
  - redaction: no provider secrets/config paths in CLI diagnostics

## Goal

Run the owner-module extraction pass for `cli.tsx`.

Route 153 prepared CLI/core split by extracting projection helpers. Route 158 should now reduce `cli.tsx` as a central control-plane file by moving coherent responsibilities behind module-owned CLI facades.

`cli.tsx` should remain the CLI entrypoint composition root. It may parse top-level process intent and call module facades, but it should not directly own session command internals, provider readiness display logic, approval surface wiring details, slash-command action logic, or runtime invocation payload construction.

This route is successful when:

- [ ] `docs/architecture/cli-module-extraction.md` records a responsibility migration table before code motion
- [ ] at least three coherent CLI responsibility families are moved or consolidated behind module-owned facades
- [ ] `cli.tsx` keeps entrypoint ordering and compatibility behavior, but loses module-specific detail
- [ ] facades expose stable module entrypoints instead of loose helper fragments
- [ ] focused CLI tests cover facade boundaries
- [ ] stale CLI test ownership assumptions are checked and updated only when behavior is unchanged
- [ ] `control-plane-atlas.md` is updated with CLI ownership and the next central file recommendation
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it only adds helper fragments without module facade ownership
- [ ] it changes CLI flags, modes, output semantics, or compatibility behavior
- [ ] it changes approval, session, provider, runtime, or result behavior
- [ ] it changes package scripts or dependencies
- [ ] it performs a broad `cli.tsx` rewrite
- [ ] it skips the migration table or atlas update

## References

Target project evidence:

- `docs/architecture/sessionmanager-module-extraction.md`
- `docs/architecture/cli-core-split-prep.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/session-runtime-module-extraction.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/agent-routes/module-route-template.md`

Reference projects to inspect:

- gemini-cli:
  - CLI/core split
  - mode startup and command routing
  - config/provider startup surface
- ClaudeCode:
  - CLI session/permission entrypoint shape
  - query/runtime invocation boundary
- opencode:
  - command routing
  - session processor and permission boundary
- OpenHands:
  - app/server command boundary and event runtime separation if relevant
- mini-swe-agent:
  - minimal CLI-to-agent handoff

Reference budget:

- gemini-cli: max 10 files
- ClaudeCode: max 8 files
- opencode: max 8 files
- OpenHands + mini-swe-agent: max 8 files total
- Stop reference reading once CLI entrypoint composition, session command, approval, and runtime invocation boundary patterns are clear.

Do not inspect browser/edit/provider internals beyond CLI-facing readiness or command surfaces.

## Current Project Surfaces

Primary file:

- `packages/ts-shell/src/entrypoints/cli.tsx`

Likely related surfaces:

- `packages/ts-shell/src/entrypoints/cliArgs.ts`
- `packages/ts-shell/src/entrypoints/cliModeDispatch.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- `packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts`
- `packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts`
- `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- `packages/ts-shell/src/entrypoints/approvalPromptBridge.ts`
- `packages/ts-shell/src/entrypoints/cliStartupPlan.ts`
- `packages/ts-shell/src/entrypoints/cliProviderProjection.ts`
- `packages/ts-shell/src/entrypoints/cliSessionProjection.ts`
- `packages/ts-shell/src/entrypoints/cliDisplayProjection.ts`
- `packages/ts-shell/src/core/commands/*`
- `packages/ts-shell/src/core/shell/providerReadiness.ts`
- `packages/ts-shell/src/session/*`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`

Likely new or consolidated facade files:

- `packages/ts-shell/src/entrypoints/cliBootstrapModule.ts`
- `packages/ts-shell/src/entrypoints/cliSessionModule.ts`
- `packages/ts-shell/src/entrypoints/cliApprovalModule.ts`
- `packages/ts-shell/src/entrypoints/cliProviderModule.ts`
- `packages/ts-shell/src/entrypoints/cliSlashModule.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeModule.ts`
- `packages/ts-shell/src/entrypoints/cliModuleBoundary.test.ts`
- `docs/architecture/cli-module-extraction.md`

Choose names based on actual ownership. Prefer cohesive facades over many tiny files.

## Allowed Changes

- Create module-owned facades for selected CLI responsibilities.
- Replace direct inline construction/wiring in `cli.tsx` with facade calls where behavior is identical.
- Consolidate Route 153 projection helpers behind stable facades.
- Update tests to target facade boundaries where appropriate.
- Update stale test names/comments that imply old ownership.
- Update `control-plane-atlas.md` and `module-backlog.md`.

## Explicit Non-Goals

Do not:

- change CLI flags or mode semantics
- change print/stdin/interactive behavior
- change slash command semantics
- change approval prompting or trust policy behavior
- change provider readiness/default opt-in behavior
- change session selection or schema behavior
- change runtime invocation behavior
- change result rendering semantics
- change package scripts or dependencies
- add real-provider reads
- perform broad entrypoint rewrite

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No real-provider config reads or secret printing.
- No browser capability expansion.
- No edit/patch capability expansion.
- No runtime execution expansion.
- No permission weakening.
- No result truthfulness changes.
- No session schema or transcript format changes.
- No CLI behavior changes.
- No package/dependency changes.
- No broad `cli.tsx` rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: central entrypoint facade extraction.
- Required:
  - focused CLI facade/boundary tests
  - adjacent CLI tests for touched surfaces
  - `cli-baseline.test.ts` if output/mode/session surfaces are touched
  - `runMvpIntegratedFlow.test.ts` if runtime invocation path is touched
  - `verify:result-contract` if result surface semantics are touched
  - build
  - diff/status
- Package sweep is optional, not default.
- Escalate to package sweep only if:
  - CLI flag/mode behavior changes
  - package scripts change
  - provider/default gate behavior changes
  - session behavior changes
  - broad CLI output expectations are rebaselined
  - focused/CLI gates reveal unexplained failures

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | startup/session/provider/workspace facts partly inline | facade-owned bootstrap facts | CLI facade tests |
| policy | approval/non-interactive policy wired in entrypoint | approval facade, no semantic change | approval bridge tests |
| planning | CLI mode dispatch helpers exist but cli.tsx still composes details | bootstrap/session/slash facade planning | CLI tests |
| execution | runtime invocation helpers exist | keep invocation behavior, facade construction only | runtime invocation tests |
| observation | CLI status/display text partly inline | display facades behind module entrypoints | cli-baseline/CLI tests |
| evidence | provider/session/workspace diagnostics inline | redacted diagnostics facade | redaction assertions |
| result mapping | result rendering outside CLI | no change unless display-only projection | result-contract if touched |
| transcript | sessionRuntime persists transcript | no change | none unless touched |
| continue / replay | CLI current/resume commands exist | session facade preserves behavior | session CLI tests |
| eval | CLI tests exist | focused boundary tests | validation output |
| report | no CLI migration ledger yet | add migration doc | docs |
| cleanup | no change | no change | none |
| redaction | provider secrets/config must not print | preserve via provider facade tests | redaction tests |

## Implementation Tasks

### 1. Create CLI responsibility migration document

Create `docs/architecture/cli-module-extraction.md`.

Before code changes, document a migration table.

Required columns:

- current code block / responsibility
- current owner file
- true owner module
- target facade or file
- migration decision:
  - extract now
  - facade existing helpers
  - leave in cli.tsx
  - defer
  - do not move
- reason
- validation required
- risk

### 2. Categorize cli.tsx responsibilities

Classify at least these families:

- argv parsing and compatibility flags
- mode dispatch
- print/stdin/interactive runner selection
- session create/resume/current/switch/list commands
- slash command bridge
- approval prompt bridge and non-interactive policy surface
- provider readiness snapshot and display
- workspace/project binding display
- runtime invocation construction
- result/status output handoff
- error/fallback display
- test-only deterministic CLI surfaces

Mark what belongs in `cli.tsx`:

- process entrypoint ordering
- calling CLI module facades
- top-level error boundary
- compatibility-preserving mode selection

Everything else should move behind a module facade or be explicitly deferred.

### 3. Extract CLI bootstrap facade

Candidate file:

- `cliBootstrapModule.ts`

Owner module:

- CLI / UX Engineering

Responsibilities:

- combine parsed args, mode, workspace, startup facts
- compose startup plan from Route 153 helpers
- expose one startup object to `cli.tsx`
- do not execute runtime or read provider secrets

### 4. Extract CLI session facade

Candidate file:

- `cliSessionModule.ts`

Owner modules:

- CLI / UX Engineering
- Session / Continue Engineering

Responsibilities:

- session current/switch/resume/list display facts
- session command output projection
- delegation to existing session selection APIs
- no session schema or selection behavior change

### 5. Extract CLI approval facade

Candidate file:

- `cliApprovalModule.ts`

Owner modules:

- CLI / UX Engineering
- Permission / Policy Engineering

Responsibilities:

- approval prompt bridge setup facts
- non-interactive approval summary
- permission list/empty-state display
- no approval policy behavior change

### 6. Extract CLI provider/workspace facade

Candidate files:

- `cliProviderModule.ts`
- optionally folded into `cliBootstrapModule.ts` if cohesive

Owner modules:

- CLI / UX Engineering
- Provider / Model Engineering
- Workspace / File Context Engineering

Responsibilities:

- provider readiness display summary
- synthetic/default mode label
- redacted real-provider opt-in facts
- workspace/project binding display facts
- no provider config read or default gate change

### 7. Extract slash/runtime facade

Candidate files:

- `cliSlashModule.ts`
- `cliRuntimeModule.ts`

Owner modules:

- CLI / UX Engineering
- Agent Loop Engineering

Responsibilities:

- slash command bridge action handoff
- runtime invocation payload projection
- print/stdin/interactive invocation setup
- no runtime invocation semantic change

If runtime invocation movement is risky, defer it and document the reason.

### 8. Replace cli.tsx inline construction

Update `cli.tsx`:

- keep top-level process entrypoint and mode ordering
- call facades for selected responsibilities
- avoid direct internal projection fragments when facade exists
- preserve output and behavior exactly

### 9. Tests and stale assumptions

Add `cliModuleBoundary.test.ts`.

Required coverage:

- bootstrap facade preserves print mode facts
- bootstrap facade preserves interactive mode facts
- session facade preserves current/switch/resume display facts
- approval facade preserves non-interactive and empty-state facts
- provider facade redacts config/secrets and preserves synthetic/default labels
- workspace display facts remain stable
- slash/runtime facade does not execute runtime during projection
- helper ownership boundaries are tested at facade level

Run affected CLI tests.

Update tests to import module facades where they are public boundaries. Keep pure helper tests only when they cover non-trivial logic.

### 10. Update docs

Update:

- `docs/architecture/cli-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

At the end, classify `cli.tsx` as one of:

- still requires another extraction route
- acceptable CLI entrypoint composition root
- should hand off to next central file

Recommend the next central file from the atlas:

- `resultMapper.ts`
- any remaining `cli.tsx` follow-up only if unavoidable

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModuleBoundary.test.ts`
- adjacent CLI tests for touched surfaces

Broader validation:

- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts` if output/mode/session surfaces are touched
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts` if runtime invocation is touched
- `rtk npm run verify:result-contract` if result output semantics are touched
- `rtk npm run build -w packages/ts-shell`

Repository hygiene:

- `rtk git diff --check`
- `rtk git status --short --branch`
- `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

Package sweep:

- Not required by default.
- Escalate only if Tier 3 escalation conditions are hit.

## Completion Audit

Before final response, map every deliverable to evidence:

| Requirement | Evidence | Status |
|---|---|---|
| CLI migration doc | `cli-module-extraction.md` | |
| at least three CLI facades | facade files | |
| cli.tsx inline responsibilities reduced | `cli.tsx` diff | |
| boundary tests | validation output | |
| behavior preserved | CLI/runMvp/build gates | |
| atlas updated | `control-plane-atlas.md` | |
| final classification | atlas + migration doc | |
| next central file recommended | atlas/backlog note | |
| no behavior expansion | final audit | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. cli.tsx responsibility migration summary
5. Module facades created or consolidated
6. What remains in cli.tsx
7. cli.tsx final classification
8. Next central file recommended by atlas
9. Validation tier used and why package sweep was or was not run
10. Validation commands and results
11. Real-provider gate status
12. External MCP status
13. Audit/history residue handling
14. Source/package change confirmation
15. Remaining risks
16. Best next action
17. Proposed commit message

Do not commit or push.
