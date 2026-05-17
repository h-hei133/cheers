# Route 98: real CLI scenario harness

## Goal

Add a real CLI scenario harness that can run selected agent commands through a child process and capture process-level evidence.

Route 95 added in-process Agent Scenario Harness foundation.
Route 96 added non-default browser execution seam.
Route 97 added browser sandbox / allowlist / confirmation preflight gates.

Route 98 should add the missing process-spawn evidence layer before real browser execution:

- spawn the project CLI in controlled test scenarios
- feed command-only prompts where possible
- capture stdout / stderr / exit code / timing / status
- verify command output and safety claims from the real CLI path
- produce structured CLI scenario reports
- integrate with existing harness assertions and safety checks
- add scenarios for `/browser`, `/browser dry-run`, `/browser execute` blocked, `/sidebar`, `/warmup`, and memory/compact command surfaces if clean

This route must not call real providers, launch browsers, perform network access, or change production CLI lifecycle.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/playwright-cli-non-default-browser-execution.md
- docs/design/browser-runtime-decision-dry-run-harness.md
- docs/design/sidebar-live-panel-runtime-experiment.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- in-process scenario harness exists
- browser sandbox gates exist
- `/browser execute` is blocked unless gates/executor allow
- no real CLI scenario harness exists
- no process-spawn evidence layer exists
- real browser execution remains unavailable

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent
- OpenHands: /home/wang/projects/OpenHands

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Browser/sandbox context references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp

Budget:

- Inspect AI: at most 7 files
- mini-swe-agent: at most 7 files
- OpenHands: at most 5 files
- opencode/gemini-cli/ClaudeCode combined: at most 6 files
- Stagehand/Playwright MCP combined: at most 4 files
- total default budget: 29 files
- exceed by 2 only for directly relevant CLI harness / subprocess / transcript / trajectory files

Focus:

Inspect AI:

- eval runner
- transcript/log capture
- sandbox separation
- scorer/assertion/report patterns
- tool-use eval process boundaries

mini-swe-agent:

- CLI/task runner
- subprocess/tool execution
- trajectory capture
- failure handling
- minimal harness architecture

OpenHands:

- session events
- action/observation logs
- CLI/SDK separation
- process/tool result evidence

opencode / gemini-cli / ClaudeCode:

- CLI baseline tests
- command spawn tests
- print/non-interactive mode
- status/result rendering
- session continuity tests

Stagehand / Playwright MCP:

- browser command evidence expectations
- status/dry-run before execution
- tool execution safety framing

Answer in docs/design/real-cli-scenario-harness.md:

1. What should be borrowed from Inspect AI for reports/assertions?
2. What should be borrowed from mini-swe-agent for CLI trajectories?
3. What should be borrowed from OpenHands for action/observation evidence?
4. Which commands are safe enough for real CLI harness now?
5. How should process-level failures be reported?
6. What should Route 99 own before real Playwright execution?

## This route changes

Allowed:

- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md, Route 98 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 98 note only
- docs/design/playwright-cli-non-default-browser-execution.md, Route 98 note only
- docs/design/context-engineering-continuity-baseline.md, Route 98 note only
- docs/design/edit-capability-roadmap.md, concise Route 98 update only
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/harness/agentCliScenarioModel.ts
- packages/ts-shell/src/core/harness/agentCliProcess.ts
- packages/ts-shell/src/core/harness/agentCliScenarioRunner.ts
- packages/ts-shell/src/core/harness/agentCliScenarioAssertions.ts
- packages/ts-shell/src/core/harness/agentCliScenarioReport.ts
- packages/ts-shell/src/core/harness/agentCliScenarioExamples.test.ts

Allowed if clean:

- use existing CLI entrypoint path in tests
- spawn Node/tsx CLI in a controlled test harness
- use temp project roots
- use explicit no-provider / command-only prompts
- reuse safety assertions from Route 95
- reuse sidebar/browser/memory/warmup command scenarios
- add small test-only helpers for stable env vars

## This route must preserve

Route-specific boundaries:

- no real provider/model calls
- no real browser launch
- no Playwright/MCP launch
- no network access
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes beyond temp harness stores
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in CLI reports
- no broad package tests
- harness must not become a second runtime

## Tasks

### 1. Design and audit

Create docs/design/real-cli-scenario-harness.md.

Include:

- Route 98 reference scan summary
- Route 95 in-process harness baseline
- CLI process harness goals
- safe command-only scenario boundary
- process evidence model
- stdout/stderr/exit/timing/report model
- temp project root / environment strategy
- no-provider/no-browser/no-network boundary
- future real browser execution validation plan
- next-route decision criteria

### 2. Add CLI scenario model

Add packages/ts-shell/src/core/harness/agentCliScenarioModel.ts.

Expected concepts:

- AgentCliScenario
- AgentCliScenarioStep
- AgentCliCommandStep
- AgentCliProcessSpec
- AgentCliProcessResult
- AgentCliScenarioResult
- AgentCliScenarioStatus:
  - passed
  - failed
  - blocked
  - skipped
- AgentCliExpectedExit
- AgentCliOutputCapture

Required behavior:

