# Route 163: Foundation - consistency audit

## Module

- Primary module: Capability Contract Architecture
- Secondary modules: Result Surface, Runtime, Workspace / File Context, Session / Continue, Tool, Provider / Model, Browser, Edit / Patch, CLI / UX, Harness / Eval
- Route type: foundation consistency route
- Product behavior boundary:
  - audit current foundational contracts for contradictions
  - add focused contradiction tests where useful
  - fix only high-confidence contradictions that are clearly behavior-preserving or contract-correcting
  - do not introduce new capability behavior
  - do not create a global unified handoff abstraction

## Goal

Evaluate whether the project foundation is internally consistent after the central-file extraction pass and the first cross-capability result-flow calibration.

This route should not ask "can we unify every module?".
It should ask:

- does each foundational fact have a clear source of truth?
- do consumers interpret that fact consistently?
- do result states mean the same thing across modules?
- are stopped / failed / completed semantics stable?
- do session and continuation summaries agree with result truthfulness?
- do verifier expectations match current product contracts?
- does the implementation context match actual code paths?

This route is successful when:

- a new `docs/foundation/` directory records the current foundation consistency state
- core facts have source-of-truth ownership recorded
- contradictions are classified by severity and owner
- at least several high-value contradiction checks are covered by focused tests or existing test evidence
- any high-confidence fix is small, justified, and validated
- future routes know which foundation risks must be resolved before expanding capabilities

This route is not successful if:

- it becomes another broad abstraction route
- it tries to force all modules into one unified type
- it turns into import policing
- it expands provider, browser, edit, runtime, CLI, or session behavior
- it changes result truthfulness without explicit contradiction evidence
- it hides uncertainty or treats undocumented assumptions as facts

## Output location

Create a new directory:

- `docs/foundation/`

Suggested files:

- `docs/foundation/README.md`
- `docs/foundation/foundation-consistency-audit.md`
- `docs/foundation/foundation-consistency-matrix.json`
- `docs/foundation/foundation-risk-register.md`

Codex may adjust names if a cleaner structure emerges, but foundation-specific outputs should live under `docs/foundation/`, not `docs/architecture/`.

## Core audit areas

Audit these foundation areas:

1. Result truthfulness
   - completed / stopped / failed
   - terminal classification
   - actionable blockers
   - reason / doNext

2. Runtime facts
   - command success / failure / timeout
   - runtime unavailable
   - cleanup facts
   - stdout / stderr summaries

3. Workspace and edit preconditions
   - missing target
   - ambiguous target
   - missing content
   - stale-read
   - unsupported future edit

4. Browser result facts
   - unavailable
   - policy blocked
   - timeout
   - cleanup failed / unknown
   - raw content excluded

5. Provider result facts
   - not configured
   - opt-in required
   - unsupported mode
   - diagnostic failure
   - unavailable

6. Session / Continue facts
   - transcript-safe summary
   - continuation seed
   - replay-safe evidence
   - stopped vs success carryover

7. CLI / UX surfaces
   - readiness display
   - provider status display
   - session status display
   - command/result display consistency

8. Harness / Eval facts
   - verifier markers
   - dry-run vs real-provider opt-in
   - report fields
   - exit code semantics

## Required internal inputs

Read the current implementation context:

- `docs/implementation-context/README.md`
- `docs/implementation-context/capability-flow-graph.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`

Read the most relevant contract and extraction docs:

