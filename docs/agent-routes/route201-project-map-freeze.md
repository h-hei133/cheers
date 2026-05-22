# Route 201: Project Map Freeze

## Purpose

Create a read-only, complete project map before the upcoming large refactor.

This route is not an implementation route. It must not change product code, tests, runtime behavior, provider behavior, verifier behavior, package files, schemas, CLI behavior, or route logic.

The output should describe the project as it exists now:

- what modules exist
- how modules depend on each other
- what each module can and cannot do
- which modules are missing or only implicit
- where module boundaries are weak
- what defects exist inside each module
- how the read -> analyze -> plan -> edit chain currently works
- what evidence is live, fake, default-safe, scaffold-only, or not proven

Do not include next-route recommendations, roadmap proposals, backlog updates, or best-next-action text.

## Inputs to inspect

Read current project sources only.

Start with:

- `docs/ACTIVE_CONTEXT.md`
- `docs/DOC_STATUS.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`

Then inspect source/docs/scripts as needed for the current truth.

Pay special attention to:

- Agent Loop and `runMvpIntegratedFlow.ts`
- Task lifecycle modules
- Read / context / code graph modules
- Analysis / plan quality modules
- Provider / real-provider / anchored smoke modules
- Proposal / anchoring modules
- Edit / apply / snapshot / recovery modules
- Verification / repair modules
- Result Surface
- Session / Continue
- Harness / Eval verifier scripts
- CLI / UX boundaries
- Browser modules only at summary level

Use current code and current verifier behavior as truth. Old route docs are historical evidence only.

Also incorporate the user-observed evidence:

- Route 199: live `openai-compatible` anchored provider smoke succeeded with provider-called=true, valid exact single-target output, anchor-quality=exact-ready, no-write=true.
- Route 200: live task loop commands still showed provider-called=false, anchor-quality=none, apply=not-run, verification=not-run, status=task-loop-stopped.

## Output files

Create exactly these files:

- `docs/PROJECT_MAP.md`
- `docs/project-map/README.md`
- `docs/project-map/capability-state.md`
- `docs/project-map/live-evidence-ledger.md`
- `docs/project-map/module-boundary-map.md`
- `docs/project-map/module-defect-map.md`
- `docs/project-map/entrypoint-flow-map.md`
- `docs/project-map/verification-gate-map.md`
- `docs/project-map/coupling-risk-map.md`
- `docs/project-map/current-state.json`

No additional output files.

## Required content

### 1. `docs/PROJECT_MAP.md`

Human entrypoint.

It must summarize:

- project purpose today
- main capability chains
- main modules
- current state of provider, proposal, edit, verification, repair, session, harness
- current live evidence vs fake/default-safe evidence
- the key Route 199 vs Route 200 distinction
- major module and system-level defects

No recommendations.

### 2. `docs/project-map/capability-state.md`

Describe current state by capability.

Required capabilities:

- Read / Context
- Context Graph / Code Graph
- Analyze
- Plan / Plan Quality
- Task Lifecycle
- Provider / Model
- Provider Smoke / Dry-run
- Proposal / Review
- Anchoring
- Edit / Apply
- Snapshot / Recovery
- Verification / Runtime
- Repair
- Result Surface
- Session / Continue
- Harness / Eval
- Browser
- CLI / UX
- Workspace / File Context
- Permission / Policy

For each capability, include:

- responsibility
- main files/modules
- upstream dependencies
- downstream consumers
- what works
- what does not work
- evidence level
- internal defects
- boundary risks

Evidence level must be one of:

- `live-provider-called`
- `live-provider-no-write`
- `live-provider-apply`
- `live-verification`
- `fake-provider`
- `fake-ready-boundary`
- `default-safe-skip`
- `focused-unit-tests`
- `scaffold-only`
- `not-proven`

### 3. `docs/project-map/live-evidence-ledger.md`

This file must separate evidence types.

Use a table with columns like:

- Area / Route / Gate
- Evidence type
- Provider called?
- Apply happened?
- Verification happened?
- Workspace mutated?
- Mutation scope
- Result
- Source marker or command
- Confidence

Must explicitly include:

Route 199:

- provider kind = openai-compatible
- adapter approved = true
- provider called = true
- output validation = valid-exact-single-target
- anchor quality = exact-ready
- no-write = true
- mutation authority = not-granted
- raw provider output = excluded

Route 200:

- live task-loop opt-in = true
- real provider smoke opt-in = true
- provider called = false
- anchor quality = none
- apply = not-run
- verification = not-run
- mutation scope = none
- status = task-loop-stopped

This file must make it impossible to mislabel Route 200 as a live task-loop success.

### 4. `docs/project-map/module-boundary-map.md`

Describe modules as responsibility boundaries, not directories.

