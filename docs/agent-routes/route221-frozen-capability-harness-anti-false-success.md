# Route 221: Frozen Capability Harness and Anti-False-Success Gate

## Goal

Stop route-local false success.

Route207-219 built many capabilities, but Route220 showed that some previous COMPLETE claims were only benchmark/focused/fixture success, not stable product capability.

Route221 must create a durable development mechanism that prevents future routes from declaring success by creating their own fragile task, benchmark, fixture, or display-only surface.

This route is not a new coding capability route.

It must build the anti-false-success harness for future capability routes:

- frozen task pack
- evidence level schema
- negative controls
- task-level verdict format
- reference adoption table
- final audit rules
- route completion guard

The goal is to make future routes unable to say COMPLETE unless they prove capability against pre-existing or frozen product-path evidence.

## Core principle

A route may add new tests or benchmarks, but new route-local tests cannot be the sole primary evidence for COMPLETE.

Future COMPLETE claims must be based on:

- frozen tasks
- real product path
- pre-existing gates
- independent audit
- negative controls
- clear not-proven claims

A route-local benchmark may protect against regression, but it cannot by itself prove real capability.

## Completion rule

COMPLETE requires:

- a frozen capability task pack committed to docs/implementation-context/
- an evidence classification schema committed to docs/implementation-context/
- a route completion guard or verifier committed and wired into package scripts
- a reference adoption table format for future routes
- negative control requirements
- final audit rules that prevent the main thread from overriding PARTIAL audit results without a rerun
- a short migration guide telling future Codex sessions how to use this harness
- validation passes
- no product behavior churn beyond tiny diagnostic wiring if needed

PARTIAL if only docs are added with no enforceable guard.

BLOCKED if the project structure cannot support a lightweight route completion guard.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign focused audit subagents only if useful.
2. Implement or document the phase.
3. Validate.
4. Audit.
5. If green, commit with message starting route221:.

Rules:

- Do not push.
- Do not commit failing states.
- Maximum 4 phase commits.
- Do not implement new coding-agent capability.
- Do not broaden Claim Ledger.
- Do not run real provider unless an existing safe gate absolutely requires it.
- Final report must list commits and git status.

## Reference repository pool

All repos are under /home/wang/projects:

- OpenHands
- mini-swe-agent
- opencode
- gemini-cli
- inspect_ai
- GitNexus
- graphiti
- pi
- mem0
- mempalace
- playwright-mcp
- stagehand

Use references only to design the harness, not for broad repo reading.

Recommended mapping:

- task/eval harness: inspect_ai, OpenHands, mini-swe-agent
- trajectory/result evidence: OpenHands, inspect_ai
- approval/tool safety: opencode, OpenHands
- context/task pack ideas: gemini-cli, GitNexus, graphiti, pi

Subagent reports must be short:

- pattern found
- local harness recommendation
- what not to copy
- audit risk

## Real provider policy

This route should not run live provider by default.

If any existing gate requires provider status, use only approved config loading paths.

Do not cat, grep, print, echo, upload, or dump provider config.

Do not print API keys.

Do not print raw provider output.

Do not print provider oldText or newText.

No retry loops.

No fake live success.

## Scope

Allowed:

- docs/implementation-context/
- docs/agent-routes/
- scripts/verify-route221-anti-false-success-gate.mjs
- package.json script wiring
- tiny tests for the guard if needed

Not allowed:

- new coding capability
- new writer
- fuzzy apply
- provider by default
- apply by default
- command dispatch by default
- new dependencies
- broad Claim Ledger rewrite
- broad runtime refactor
- raw provider output logging
- manual private config reads

## Phase 0: False-success audit baseline

Purpose:

Summarize the false-success patterns discovered from Route207-220.

Must cover:

- demo-only completion
- export-only completion
- route-local benchmark completion
- fake/focused evidence mislabeled as product capability
- review-ready mislabeled as apply-ready
- continuation-created mislabeled as repair-success
- command-channel proof mislabeled as task-relevant verification
- local stdout evidence not visible to audit subagent
- final audit PARTIAL overridden by main-thread interpretation

Deliverable:

docs/implementation-context/route221-false-success-patterns.md

Optional commit:

route221: document false success patterns

## Phase 1: Frozen capability task pack

Purpose:

Create a frozen task pack that future routes must use as primary evidence.

Deliverable:

docs/implementation-context/frozen-capability-tasks-route221.json

