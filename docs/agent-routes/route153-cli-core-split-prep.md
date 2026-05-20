# Route 153: CLI / UX - core split preparation

## Module

- Primary module: CLI / UX Engineering
- Secondary modules: Session / Continue Engineering, Agent Loop Engineering, Permission / Policy Engineering, Provider / Model Engineering, Result Surface Engineering
- Capability: CLI/core split preparation
- Cross-module inputs:
  - session bootstrap and current-session selection
  - prompt execution runtime invocation
  - approval bridge / non-interactive policy facts
  - provider readiness snapshot
  - slash command routing
  - result/session state surfaces
- Cross-module outputs:
  - CLI-owned startup plan
  - CLI runtime invocation boundary
  - CLI display/session diagnostics projection
  - focused CLI preservation tests
- Product behavior boundary:
  - prepare split boundaries without changing CLI behavior
  - no command-line compatibility break
  - no provider/auth behavior change
  - no session schema change
- Stop conditions:
  - any CLI UX behavior change becomes necessary
  - any provider/auth/default gate change becomes necessary
  - any session schema or transcript format change becomes necessary
  - broad entrypoint rewrite becomes necessary
- Capability lifecycle stage(s):
  - availability: CLI startup/runtime dependency facts
  - policy: consume approval/non-interactive policy, do not decide new policy
  - planning: CLI mode/startup plan projection
  - execution: invoke existing runtime path unchanged
  - observation: CLI display/status surfaces
  - evidence: startup/session/provider diagnostics
  - result mapping: preserve existing result rendering
  - transcript: no transcript schema change
  - continue / replay: preserve current session selection and resume behavior
  - eval: focused CLI and runMvp preservation tests
  - report: architecture closeout doc
  - cleanup: no new cleanup behavior
  - redaction: no provider secrets/config paths in diagnostics

## Goal

Prepare `cli.tsx` for a future CLI/core split by extracting safe startup, session, provider, approval, and display projections without changing CLI behavior.

Route 152 made `runMvpIntegratedFlow.ts` a better composition root by adding a turn-kernel seam. The next high-value control-plane file is `cli.tsx`, which still owns startup, argument/mode dispatch, session commands, approval bridge, workspace binding, provider snapshot, prompt execution, and display helpers.

This route should reduce CLI entrypoint coupling while preserving compatibility.

This route is successful when:

- [ ] CLI responsibilities are mapped against current code
- [ ] one or more safe CLI projection/preparation helpers are extracted
- [ ] CLI runtime invocation behavior remains unchanged
- [ ] session selection / switch / resume behavior remains unchanged
- [ ] provider readiness and approval bridge behavior remain unchanged
- [ ] focused CLI tests and runMvp preservation gates pass
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it redesigns CLI UX
- [ ] it changes flags, output, approval behavior, provider behavior, or session schema
- [ ] it moves runtime execution semantics into CLI helpers
- [ ] it hides behavior changes as “refactor”
- [ ] it performs a broad `cli.tsx` rewrite

## References

Target project evidence:

- `docs/architecture/module-roadmap-reset.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/runmvp-package-closeout.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/agent-loop-turn-kernel.md`

Reference projects to inspect:

- gemini-cli: CLI/core split and command startup boundary
- ClaudeCode: CLI command/session/permission surface
- opencode: session processor and command routing boundary
- OpenHands: app/server event and CLI/runtime separation if relevant
- mini-swe-agent: minimal CLI-to-agent handoff

Reference budget:

- gemini-cli: max 10 files
- ClaudeCode: max 8 files
- opencode: max 8 files
- OpenHands + mini-swe-agent: max 8 files total
- Stop reference reading once CLI startup, runtime invocation, and display/session boundary patterns are clear.

## Current Project Surfaces

