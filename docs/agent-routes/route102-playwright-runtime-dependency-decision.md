# Route 102: Playwright runtime dependency decision and explicit runner policy

## Goal

Decide and harden the Playwright runtime dependency strategy after Route 101.

Route 101 added:

- Playwright availability model
- Playwright local evidence model
- Playwright lifecycle model
- Playwright local executor
- CLI manifest support for executorMode: "playwright-local"
- deterministic unavailable behavior when Playwright runtime is absent
- real CLI scenarios for default blocked / unavailable / external blocked paths

Route 102 should answer and implement the next dependency boundary:

- Should this project declare Playwright as a runtime dependency?
- Should Playwright remain an external explicit runner?
- Should it be a dev/test-only dependency?
- Should it be a future Skill/CLI tool dependency rather than a package dependency?
- How should browser execution report runtime availability, missing dependency, and external runner configuration?

This route should be opinionated and produce a stable policy. It may add minimal code to enforce that policy, but must not accidentally enable default browser execution.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/real-playwright-local-only-execution.md
- docs/design/cli-browser-executor-injection-bridge.md
- docs/design/playwright-cli-real-execution-opt-in.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- no Playwright dependency is declared
- package/package-lock/scripts were not changed by Route 101
- Playwright local executor returns unavailable unless checker/runner is injected
- CLI local fixture manifest injection exists
- real Playwright execution remains unavailable by default
- external network remains blocked
- default browser execution remains blocked

## Reference scan

Use docs/agent-routes/REFERENCE_SCAN_POLICY.md.

Primary browser/runtime references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional only if present:

- Playwright CLI: /home/wang/projects/playwright-cli
- browser-use: /home/wang/projects/browser-use
- Playwright repo: /home/wang/projects/playwright

Budget:

- Playwright MCP / optional Playwright repo or CLI: at most 8 files total
- Stagehand: at most 5 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use: at most 3 files if present
- total default budget: 28 files
- exceed by 2 only for directly relevant dependency/runtime/tool-runner files

Focus:

Playwright MCP / optional Playwright repo:

- package dependency model
- browser install/runtime requirements
- CLI/server separation
- browser binary lifecycle
- external tool invocation
- accessibility snapshot evidence

Stagehand:

- dependency/runtime boundary
- local browser runtime expectations
- AI action versus deterministic browser execution
- runtime availability handling

OpenHands:

- optional tool/runtime dependencies
- sandbox/browser runtime setup
- local/remote execution boundary
- action evidence/status when runtime missing

Inspect AI:

- optional sandbox/tool dependencies
- dependency availability reporting
- skipped/unavailable eval behavior
- report/scorer separation

mini-swe-agent:

- minimal dependency philosophy
- external command/tool runner configuration
- trajectory evidence when a tool is unavailable

Coding-agent baselines:

- dependency discipline
- package boundary
- CLI tool availability checks
- optional command runner patterns
- blocked/unavailable output

Answer in docs/design/playwright-runtime-dependency-decision.md:

1. Should Playwright be declared as a dependency now?
2. If yes, where and why: package dependency, devDependency, optional peer, or workspace-local tool?
3. If no, what explicit runner injection policy replaces it?
4. How should runtime availability be surfaced to users, CLI reports, sidebar, and harness?
5. What must remain blocked until browser binary/install policy is solved?
6. What should Route 103 own?

## This route changes

Allowed:

- docs/design/playwright-runtime-dependency-decision.md
- docs/design/real-playwright-local-only-execution.md, Route 102 note only
- docs/design/cli-browser-executor-injection-bridge.md, Route 102 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 102 note only
- docs/design/real-cli-scenario-harness.md, Route 102 note only
- docs/design/agent-scenario-harness-foundation.md, Route 102 note only
- docs/design/context-engineering-continuity-baseline.md, Route 102 note only
- docs/design/edit-capability-roadmap.md, concise Route 102 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- focused tests for touched modules

Conditionally allowed only if the design decision explicitly justifies it:

- package.json
- package-lock.json

Strong preference:

- avoid dependency changes in Route 102 unless the project already has a clear dependency policy and tests prove no default browser execution is enabled
- if dependency change is needed, keep it minimal and document why external runner injection is insufficient