The pack must include:

- lower-bound stable tasks
- upper-bound challenge tasks
- negative controls
- unsupported broad task
- command-only bypass
- explicit no-provider/no-apply default case
- live-provider opt-in case
- multi-file case
- verification-failure repair case
- selected workspace authority case
- context/session continuity case

Each task must include:

- id
- task type
- user prompt
- expected product path
- allowed files or module area
- required evidence
- verification expectation
- negative controls
- disallowed shortcuts
- success criteria
- partial criteria
- failure criteria

Rules:

- future routes may add new tasks, but cannot delete or weaken frozen tasks in the same route that claims capability
- future route-local tasks must be labeled route-local
- route-local tasks cannot replace frozen tasks as primary evidence

Optional commit:

route221: add frozen capability task pack

## Phase 2: Evidence classification and verdict schema

Purpose:

Define the evidence levels future routes must use.

Deliverable:

docs/implementation-context/capability-evidence-schema-route221.md

Evidence levels:

- product-proven
- live-provider-proven
- selected-workspace-proven
- frozen-task-proven
- benchmark-proven
- route-local-benchmark
- focused-only
- fake/focused-only
- deterministic-only
- review-only
- partial
- blocked
- not-proven

Task verdict fields:

- context
- provider/proposal
- exact-ready/anchor
- confirmation
- apply
- verification
- repair
- session/result evidence
- final verdict
- not-proven claims

Rules:

- apply without verification is not success
- verification failed is not success
- repair continuation is not repair success
- repair proposal is not repair applied
- route-local benchmark is not product-proven
- fake/focused is never live
- default-safe is not completed work
- final status follows the weakest required frozen-task capability

Optional commit:

route221: add capability evidence schema

## Phase 3: Anti-false-success verifier

Purpose:

Add a lightweight verifier that checks future route reports and route artifacts for basic anti-false-success compliance.

Deliverable:

scripts/verify-route221-anti-false-success-gate.mjs

Add package script:

verify:route221-anti-false-success-gate

Verifier should check:

- frozen task pack exists and is valid JSON
- evidence schema exists
- false-success patterns doc exists
- future route report template exists
- reference adoption table template exists
- at least one negative control exists
- no task marks route-local benchmark as product-proven
- required evidence levels are known
- no COMPLETE marker is allowed without frozen/product evidence in template examples
- audit PARTIAL override rule is documented

This verifier is a guard, not a full proof engine.

Optional commit:

route221: add anti false success verifier

## Phase 4: Reference adoption and route report protocol

Purpose:

Make future reference repo study real instead of decorative.

Deliverables:

docs/implementation-context/reference-adoption-template-route221.md
docs/implementation-context/future-route-report-template-route221.md

Reference adoption table must include:

- capability area
- reference repo
- file or subsystem inspected
- pattern adopted
- local seam changed
- pattern rejected
- reason
- evidence produced

Future route final report must include:

- frozen tasks attempted
- route-local tasks added
- evidence level per task
- negative controls
- product path consumer
- provider evidence class
- verification evidence
- repair evidence
- final audit result
- if audit returned PARTIAL, rerun audit result or final status must remain PARTIAL
- not-proven claims
- next route recommendation

Optional commit:

route221: add route report and reference adoption protocol

## Phase 5: Final audit and next route recommendation

Purpose:

Validate the harness and recommend next route.

Run:

- verify:route221-anti-false-success-gate
- verify:result-contract
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Final audit must answer:

- Does this prevent route-local benchmark-only COMPLETE?
- Does it prevent demo/export/focused-only COMPLETE?
- Does it require negative controls?
- Does it preserve the project innovation as task verdict rather than runtime bloat?
- Is it lightweight enough not to block future development?
- What should Route222 be?

Likely next route:

Route222: Repair-to-Success Against Frozen Tasks

But final recommendation must be evidence-based.

Optional commit:

route221: finalize anti false success harness

## Required validation

Required:

- npm run verify:route221-anti-false-success-gate
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Do not run broad suites unless needed.

Do not run live provider unless strictly necessary.

## Final report

Do not print provider secrets.

Do not paste raw provider output.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase commits
3. False-success patterns captured
4. Frozen task pack summary
5. Evidence schema summary
6. Anti-false-success verifier result
7. Reference adoption protocol
8. Future route report protocol
9. Validation pass/fail
10. Files changed
11. Remaining risks
12. Recommended Route222
