# Route 159: Harness / Eval - real-user verifier module facade extraction

## Module

- Primary module: Harness / Eval Engineering
- Secondary modules:
  - Provider / Model Engineering
  - Runtime Engineering
  - Tool Engineering
  - Permission / Policy Engineering
  - Result Surface Engineering
  - Edit / Patch Engineering
  - Browser Engineering
  - CLI / UX Engineering
- Capability: real-user capability verifier facade extraction
- Cross-module inputs:
  - existing `scripts/verify-real-user-capabilities.mjs` compatibility entrypoint
  - existing `scripts/verify/*` modules from Route 135
  - verifier case catalog
  - verifier environment/readiness facts
  - verifier execution runner
  - verifier result normalization
  - verifier report writer
  - verifier residue handling
  - opt-in real-provider / external MCP boundaries
- Cross-module outputs:
  - verifier responsibility migration table
  - Harness-owned facades for CLI/options, suite/case selection, environment/readiness, execution/result/report, opt-in safety, and residue handling
  - preserved verifier flags, markers, report fields, exit codes, redaction, and opt-in behavior
  - updated `control-plane-atlas.md`
  - focused verifier facade tests
- Product behavior boundary:
  - behavior-preserving extraction only
  - no product runtime behavior change
  - no real-provider execution unless existing dry-run/opt-in behavior already does so
  - no external MCP execution
  - no package script/dependency changes
- Stop conditions:
  - extraction requires changing verifier flags or output markers
  - extraction requires changing exit-code semantics
  - extraction requires changing real-provider opt-in behavior
  - extraction requires hiding failures or deleting scenarios
  - extraction becomes a verifier rewrite instead of module facade migration
- Capability lifecycle stage(s):
  - availability: verifier command/suite/case availability
  - policy: real-provider/external MCP opt-in guard facts
  - planning: suite/case selection and validation tier selection
  - execution: run existing verifier commands unchanged
  - observation: collect stdout/stderr/status safely
  - evidence: stable markers and JSON report fields
  - result mapping: pass/fail/skip/unavailable normalization
  - transcript: not applicable
  - continue / replay: not applicable
  - eval: primary route target
  - report: verifier report and route closeout
  - cleanup: audit/history residue classification
  - redaction: provider config paths/secrets and private runtime paths excluded

## Goal

Run the owner-module extraction pass for the real-user capability verifier surface.

After Routes 154-158, the major control-plane composition files have acceptable owner-module classifications. The remaining central readiness/reporting surface is the verifier stack.

This route should not blindly split files. It should first determine the real current concentration point:

- if `scripts/verify-real-user-capabilities.mjs` is only a compatibility shim, keep it as the entrypoint and mark it acceptable
- then migrate the actual large verifier responsibilities under `scripts/verify/*` behind Harness-owned facades
- preserve all existing external behavior

This route is successful when:

- [ ] `docs/architecture/verifier-module-extraction.md` records a responsibility migration table before code motion
- [ ] the current verifier entrypoint shape is audited and classified
- [ ] at least three coherent verifier responsibility families are moved or consolidated behind module-owned facades
- [ ] existing flags, suite/tier selection, markers, JSON report shape, exit codes, dry-run behavior, residue handling, and opt-in boundaries are preserved
- [ ] tests are updated to target facade boundaries where appropriate
- [ ] `control-plane-atlas.md` is updated with verifier ownership and next central file recommendation
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it changes verifier behavior just to simplify code
- [ ] it hides failures behind skips
- [ ] it removes scenarios or weakens gates
- [ ] it changes real-provider or external MCP opt-in behavior
- [ ] it turns facade extraction into a new test runner framework
- [ ] it fails to update the migration doc and atlas

## References

Target project evidence:

- `docs/architecture/cli-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/verifier-decomposition.md`
- `docs/architecture/runmvp-package-closeout.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/agent-routes/module-route-template.md`
- `scripts/verify-real-user-capabilities.mjs`
- `scripts/verify/*`
- `package.json`
- `packages/ts-shell/package.json`

Reference projects to inspect:

- Inspect AI:
  - eval task / scorer / report boundaries
  - pass/fail/skip result shape
- mini-swe-agent:
  - command-run trajectory and lightweight report shape
- opencode:
  - test/gate conventions and tool readiness reporting if available
- gemini-cli:
  - CI/test selection and validation/report helpers if available
- OpenHands:
  - event/eval/report patterns if directly useful

Reference budget:

- Inspect AI: max 10 files
- mini-swe-agent: max 6 files
- opencode + gemini-cli + OpenHands: max 10 files total
- Stop reference reading once verifier CLI/options, suite/case, execution, report, and opt-in safety boundaries are clear.