Preferred new files:

- packages/ts-shell/src/core/context/browserRuntimeDependencyPolicy.ts
- packages/ts-shell/src/core/context/browserExternalRunnerPolicy.ts
- packages/ts-shell/src/core/context/browserRuntimeAvailabilitySurface.ts

Allowed if clean:

- strengthen Playwright availability reporting
- add external runner policy
- add manifest support for external runner availability without enabling execution by default
- add CLI scenario coverage for dependency policy states
- add sidebar status for runtime dependency state
- improve unavailable/runtime-missing reports

## This route must preserve

Route-specific boundaries:

- no default browser execution
- no external network
- no MCP server launch or dynamic MCP discovery
- no provider/model calls
- no persistent browser session
- no auth/payment/destructive actions
- no file upload/download
- no screenshot/OCR capture
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw page content/secrets/hidden reasoning in output
- dependency decision must not silently enable browser execution

If package files are touched, final report must explicitly justify:

- what changed
- why it is necessary
- why it does not enable default browser execution
- how it affects install/runtime footprint
- how it is validated

## Tasks

### 1. Design and audit

Create docs/design/playwright-runtime-dependency-decision.md.

Include:

- Route 102 reference scan summary
- Route 101 runtime availability result
- current package/dependency audit
- dependency options:
- no dependency / external runner only
- devDependency
- dependency
- optional peer/external tool
- Skill/CLI-managed runner
- recommendation
- implementation changes made
- user-facing runtime availability model
- CLI/harness/sidebar reporting model
- future route boundary
- package-change decision

The design must be explicit and opinionated.

### 2. Audit current package/runtime state

Inspect:

- root package.json
- packages/ts-shell/package.json
- package-lock.json if present
- existing test/dev dependency patterns
- existing command/runtime dependency patterns
- existing optional tool patterns
- existing browser/playwright references

Document:

- whether Playwright is already installed
- whether package changes would be required
- whether browser binary install would be required
- whether external runner is safer
- whether a Skill/CLI-managed runner is preferable

Do not install packages.

### 3. Add runtime dependency policy

Add packages/ts-shell/src/core/context/browserRuntimeDependencyPolicy.ts.

Expected concepts:

- BrowserRuntimeDependencyPolicy
- BrowserRuntimeDependencyMode:
- external-runner-only
- dev-dependency
- package-dependency
- optional-peer
- skill-managed
- unavailable
- BrowserRuntimeDependencyDecision
- BrowserRuntimeDependencyReason
- BrowserRuntimeDependencyRisk
- BrowserRuntimeDependencyNextAction

Policy should evaluate:

- dependency footprint
- browser binary footprint
- install complexity
- sandboxability
- explicit runner compatibility
- harness compatibility
- user UX
- CI/test determinism
- package governance risk

Required behavior:

- deterministic decision
- no package mutation
- no runtime execution
- no provider/model call

Add focused tests.

### 4. Add external runner policy

Add packages/ts-shell/src/core/context/browserExternalRunnerPolicy.ts.

Policy should define how an externally provided Playwright/local runner can be used.

Expected concepts:

- BrowserExternalRunnerConfig
- BrowserExternalRunnerSource:
- cli-harness-manifest
- explicit-local-config
- skill-managed
- disabled
- BrowserExternalRunnerDecision:
- allowed
- blocked-missing-config
- blocked-unsafe-source
- blocked-unsupported-mode
- future-skill-required
- required fields:
- runner id
- executor mode
- fixture scope
- sandbox authority
- allowlist
- evidence redaction mode

Required behavior:

- disabled by default
- only explicit local/test sources allowed
- no external network
- no default global runner path
- redacted errors
- no process spawn in policy

Add focused tests.

### 5. Add runtime availability surface

Add packages/ts-shell/src/core/context/browserRuntimeAvailabilitySurface.ts.

Surface should render:

- Browser runtime dependency
- Decision
- Availability
- External runner policy
- Current mode
- Browser execution default: disabled
- Next action
- Risks / blockers

It should be concise and user-facing.

Add focused tests.

### 6. Integrate availability/dependency policy into browser status