- `docs/architecture/resultmapper-module-extraction.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/session-runtime-module-extraction.md`
- `docs/architecture/sessionmanager-module-extraction.md`
- `docs/architecture/cli-module-extraction.md`
- `docs/architecture/verifier-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

Read code selectively based on the audit area. Do not perform a broad codebase scan unless the documents are insufficient.

External repositories are not required. Use them only if the internal contracts contradict each other and the team needs a tie-breaker pattern. If used, record the exact question and files read.

## Foundation matrix

Create `foundation-consistency-matrix.json`.

It should be concise and machine-readable.

For each audited fact, record:

- fact id
- source of truth module
- source files or facades
- consumers
- expected result state
- expected terminal classification if applicable
- required fields
- forbidden fields
- contradiction checks
- validation evidence
- status: `consistent`, `suspect`, `contradiction`, `deferred`, or `unknown`
- owner module for follow-up

Do not make this a huge schema. It should be usable by future AI routes.

Example fact categories:

- `provider.notConfigured`
- `provider.optInRequired`
- `browser.cleanupFailed`
- `browser.timeout`
- `edit.missingContent`
- `edit.staleRead`
- `runtime.commandTimeout`
- `runtime.commandFailed`
- `session.stoppedContinuation`
- `verifier.includeRealDryRun`

## Risk register

Create `foundation-risk-register.md`.

Classify risks as:

- blocking: must fix before capability expansion
- high: should fix before related module work
- medium: track and fix when touching the module
- low: naming / documentation / minor projection drift
- accepted: known difference, not a contradiction

For each risk, include:

- short description
- affected modules
- why it is a contradiction or not
- evidence
- recommended next action
- whether it should become a route

## Focused contradiction checks

Add or update focused tests only when useful.

Possible test areas:

- resultMapper boundary tests
- cross-capability result flow tests
- runtime receipt projection tests
- workspace/edit expectation tests
- browser result/cleanup tests
- provider readiness/result tests
- sessionRuntime boundary tests
- verifier boundary tests

Do not create a giant new test file if existing focused tests are better.

Good contradiction tests prove things like:

- timeout never maps to completed
- stale-read never executes mutation
- provider opt-in required never leaks config paths
- browser raw content excluded stays excluded in session-safe summaries
- stopped results do not become success continuation seeds
- include-real dry-run does not touch real provider

## Allowed fixes

Small fixes are allowed only when all are true:

- the contradiction is clearly evidenced
- the source of truth is clear
- the fix does not expand capability behavior
- the fix preserves or improves truthfulness
- focused tests cover the change

Examples of acceptable fixes:

- missing provider marker in result projection
- stale stopped reason/doNext mismatch
- session-safe summary omits required stopped reason
- verifier report label inconsistent with actual dry-run behavior

Examples of non-goals:

- implementing new edit capability
- changing workspace authority
- changing provider auth or config reading
- changing browser runtime behavior
- changing CLI UX
- introducing a global result wrapper
- broad refactor of facades

## Documentation updates

Update:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`
- `docs/implementation-context/capability-flow-manifest.json` only if the audit finds it mismatches actual code
- `docs/implementation-context/capability-recipes.md` only if recipes need correction

Do not rewrite the implementation context unless needed.

## Boundaries

Hard boundaries:

- No provider live calls.
- No real-provider config reads or secret printing.
- No external MCP execution.
- No browser capability expansion.
- No edit/write capability expansion.
- No broad shell / allowlist expansion.
- No permission weakening.
- No workspace authority or stale-read behavior change.
- No session schema or transcript format change.
- No CLI behavior change.
- No dependency or package script change.
- No global unification abstraction.
- No hidden skips.
- No commit or push.

## Validation

Validation tier: Tier 2 by default, Tier 3 if source behavior fixes are made.

Required for docs/matrix only:

- JSON parse check for `foundation-consistency-matrix.json`
- `rtk git diff --check`
- `rtk git status --short --branch`
- package guard:
  - `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

If tests or source files are changed:

- run focused tests for touched areas
- run `rtk npm run verify:result-contract` if result semantics or result tests are touched
- run `rtk npm run verify:edit-capability-closeout` if edit/workspace stopped behavior is touched
- run `rtk npm run build -w packages/ts-shell`
- run runMvp only if orchestration/session runtime behavior is touched

Package sweep is not required by default. Escalate only if product source changes are broad or focused gates reveal unexplained failures.

## Completion report

Final report should include:

1. Branch and base commit
2. Files changed
3. Foundation areas audited
4. Matrix summary
5. Contradictions found
6. Suspect or deferred risks
7. Fixes made, if any
8. Validation tier used and why package sweep was or was not run
9. Validation commands and results
10. Real-provider gate status
11. External MCP status
12. Audit/history residue handling
13. Source/package change confirmation
14. Best next action
15. Proposed commit message

Do not commit or push.