Do not inspect provider/browser/edit internals unless a verifier case boundary directly requires it.

## Current Project Surfaces

Primary surfaces:

- `scripts/verify-real-user-capabilities.mjs`
- `scripts/verify/index.mjs`
- `scripts/verify/orchestration.mjs`
- `scripts/verify/cases.mjs`
- `scripts/verify/env.mjs`
- `scripts/verify/run.mjs`
- `scripts/verify/result.mjs`
- `scripts/verify/report.mjs`
- `scripts/verify/residue.mjs`

Likely package/script surfaces:

- `package.json`
- `packages/ts-shell/package.json`
- `scripts/verify-result-contract.mjs`
- `scripts/verify-edit-capability-closeout.mjs`
- other verifier scripts only if invoked by the real-user verifier

Likely new or consolidated facade files:

- `scripts/verify/verifierCliModule.mjs`
- `scripts/verify/verifierCaseModule.mjs`
- `scripts/verify/verifierEnvModule.mjs`
- `scripts/verify/verifierExecutionModule.mjs`
- `scripts/verify/verifierReportModule.mjs`
- `scripts/verify/verifierSafetyModule.mjs`
- `scripts/verify/verifierResidueModule.mjs`
- `scripts/verify/verifierModuleBoundaryCheck.mjs`
- `docs/architecture/verifier-module-extraction.md`

Choose names based on actual ownership. Prefer cohesive facades over many tiny files.

## Allowed Changes

- Create Harness-owned facades around existing verifier modules.
- Keep `scripts/verify-real-user-capabilities.mjs` as compatibility entrypoint.
- Replace direct orchestration imports with facade calls where behavior is identical.
- Update tests to target facade boundaries where appropriate.
- Update stale test names/comments that imply old ownership.
- Update `control-plane-atlas.md` and `module-backlog.md`.

## Explicit Non-Goals

Do not:

- change verifier flags
- change suite/tier selection semantics
- change marker strings
- change report JSON fields
- change exit-code behavior
- change dry-run behavior
- change real-provider opt-in behavior
- change external MCP behavior
- remove or skip scenarios to pass
- add dependencies
- change package scripts unless only documenting no-op ownership
- rewrite the verifier framework

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No real-provider config reads or secret printing.
- No external MCP execution.
- No browser/edit/runtime capability expansion.
- No permission weakening.
- No package/dependency changes.
- No product source behavior changes.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: Harness / Eval central surface facade extraction.
- Required:
  - focused verifier facade tests
  - `node --check` for touched verifier modules
  - existing verifier commands that cover touched suite/tier/marker/report paths
  - build only if package TS surfaces are touched
  - diff/status/package-file guard
- Package sweep is not required by default.
- Escalate to package sweep only if:
  - package scripts change
  - product TS source changes
  - verifier changes test expectations broadly
  - focused verifier gates reveal unexplained package failures

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | env/readiness facts exist in verifier modules | env facade exposes availability facts | facade tests |
| policy | opt-in real-provider and external MCP boundaries exist | safety facade preserves opt-in policy facts | dry-run/include-real tests |
| planning | tier/suite/case selection exists | case facade owns selection plan | case tests |
| execution | subprocess runner exists | execution facade owns run result handoff | runner tests |
| observation | stdout/stderr/status captured | budgeted observation summary preserved | report tests |
| evidence | markers/report fields exist | report facade preserves stable markers | verifier command tests |
| result mapping | pass/fail/skip/unavailable normalization exists | result facade owns normalization boundary | result tests |
| transcript | not applicable | no change | none |
| continue / replay | not applicable | no change | none |
| eval | primary route target | facade-owned verifier gates | validation output |
| report | report writer exists | report facade centralizes shape | JSON report tests |
| cleanup | residue helper exists | residue facade owns generated residue classification | residue tests |
| redaction | provider secrets/config must not print | safety/report facade preserves redaction | redaction assertions |

## Implementation Tasks

### 1. Create verifier responsibility migration document

Create `docs/architecture/verifier-module-extraction.md`.

Before code changes, document a migration table.

Required columns:

- current code block / responsibility
- current owner file
- true owner module
- target facade or file
- migration decision:
  - extract now
  - facade existing modules
  - leave in compatibility entrypoint
  - defer
  - do not move
- reason
- validation required
- risk

### 2. Audit actual entrypoint shape

Inspect `scripts/verify-real-user-capabilities.mjs`.

If it is already a thin compatibility shim:

- mark it as acceptable compatibility entrypoint
- do not expand it
- identify the true concentration point under `scripts/verify/*`