Required modules:

- Agent Loop
- Task Lifecycle
- Workspace / File Context
- Read / Context Discovery
- Context Graph / Code Graph
- Analysis / Plan Quality
- Provider / Model
- Provider Proposal / Smoke
- Proposal Anchoring
- Edit / Patch
- Verification / Runtime
- Repair Loop
- Result Surface
- Session / Continue
- Harness / Eval
- Browser
- CLI / UX
- Permission / Policy

For each module, include:

- responsibility
- main files
- facade/public functions if identifiable
- upstream modules
- downstream modules
- owned lifecycle stages
- coupling level: low / medium / high
- whether it is independent, dependent, or central glue
- unclear ownership or boundary violations

### 5. `docs/project-map/module-defect-map.md`

Describe defects and missing modules.

Required sections:

- module defects by module
- cross-module defects
- missing or implicit modules
- overgrown facades or composition roots
- evidence/reporting defects
- fake/live/default-safe evidence confusion
- read -> analyze -> plan -> edit chain defects

For each defect, include:

- defect id
- affected modules
- description
- evidence/source
- severity: blocking / high / medium / low / accepted
- defect type: capability / architecture / evidence / safety / UX
- current impact
- what is not proven

Do not include fixes or next steps.

### 6. `docs/project-map/entrypoint-flow-map.md`

Map actual flows.

Required flows:

- CLI prompt path
- runMvpIntegratedFlow path
- task lifecycle activation path
- context planning path
- provider anchored smoke path
- real task loop verifier path
- proposal review/apply path
- edit apply path
- verification command path
- repair proposal path
- session/continue path
- browser path
- verifier script path

For each flow, include:

- entrypoint
- major steps
- modules involved
- evidence emitted
- result surface emitted
- what it proves
- what it does not prove
- live/fake/default-safe/scaffold status

Must compare:

- `scripts/verify-real-provider-anchored-smoke.mjs`
- `scripts/verify-real-provider-task-loop-mvp.mjs`

Explain why the first has live provider evidence and the second currently does not.

### 7. `docs/project-map/verification-gate-map.md`

Map verifier gates.

Required gates:

- focused unit tests
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs`
- `rtk npm run verify:result-contract`
- build
- diff check
- package guard
- audit residue guard
- `scripts/verify-real-provider-readiness-smoke.mjs`
- `scripts/verify-real-provider-anchored-smoke.mjs`
- `scripts/verify-real-provider-task-loop-mvp.mjs`

For each gate, include:

- what it proves
- what it does not prove
- whether it calls provider
- whether it can mutate workspace
- whether it verifies apply
- whether it verifies verification
- whether it is fake/default-safe/live
- known false-complete risk

### 8. `docs/project-map/coupling-risk-map.md`

Describe risk concentrations.

Must cover:

- composition roots
- large facades
- verifier growth
- provider path split
- task-loop not using provider boundary
- exact anchor safety vs capability tension
- Result Surface / Session parity drift
- fake/live/default-safe evidence confusion
- documentation overload
- route completion ambiguity

No recommendations.

### 9. `docs/project-map/current-state.json`

Machine-readable project state.

Must be valid JSON.

Required top-level fields:

- `route`
- `projectPhase`
- `capabilities`
- `modules`
- `entrypoints`
- `verifiers`
- `evidenceLedger`
- `riskFlags`
- `liveEvidenceSummary`

Must include:

```json
{
  "liveEvidenceSummary": {
    "providerAnchoredSmoke": {
      "providerCalled": true,
      "providerKind": "openai-compatible",
      "anchorQuality": "exact-ready",
      "noWrite": true,
      "mutationAuthority": "not-granted"
    },
    "realProviderTaskLoop": {
      "providerCalled": false,
      "anchorQuality": "none",
      "apply": "not-run",
      "verification": "not-run",
      "mutationScope": "none",
      "status": "task-loop-stopped"
    }
  }
}
```

Hard rules
- Do not change product code.
- Do not change tests.
- Do not change verifier scripts.
- Do not run provider gates.
- Do not run browser gates.
- Do not run real task-loop gates.
- Do not scan external repositories.
- Do not add dependencies.
- Do not add route recommendations.
- Do not add best-next-action text.
- Do not update backlog except this route doc if already required by project convention.
Validation

Run only light validation:

node -e "JSON.parse(require('fs').readFileSync('docs/project-map/current-state.json','utf8')); console.log('json-ok')"
rtk git diff --check
rtk git status --short --branch

If product code changes accidentally, revert them.

Final report

Final report must include only:

files created
map sections covered
evidence distinction summary
Route 199 vs Route 200 factual distinction
product code change status
validation results

Do not include:

next route recommendation
best next action
commit message
roadmap
future route plan
