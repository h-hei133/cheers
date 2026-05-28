# Next Implementation Routes

Because the final verdict is PARTIAL, further cleanup is needed. These are
grouped routes, not tiny routes.

## Route 1: Planning/runtime Concentration Closeout

Purpose: remove the remaining Phase 3 blocker concentration from
`planning/workflowTaskPlan.ts` and `runtime/workflowExecutionCoordinator.ts`
without changing product behavior.

Primary files:

- `packages/ts-shell/src/planning/workflowTaskPlan.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- focused owners under `planning`, `runtime`, `context`, `edit`,
  `verification`, `repair`, `result`, and `session/continuation`

Expected moves:

- move continuation planning facts out of generic task planning
- move repair replan/cross-file repair candidate rules to repair owners
- move verification continuation planning to verification owners
- move read/context carryover to context owners
- move mutation/verification/repair execution branches to stage owners
- keep public compatibility exports stable

Validation:

- focused workflow task plan tests
- focused workflow execution coordinator tests
- touched edit/verification/repair/context tests
- result contract tests if projection changes
- `npm run build -w packages/ts-shell`
- `git diff --check`

Stop conditions:

- any change to provider defaults
- any change to write authorization
- any weakening of result truthfulness, partial/not-proven/blocked semantics, or
  redaction
- broad feature development

## Route 2: Session Facade Slimming

Purpose: keep `SessionManager.ts` as a compatibility facade while moving store,
transcript, recovery, replay, continuity, approval memory, and presentation
logic into named session owners.

Primary files:

- `packages/ts-shell/src/session/SessionManager.ts`
- `session/store`
- `session/transcript`
- `session/recovery`
- `session/replay`
- `session/continuation`
- `session/approval`
- `session/presentation`
- `session/schema`

Validation:

- focused `SessionManager` tests
- session recovery and replay tests
- continuation tests
- CLI session tests if callers change
- build

Safe to start after Route 1, or earlier only if a user-facing session blocker
requires it.

## Route 3: Script Taxonomy Compatibility Cleanup

Purpose: reduce developer confusion without changing command behavior.

Primary files:

- root `package.json`
- script inventory docs
- script wrappers only if compatibility aliases are required

Expected output:

- product commands grouped clearly
- evidence gates grouped clearly
- route-history aliases retained under explicit names
- direct route aliases kept only as compatibility aliases or documented
  deprecations
- live-provider gates remain explicit opt-in

Validation:

- package script inventory check
- representative product verification aliases
- representative route-history aliases
- no live provider
- `git diff --check`

Safe to defer until after Phase 3 closes.

## Route 4: Route Vocabulary And Harness Quarantine

Purpose: reduce route-era names in runtime strings, browser fixtures, harnesses,
and evidence labels while preserving report compatibility and redaction tests.

Primary files:

- `core/harness`
- `core/context/browser*`
- route-era strings in orchestration and verification modules
- evidence compatibility adapters

Validation:

- Route221 anti-false-success gate if evidence/result labels change
- browser transaction/redaction gates if browser fixtures change
- result contract if terminal/result labels change
- no route report moves unless explicitly in scope

Safe to defer. This is not the next blocker route.