If it is not thin:

- migrate non-entrypoint responsibilities behind facades
- preserve every flag and exit behavior

### 3. Extract CLI/options facade

Candidate file:

- `verifierCliModule.mjs`

Responsibilities:

- parse/normalize verifier options
- preserve flags and aliases
- preserve tier/suite/self-test/include-real/dry-run behavior
- expose one options object to orchestration

Do not change CLI behavior.

### 4. Extract suite/case facade

Candidate file:

- `verifierCaseModule.mjs`

Responsibilities:

- case registry
- tier selection
- suite selection
- case descriptor projection
- skip/unavailable metadata
- route/module ownership labels if already present

Do not remove or silently skip cases.

### 5. Extract environment/safety facade

Candidate files:

- `verifierEnvModule.mjs`
- `verifierSafetyModule.mjs`

Responsibilities:

- repo root and package facts
- Node/npm/RTK facts
- report path facts
- real-provider opt-in guard
- external MCP guard
- redaction of provider config paths/secrets
- include-real dry-run truthfulness

Do not run real-provider or external MCP unless existing opt-in path already does.

### 6. Extract execution/result facade

Candidate file:

- `verifierExecutionModule.mjs`

Responsibilities:

- subprocess command execution handoff
- timeout/status/exit capture
- pass/fail/skip/unavailable normalization
- command failure summary
- stable result object for report/exit decision

Do not change command lists or expected outcomes.

### 7. Extract report/residue facade

Candidate files:

- `verifierReportModule.mjs`
- `verifierResidueModule.mjs`

Responsibilities:

- JSON report writer shape
- terminal summary shape
- stable marker strings
- final exit-code decision input
- generated residue classification
- audit/history cleanup guidance

Do not silently delete non-generated user files.

### 8. Replace orchestration direct fragments

Update `scripts/verify/index.mjs` / `orchestration.mjs`:

- keep top-level verifier flow
- call facades for CLI/options, case selection, env/safety, execution/result, report/residue
- preserve output, report fields, markers, exit codes, and dry-run behavior

### 9. Tests and stale assumptions

Add `verifierModuleBoundaryCheck.mjs` if repository patterns allow.

Required coverage:

- existing entrypoint remains compatible
- tier selection unchanged
- suite selection unchanged
- include-real dry-run does not touch real provider
- report fields preserved
- marker strings preserved
- exit code success/failure behavior preserved
- residue classification does not delete user files
- redaction excludes provider config/secrets
- facade functions do not execute tests unless orchestration calls them

If test framework does not cover scripts well, add deterministic node-based self-checks or focused npm scripts only if lightweight and justified.

### 10. Update docs

Update:

- `docs/architecture/verifier-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

At the end, classify verifier surface as one of:

- acceptable Harness / Eval readiness composition root
- still requires another verifier extraction route
- should hand off to next central file

Recommend the next central file from the atlas:

- `resultMapper.ts`
- any remaining verifier follow-up only if unavoidable

## Validation

Focused validation:

- `rtk node --check scripts/verify-real-user-capabilities.mjs`
- `rtk node --check scripts/verify/*.mjs`
- focused verifier boundary tests if added

Required verifier commands:

- `rtk npm run verify:real-user-capabilities -- --tier=mvp`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --dry-run`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`

Repository hygiene:

- `rtk git diff --check`
- `rtk git status --short --branch`
- `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`
- `rtk git diff --name-only -- packages/ts-shell/src`

Package sweep:

- Not required by default.
- Escalate only if Tier 3 escalation conditions are hit.

## Completion Audit

Before final response, map every deliverable to evidence:

| Requirement | Evidence | Status |
|---|---|---|
| verifier migration doc | `verifier-module-extraction.md` | |
| entrypoint classification | migration doc | |
| at least three verifier facades | facade files | |
| verifier behavior preserved | verifier command output | |
| opt-in boundary preserved | include-real dry-run evidence | |
| report/marker/exit behavior preserved | tests/commands | |
| atlas updated | `control-plane-atlas.md` | |
| final classification | atlas + migration doc | |
| next central file recommended | atlas/backlog note | |
| no product behavior change | source/package diff guard | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. Verifier entrypoint classification
5. Verifier responsibility migration summary
6. Module facades created or consolidated
7. What remains in verifier orchestration
8. Verifier final classification
9. Next central file recommended by atlas
10. Validation tier used and why package sweep was or was not run
11. Validation commands and results
12. Real-provider gate status
13. External MCP status
14. Audit/history residue handling
15. Source/package change confirmation
16. Remaining risks
17. Best next action
18. Proposed commit message

Do not commit or push.