- pure types/helpers
- deterministic ids/timestamps if helper logic exists
- no process spawn in model file

Add focused tests if helper logic exists.

### 3. Add process spawn wrapper

Add packages/ts-shell/src/core/harness/agentCliProcess.ts.

Wrapper should:

- spawn the project CLI through Node/tsx path or existing test helper if available
- capture stdout/stderr
- capture exit code/signal
- enforce timeout
- pass controlled env
- support stdin/prompt input if needed
- support working directory / temp project root
- return structured process evidence

Required behavior:

- no provider/model credentials passed through by default
- disable real provider paths via env if project has such switches
- no browser/network side effects
- clear timeout handling
- deterministic enough for tests
- no broad CLI lifecycle changes

Add focused tests using harmless command-only path if feasible.

### 4. Add CLI scenario runner

Add packages/ts-shell/src/core/harness/agentCliScenarioRunner.ts.

Runner should:

- execute one or more CLI steps
- run assertions after each step or at end
- stop on failed critical step
- collect process evidence
- collect safety checks
- produce AgentCliScenarioResult
- reuse Route 95 safety assertions where possible

Required behavior:

- no provider/model call
- no browser launch
- no persistent state except temp dirs
- no command behavior changes

Add focused tests.

### 5. Add CLI assertions

Add packages/ts-shell/src/core/harness/agentCliScenarioAssertions.ts.

Assertions should include:

- exit code is expected
- stdout contains
- stdout does not contain
- stderr contains / does not contain
- output has section
- output line count under budget
- command says Executed: no when expected
- browser execution blocked when expected
- sidebar panel/watch output exists
- no raw content/secrets
- no provider/model/browser launch evidence

Add focused tests.

### 6. Add CLI report renderer

Add packages/ts-shell/src/core/harness/agentCliScenarioReport.ts.

Report should include:

- scenario id/name
- steps
- command args / prompt summary
- exit code/signal
- stdout/stderr summary
- assertions passed/failed
- safety checks
- timeout info
- blockers
- next action
- redactions

Keep output concise and deterministic.

Add focused tests.

### 7. Add initial real CLI scenarios

Add packages/ts-shell/src/core/harness/agentCliScenarioExamples.test.ts.

Required examples if clean:

1. browser dry-run through real CLI

- run command-only prompt for `/browser dry-run navigate https://example.com`
- assert Executed: no
- assert dry-run/browser plan appears
- assert no browser launch/network claim

2. browser execute blocked through real CLI

- run `/browser execute navigate https://example.com`
- assert blocked/no executor or sandbox gate
- assert Executed: no
- assert no browser launch/network claim

3. sidebar panel through real CLI

- run `/sidebar panel`
- assert panel output exists
- assert no raw/secrets

4. warmup status through real CLI

- run `/warmup status` if command path works without explicit cache root
- assert safe missing/disabled status

Optional if clean:

5. compact command preview through real CLI

- only if no provider/model call is required

6. memory default review through real CLI

- only if command can run without external stores/providers

If real CLI invocation requires heavy setup, implement the process wrapper and one minimal CLI command scenario, document blockers, and recommend a follow-up.

### 8. Bridge with in-process scenario harness if clean

Add adapters or docs showing how CLI scenario results relate to Route 95 scenario reports.

Do not merge the two runners if it would create coupling.

Desired behavior:

- shared safety assertions
- shared report shape where reasonable
- CLI reports can be referenced by future browser execution routes

### 9. Docs and roadmap update

Update:

- docs/design/real-cli-scenario-harness.md with final notes
- docs/design/agent-scenario-harness-foundation.md with Route 98 note
- docs/design/browser-sandbox-network-allowlist.md with Route 98 note
- docs/design/playwright-cli-non-default-browser-execution.md with Route 98 note
- docs/design/context-engineering-continuity-baseline.md with Route 98 note
- docs/design/edit-capability-roadmap.md with concise status and Route 99 recommendation

Recommended next route:

- Route 99: Playwright CLI real execution opt-in with sandbox/allowlist
  - if CLI harness can prove blocked/safe paths
- or Route 99: CLI scenario harness polish
  - if real CLI setup is partial
- or Route 99: browser execution sandbox lifecycle hardening
  - if process evidence surfaces new safety gaps

## Validation

Route-specific final validation:

- focused tests for touched core/harness modules
- focused tests for command/context modules if touched
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.

If CLI scenario tests reveal unrelated existing CLI failures, narrow to the safe subset and document the blocker.

## Stop conditions

Stop and report if:

- CLI harness requires provider/model calls
- CLI harness requires real browser launch
- CLI harness requires network access
- CLI harness requires SessionManager schema changes
- CLI harness requires broad cli.tsx rewrite
- command-only CLI path is not available without heavy setup
- process-spawn tests are flaky or non-deterministic
- raw content/secrets would need to appear in reports
- harness becomes a second runtime implementation

## Final report

1. What changed
2. Reference scan summary, including Inspect AI and mini-swe-agent
3. CLI scenarios implemented
4. Validation
5. Boundaries preserved
6. Residue cleanup
7. Risks / blockers
8. Next route recommendation
9. Proposed commit message

Do not commit or push.