Likely involved:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/entrypoints/cliArgs.ts`
- `packages/ts-shell/src/entrypoints/cliModeDispatch.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- `packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts`
- `packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts`
- `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- `packages/ts-shell/src/entrypoints/approvalPromptBridge.ts`
- `packages/ts-shell/src/core/commands/*`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionStateSurface.ts`
- session projection helpers from Route 145

Likely new files:

- `packages/ts-shell/src/entrypoints/cliStartupPlan.ts`
- `packages/ts-shell/src/entrypoints/cliSessionProjection.ts`
- `packages/ts-shell/src/entrypoints/cliProviderProjection.ts`
- `packages/ts-shell/src/entrypoints/cliDisplayProjection.ts`
- `packages/ts-shell/src/entrypoints/cliCoreSplit.test.ts`
- `docs/architecture/cli-core-split-prep.md`

Avoid broad entrypoint restructuring.

## Allowed Changes

- Extract pure CLI startup/session/provider/display projections.
- Replace inline object/text construction in `cli.tsx` where behavior is identical.
- Add focused CLI helper tests.
- Update architecture docs and module backlog.
- Update stale tests only if behavior remains unchanged and current surface is already validated.

## Explicit Non-Goals

Do not:

- change CLI flags or modes
- change print/stdin/interactive behavior
- change slash command semantics
- change approval prompting behavior
- change provider readiness/default opt-in behavior
- change session schema/current-session behavior
- change result rendering semantics
- change runMvp behavior
- add dependencies

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No real-provider config reads or secret printing.
- No browser/edit/runtime capability expansion.
- No permission weakening.
- No SessionManager schema or transcript format changes.
- No CLI UX redesign.
- No package/dependency changes.
- No broad `cli.tsx` rewrite.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 2 by default: CLI projection/preparation route.
- Escalate to Tier 3 if runtime invocation wiring is touched deeply.
- Required:
  - focused CLI helper tests
  - existing CLI/cli-baseline/slash tests affected by touched code
  - runMvp if runtime invocation path is touched
  - result-contract if result surface is touched
  - build
  - diff/status
- Package sweep is optional, not default.
- Escalate to package sweep only if CLI flags/modes, provider/default gates, session behavior, package scripts, or broad output expectations change.

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | CLI startup facts are inline | startup plan projection | helper tests |
| policy | approval bridge exists | consume, do not change | approval/CLI tests |
| planning | mode dispatch helpers exist, entrypoint still composes | CLI startup/session plan helpers | CLI tests |
| execution | CLI invokes existing runtime | no execution change | runMvp/CLI preservation |
| observation | CLI output surfaces inline | display projection helper | CLI snapshot/string tests |
| evidence | provider/session/workspace facts shown inline | safe diagnostics projection | redaction tests |
| result mapping | result rendering exists elsewhere | preserve rendering | result-contract if touched |
| transcript | session runtime persists transcript | no change | session tests if touched |
| continue / replay | current session/resume flows exist | preserve | CLI/session tests |
| eval | CLI tests and build exist | focused gates | validation output |
| report | add closeout doc | docs | docs |
| cleanup | no change | no change | none |
| redaction | provider secrets/config must not print | preserve via projection tests | redaction assertions |

## Implementation Tasks

### 1. CLI responsibility audit

Create `docs/architecture/cli-core-split-prep.md`.

Map `cli.tsx` current responsibilities:

- argument parsing
- mode dispatch
- print/stdin/interactive runtime invocation
- slash command bridge
- session create/resume/switch/current
- approval bridge
- non-interactive policy surface
- workspace binding
- provider readiness snapshot
- result/status rendering
- compatibility fallbacks

Mark each as:

- keep in entrypoint
- extract now
- extract later
- module-owned, do not duplicate

### 2. Extract startup plan projection

Add `cliStartupPlan.ts`.

It should project:

- requested mode
- prompt source
- session mode
- workspace/project binding summary
- approval mode summary
- provider readiness summary
- runtime invocation shape

It must not execute runtime or decide provider/auth.

### 3. Extract session projection

Add `cliSessionProjection.ts`.

It should project:

- current session summary
- session switch diagnostics
- resume/session-not-found message facts
- safe session status display facts

It must not change session selection or schema.

### 4. Extract provider display projection

Add `cliProviderProjection.ts` if safe.

It should project:

- synthetic/default mode
- real-provider opt-in status
- readiness status label
- missing configuration summary

It must not read provider secrets or change provider gates.

### 5. Extract display projection

Add `cliDisplayProjection.ts` if safe.

It should project small CLI display strings or facts for:

- permissions/status list
- startup diagnostics
- no-session/current-session messages
- workspace info

Only extract surfaces already covered by tests or simple enough to characterize.

### 6. Integrate high-value call sites

Replace inline construction in `cli.tsx` with helper calls where safe.

Do not move:

- top-level mode control flow
- runtime invocation semantics
- approval prompting behavior
- session file mutations
- provider credential loading

### 7. Tests

Add `cliCoreSplit.test.ts`.

Required coverage:

- startup plan projection for print mode
- startup plan projection for interactive mode
- session switch/current projection
- provider synthetic/default readiness projection
- real-provider opt-in label redacts secrets
- approval mode summary is stable
- display projection does not change known output facts
- helper projections do not execute runtime

Run affected existing CLI/slash/baseline tests.

### 8. Documentation and backlog update

Update:

- `docs/architecture/cli-core-split-prep.md`
- `docs/architecture/module-backlog.md`

Recommend Route 154 based on remaining Phase A risk.

Likely options:

- Harness / gate taxonomy
- Capability lifecycle adoption report
- Provider readiness parity map
- Edit / Patch thin integration
- CLI/core split implementation phase 2

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliCoreSplit.test.ts`
- affected CLI/slash/cli-baseline tests for touched surfaces

Broader validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts` if runtime invocation path touched
- `rtk npm run verify:result-contract` if result surface touched
- `rtk npm run build -w packages/ts-shell`

Repository hygiene:

- `rtk git diff --check`
- `rtk git status --short --branch`
- `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

Package sweep:

- Not required by default.
- Escalate only if Tier 2/3 escalation conditions are hit.

## Completion Audit

Before final response, map every deliverable to evidence:

| Requirement | Evidence | Status |
|---|---|---|
| CLI split prep doc | `cli-core-split-prep.md` | |
| startup projection | `cliStartupPlan.ts` | |
| session projection | `cliSessionProjection.ts` | |
| provider/display projection if added | helper file/tests | |
| focused tests | `cliCoreSplit.test.ts` | |
| no behavior change | CLI/runMvp validation | |
| validation tier followed | final report | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. CLI boundary advanced
5. Validation tier used and why package sweep was or was not run
6. Validation commands and results
7. Real-provider gate status
8. External MCP status
9. Audit/history residue handling
10. Source/package change confirmation
11. Remaining risks
12. Best next action
13. Proposed commit message

Do not commit or push.