Update browserCapabilitySurface / browserCommandRunner if clean.

Required behavior:

- /browser or /browser status shows runtime dependency decision and availability
- /browser execute unavailable output includes dependency policy summary
- /browser dry-run can mention runtime dependency policy if useful
- no default execution enabled
- no provider/model calls

Add focused tests.

### 7. Integrate with manifest / CLI bridge

Update browserCliExecutorInjection / browserCliExecutionBridge if clean.

Required behavior:

- manifest-driven external runner/local fixture modes are evaluated through external runner policy
- invalid or unsafe external runner source is blocked
- missing dependency is reported clearly
- local fixture executor remains working
- playwright-local unavailable path remains deterministic
- no default runner path

Add focused tests.

### 8. Sidebar and harness integration

Update sidebar event/status if clean.

Required behavior:

- browser runtime dependency state appears in sidebar Tools/browser status if provided
- unavailable/runtime-missing browser execution event includes concise reason
- CLI scenario report includes dependency decision summary

Add focused tests.

Add or update CLI/harness scenarios:

1. /browser status shows runtime dependency policy
2. /browser execute observe local-fixture://demo with playwright-local unavailable reports dependency decision
3. local-fixture mode still succeeds when explicit local fixture executor is used
4. default path remains blocked

### 9. Conditional package decision

If and only if the design decides to add Playwright dependency:

- update package files minimally
- explain why dependency is required now
- prove browser execution remains non-default
- do not add package scripts/default gates
- do not install browser binaries unless already covered by existing dependency policy
- add tests proving no default browser execution

If the design decides not to add dependency:

- explicitly document external-runner-only / skill-managed decision
- improve unavailable output and next action
- do not touch package files

### 10. Tests

Required focused tests:

- dependency policy recommends chosen mode
- policy explains why other modes are deferred
- external runner policy blocks missing config
- external runner policy allows explicit local/test config
- runtime availability surface redacts unsafe details
- /browser status includes dependency policy
- unavailable playwright-local output includes dependency decision
- local-fixture executor path remains unaffected
- real CLI scenario covers unavailable/dependency decision output
- no package changes unless explicitly justified
- no provider/model/browser/MCP/network side effects

### 11. Docs and roadmap update

Update:

- docs/design/playwright-runtime-dependency-decision.md with final notes
- docs/design/real-playwright-local-only-execution.md with Route 102 note
- docs/design/cli-browser-executor-injection-bridge.md with Route 102 note
- docs/design/browser-sandbox-network-allowlist.md with Route 102 note
- docs/design/real-cli-scenario-harness.md with Route 102 note
- docs/design/agent-scenario-harness-foundation.md with Route 102 note
- docs/design/context-engineering-continuity-baseline.md with Route 102 note
- docs/design/edit-capability-roadmap.md with concise status and Route 103 recommendation

Recommended next route:

- Route 103: browser external runner / skill-managed execution bridge
- if dependency policy chooses external-runner-only or skill-managed
- or Route 103: browser execution evidence/report hardening
- if runtime dependency decision is complete but execution evidence needs polish
- or Route 103: Playwright dependency integration
- only if Route 102 explicitly decides package dependency is acceptable
- or Route 103: browser action cache/replay design
- if execution should remain local but repeatability is next

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
- focused tests for touched harness modules
- real CLI scenario tests touched by this route
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.
Do not install packages.

If package files are touched, run the minimal existing package validation needed to prove lock/package consistency, but do not add package scripts.

## Stop conditions

Stop and report if:

- dependency decision requires package install
- browser binary install becomes necessary
- package policy is unclear
- default browser execution would become enabled
- external network becomes necessary
- MCP server launch becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- broad CLI lifecycle rewrite becomes necessary
- raw dependency config/secrets would appear in output
- package changes would be larger than a minimal dependency declaration

## Final report

1. What changed
2. Reference scan summary
3. Package/runtime audit
4. Dependency decision
5. Package files touched? If yes, why
6. CLI/harness scenarios
7. Validation
8. Boundaries preserved
9. Residue cleanup
10. Risks / blockers
11. Next route recommendation
12. Proposed commit message

Do not commit or push.
