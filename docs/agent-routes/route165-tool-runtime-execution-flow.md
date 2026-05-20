# Route 165: Tool / Runtime execution flow and gate evidence calibration

## Module

- Primary module: Tool Engineering / Runtime Engineering
- Secondary modules: Result Surface, Session / Continue, Harness / Eval, Permission / Policy, Agent Loop
- Route type: vertical execution-flow calibration
- Product behavior boundary:
  - calibrate existing tool/runtime execution facts through receipt, result, session, and gate evidence
  - do not add shell commands
  - do not broaden allowlists
  - do not change sandbox or approval policy
  - do not change command execution semantics

## Goal

Calibrate the existing Tool / Runtime execution flow after the foundation consistency pass.

Routes 162 and 164 aligned stopped-result and blocker-detail flows. Route 165 should now handle the most central execution path:

- command success
- command nonzero failure
- command timeout / cancel if supported by existing fixtures
- command blocked by policy / allowlist
- approval denied
- runtime unavailable
- stdout / stderr budgeted summary
- runtime receipt projection
- result truthfulness
- session terminal rendering
- transcript-safe runtime evidence
- verifier / gate evidence consistency

This is not a shell feature route. It is a foundation route for existing execution outcomes.

## Success criteria

This route is successful when:

- existing command success and failure paths have consistent Runtime Receipt, Tool Result, Result Surface, and Session terminal summaries
- timeout / cancelled / unavailable paths are classified truthfully where existing fixtures support them
- blocked / approval-denied command paths remain actionable stopped results
- stdout / stderr summaries stay budgeted and transcript-safe
- verifier or closeout evidence for tool/runtime execution uses stable markers or summaries where applicable
- implementation context is updated only where actual wiring differs
- no execution capability is expanded

## Internal inputs

Read the current internal context first:

- `docs/foundation/README.md`
- `docs/foundation/foundation-consistency-audit.md`
- `docs/foundation/foundation-consistency-matrix.json`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-flow-graph.md`
- `docs/implementation-context/capability-recipes.md`

Then read relevant contracts and extraction notes:

- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/resultmapper-module-extraction.md`
- `docs/architecture/session-runtime-module-extraction.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/module-backlog.md`

Main source areas to inspect:

- tool/runtime execution and result projection files
- runtime receipt and runtime receipt projection files
- sandbox / allowlist policy files
- approval-denied result path
- Result Surface and resultMapper files
- sessionTerminalState / sessionEventSurface / sessionPersistenceProjection
- verifier scripts only where tool/runtime evidence is reported

External references are not required and should not be used by default. Use them only if internal contracts conflict and the route needs a tie-breaker. If used, record the exact question and files read.

## Scope

Calibrate these existing flows if present:

### 1. Command success

Check that command success carries consistent facts through:

- runtime receipt
- tool result
- result surface
- terminal summary
- transcript-safe summary
- verifier evidence if applicable

Do not change success semantics.

### 2. Command failure

Check nonzero exit / failed execution paths:

- exit code / signal facts
- stderr summary
- result truthfulness
- terminal detail
- transcript-safe evidence

Do not hide failure as success.

### 3. Timeout / cancel / unavailable

If current fixtures support these paths, align:

- timeout reason
- cancellation reason
- runtime unavailable reason
- cleanup facts if present
- stopped vs failed truthfulness

Do not add new timeout behavior.

### 4. Blocked / approval-denied

Align existing command blocked and approval-denied paths:

- policy reason
- doNext
- actionable stopped result
- terminal detail
- verifier evidence if applicable

Do not change sandbox, allowlist, or approval policy.

### 5. Output budgeting and redaction

Ensure stdout / stderr summaries remain bounded and safe.

Do not introduce raw long dumps, provider config paths, secrets, private keys, tokens, raw DOM, or raw file dumps into terminal or transcript-safe summaries.

## Implementation guidance

Prefer calibrating existing projections over adding new global abstractions.

Good changes may include:

- reusing Runtime Receipt projection consistently
- adding missing focused tests for runtime success/failure/blocked paths
- aligning terminal detail wording with existing result facts
- adding stable evidence markers where verifiers already inspect runtime outcomes
- updating implementation-context entries for actual runtime flow

Avoid:

- a new universal CapabilityHandoff
- broad Result Surface rewrite
- broad tool registry rewrite
- changing command execution order
- changing approval or sandbox decisions

## Documentation updates

Create:

- `docs/architecture/tool-runtime-execution-flow.md`

Update, only where needed:

- `docs/foundation/foundation-consistency-matrix.json`
- `docs/foundation/foundation-risk-register.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-flow-graph.md`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/module-backlog.md`

Keep documentation concise and tied to actual code changes.

## Tests

Add or update focused tests where useful.

Possible test areas:

- runtime receipt projection tests
- tool runtime tests
- dispatcher / tool result tests
- sandbox blocked / approval-denied tests
- resultMapper boundary tests
- sessionRuntime boundary tests
- verifier boundary tests if gate evidence changes

Required coverage should include, where current fixtures allow:

- command success remains completed
- command failure remains failed or stopped according to current contract
- timeout / unavailable never maps to completed
- blocked / approval-denied remains actionable stopped
- stdout / stderr summaries are bounded
- transcript-safe summaries exclude secrets and raw dumps
- result-contract remains green

## Boundaries

Hard boundaries:

- No provider live calls.
- No real-provider config reads.
- No external MCP execution.
- No browser capability expansion.
- No edit/write capability expansion.
- No broad shell / allowlist expansion.
- No sandbox policy weakening.
- No approval policy change.
- No runtime execution behavior change.
- No workspace authority or stale-read change.
- No result truthfulness weakening.
- No session schema or transcript format change.
- No CLI flag/mode behavior change.
- No dependency or package script change.
- No hidden skips.
- No commit or push.

## Validation

Validation tier: Tier 3 by default.

Required:

- focused tool/runtime/result/session tests touched by this route
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse check if foundation or implementation-context JSON changes
- `rtk git diff --check`
- `rtk git status --short --branch`
- package guard:
  - `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

Run `rtk npm run verify:edit-capability-closeout` only if edit/workspace files are touched.

Run `runMvpIntegratedFlow.test.ts` only if orchestration flow changes.

Package sweep is not required by default. Escalate only if execution semantics, package scripts, broad output expectations, or unexplained focused failures require it.

## Completion report

Final report should include:

1. Branch and base commit
2. Files changed
3. Command success flow changes
4. Command failure / timeout / unavailable flow changes
5. Blocked / approval-denied flow changes
6. Runtime receipt and terminal/session evidence alignment
7. Gate evidence alignment
8. Implementation-context or foundation updates
9. Result truthfulness preservation
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
