# Route 149: Module roadmap reset

## Goal

Reset the post-modularization roadmap around module-first development.

Routes 135-147 changed the project from feature-first development to module-governed development:

- Harness verifier decomposition
- Control-plane atlas
- Agent loop projection / dispatch seams
- Full runMvp and package baseline closeout
- Session substrate seams
- Tool / Policy / Result contract
- Future Edit expansion contract

The next step should not be chosen by route-number inertia or by the last touched capability. Route 149 should re-plan the next development phase around modules, ownership, risk, and product value.

This route owns:

- post-Route-147 module status inventory
- module-first roadmap reset
- phase-based route sequencing
- cleanup of stale backlog ordering
- explicit decision on whether Edit / Patch resumes now or later
- updated module docs so future routes stop drifting back into feature-first planning

This is a planning and architecture synchronization route. It should not change product runtime behavior.

## Expected outcome

By the end of Route 149:

1. The project has a clear post-modularization roadmap.
2. Future routes are organized by module, not by accidental feature drift.
3. The current status of Agent Loop, Session / Continue, Tool / Policy / Result, Edit / Patch, Browser, Workspace / File Context, Runtime, CLI / UX, Provider, and Harness is summarized.
4. The next 5-8 routes are rewritten as module-first routes.
5. The backlog no longer implies that the next route must be Edit just because Route 147 discussed future edit contracts.
6. Architecture docs explain how feature work should enter through module-owned contracts.
7. No product code is changed.

## Required inputs

Read:

- `docs/architecture/module-backlog.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/runmvp-package-closeout.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/capability-contract.md` if present
- `docs/agent-routes/module-route-template.md` if present

Use the latest package-green baseline and Route 145-147 closeouts as the current state.

## Reference scan

Use external references only for roadmap/module governance shape, not implementation.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 6 files
- ClaudeCode: max 6 files
- OpenHands: max 6 files
- gemini-cli: max 6 files
- Inspect AI + mini-swe-agent: max 6 files total

Focus:

- module/service ownership
- tool/session/result boundary ownership
- roadmap shape after baseline stabilization
- feature work entering through module-owned contracts
- avoiding broad refactor routes without validation hooks

Do not study browser/edit/provider internals unless needed to clarify module ownership.

## Files

Likely new file:

- `docs/architecture/module-roadmap-reset.md`

Likely updated files:

- `docs/architecture/module-backlog.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/session-substrate-seams.md`

Optional update if present and relevant:

- `docs/agent-routes/module-route-template.md`

Avoid updating many historical closeout docs unless they need a short forward pointer.

## Implementation tasks

### 1. Create module roadmap reset doc

Create `docs/architecture/module-roadmap-reset.md`.

It should answer:

- what changed after Routes 135-147
- why the project should switch to module-first development
- what modules exist now
- which modules are mature
- which modules still have high coupling
- where product capability work should resume
- what the next route candidates are
- what should not be done next

This doc should be practical, not philosophical.

### 2. Inventory module status

For each module, record:

- current state
- completed route evidence
- current owner files / seams
- strongest contract
- biggest risk
- next valid route type

Modules to cover:

- Agent Loop
- Session / Continue
- Tool
- Permission / Policy
- Result Surface
- Edit / Patch
- Browser
- Workspace / File Context
- Runtime
- CLI / UX
- Provider / Model
- Harness / Eval
- Capability Contract Architecture

### 3. Define module-first development rule

Add a short rule:

Future routes must name:

- owning module
- lifecycle stage touched
- cross-module inputs
- cross-module outputs
- product behavior boundary
- validation gate
- stop conditions

Feature work is allowed only when it enters through a module-owned contract.

Examples:

- Edit expansion enters through Edit / Patch module, not directly through runMvp.
- Browser planner enters through Browser module, not directly through agent loop.
- Provider readiness enters through Provider / Model module, not CLI ad hoc logic.
- CLI changes enter through CLI / UX module, not scattered display changes.

### 4. Re-rank next route families

Replace the stale route ordering in `docs/architecture/module-backlog.md`.

Recommended new phase ordering:

#### Phase A: Control-plane kernel hardening

- Agent Loop dispatch extraction v2
- Runtime receipt contract
- Workspace / File Context contract
- CLI / core split preparation

#### Phase B: Capability module expansion

- Edit / Patch module substrate
- Edit snapshot / rollback substrate
- Multi-file discovery candidate selection
- Browser controlled planner v2, only if product priority returns to browser

#### Phase C: Gate and release architecture

- Harness / gate taxonomy
- Eval report schema
- Provider readiness parity
- Capability lifecycle adoption report

Do not keep a route order that implies Edit must be next unless explicitly chosen.

### 5. Update module-backlog.md

Rewrite `docs/architecture/module-backlog.md` to reflect:

- completed routes through Route 147
- Route 149 as roadmap reset
- new module-first ordering
- candidate route families instead of fixed linear feature route
- decision criteria for selecting the next route

Keep useful completed-route summaries, but remove confusing stale numbering.

### 6. Update control-plane atlas

Add a short "Post-Route-149 roadmap reset" section to `docs/architecture/control-plane-atlas.md`.

It should say:

- baseline is green
- module-first development is now the default
- Agent Loop should not absorb new feature logic
- new capabilities must enter through module contracts
- next control-plane candidates

Do not rewrite the whole atlas.

### 7. Update future edit doc

Update `docs/architecture/future-edit-expansion-contract.md` with a short note:

- Route 147 defined contracts only
- Edit is not automatically the next route
- future edit work must enter through Edit / Patch module route
- no broad edit execution is enabled by the roadmap reset

Do not weaken the future edit preconditions.

### 8. Update Tool / Policy / Result and Session docs if needed

Add short forward pointers only if useful:

- `tool-policy-result-contract.md`: future modules should reuse this contract.
- `session-substrate-seams.md`: future session routes should preserve schema and transcript behavior.

Avoid duplicating roadmap content everywhere.

### 9. Optional module-route template update

If `docs/agent-routes/module-route-template.md` exists, update it so future route docs require:

- owner module
- lifecycle stage
- cross-module dependencies
- behavior boundary
- validation gate
- stop conditions

If the template does not exist or is risky to edit, document the needed template changes in `module-roadmap-reset.md`.

### 10. Validation

Because this is docs-only, run:

- `rtk git diff --check`
- `rtk git status --short --branch`
- `rtk npm run build -w packages/ts-shell` if cheap and expected by current workflow

No package tests are required unless source files are touched.

## Boundaries

Hard boundaries:

- no product code changes
- no provider/model live calls
- no browser work
- no edit execution changes
- no broad refactor
- no schema changes
- no CLI behavior changes
- no dependency changes
- no package test expectation changes
- no commit or push

## Final report

Include:

1. What changed
2. Updated module-first development rule
3. Module status summary
4. New phase ordering
5. Next route recommendation
6. Docs updated
7. Validation
8. Remaining roadmap risks
9. Proposed commit message

Do not commit or push.
