# Route 95: agent scenario harness foundation

## Goal

Create a reusable Agent Scenario Harness foundation.

The project now has many strong capability slices:

- edit closeout
- Compact v2
- project memory candidate/review/store/recall/invalidate/use
- startup warm cache
- sidebar state/event/panel/watch
- browser preview/dry-run boundary

But validation is still mostly focused tests and capability-specific scripts. Route 95 should add a shared scenario harness that can run multi-step agent scenarios across these systems and produce structured evidence.

This route should add:

- scenario model
- scenario step model
- scenario runner
- harness fixtures
- safety assertions
- output assertions
- evidence report
- example scenarios covering compact/memory/sidebar/browser dry-run
- no provider/model calls
- no real browser execution
- no production behavior changes

This should become the foundation for future routes: browser runtime, sandbox, memory ranking, startup behavior, sidebar UI, and long-session regressions.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-runtime-decision-dry-run-harness.md
- docs/design/sidebar-live-panel-runtime-experiment.md
- docs/design/memory-injection-quality-merge-hardening.md
- docs/design/startup-warm-context-cache.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- capability-specific focused tests exist
- verify:edit-capability-closeout exists
- verify:result-contract exists
- no unified agent scenario harness exists
- no scenario evidence report exists
- no cross-capability harness layer exists

## Reference pool update

Update `docs/agent-routes/REFERENCE_SCAN_POLICY.md` to include the new harness references.

Add:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Document them under a new category such as:

- harness / eval / scenario references

Guidance:

- Inspect AI is primary for task/eval/log/scorer architecture.
- mini-swe-agent is primary for compact coding-agent trajectory harness.
- Use them when a route touches scenario regression, eval harness, task runner, long-horizon behavior, or agent QA.
- Do not scan them for unrelated routes.

Keep the policy stable and not tied to Route 95-specific state.

## Reference scan

Use the expanded reference pool.

Primary references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent
- OpenHands: /home/wang/projects/OpenHands

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Inspect AI: at most 8 files
- mini-swe-agent: at most 7 files
- OpenHands: at most 5 files
- opencode/gemini-cli/ClaudeCode combined: at most 6 files
- total default budget: 26 files
- exceed by 2 only for directly relevant harness / trajectory / scenario / event-log files

Focus:

Inspect AI:

- task/eval definition
- solver / scorer / sample
- multi-turn dialog
- tool usage
- logging / transcript / evidence
- sandbox separation
- evaluation report

mini-swe-agent:

- task runner
- agent loop
- tool trajectory
- repo/environment setup
- command execution abstraction
- result/report format
- minimal architecture boundaries

OpenHands:

- event store
- session events
- action/observation
- agent state
- activity/evidence surface
- eval infrastructure if visible

opencode / gemini-cli / ClaudeCode:

- command/session regression tests
- CLI harness patterns
- tool result summaries
- compact/session continuity tests
- status/sidebar-like output

Answer in docs/design/agent-scenario-harness-foundation.md:

1. What concepts should be borrowed from Inspect AI?
2. What concepts should be borrowed from mini-swe-agent?
3. What should this project’s scenario model look like?
4. What should be a scenario step versus assertion versus report?
5. How should the harness avoid provider/model/browser/runtime side effects?
6. What should remain deferred until real CLI/browser/sandbox harness routes?

## This route changes

Allowed:

- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/browser-runtime-decision-dry-run-harness.md, Route 95 note only
- docs/design/sidebar-live-panel-runtime-experiment.md, Route 95 note only
- docs/design/context-engineering-continuity-baseline.md, Route 95 note only
- docs/design/edit-capability-roadmap.md, concise Route 95 update only
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- focused tests for touched modules

Preferred new directory:

- packages/ts-shell/src/core/harness/

Preferred new files:

- packages/ts-shell/src/core/harness/agentScenarioModel.ts
- packages/ts-shell/src/core/harness/agentScenarioRunner.ts
- packages/ts-shell/src/core/harness/agentScenarioFixtures.ts
- packages/ts-shell/src/core/harness/agentScenarioAssertions.ts
- packages/ts-shell/src/core/harness/agentScenarioReport.ts
- packages/ts-shell/src/core/harness/agentScenarioSafety.ts
- packages/ts-shell/src/core/harness/agentScenarioExamples.test.ts

Allowed if clean:

- reuse existing command runtimes through harness adapters
- use in-memory project memory store fixtures
- use sidebar event store fixtures
- use compact/memory/warmup/browser command outputs as scenario steps
- create a fake normal-turn step that exercises injection plumbing without provider/model call
- add local test-only harness fixtures

## This route must preserve

Route-specific boundaries:

- no provider/model calls
- no real browser execution
- no Playwright/MCP launch
- no network access
- no real edit execution beyond existing test fixtures
- no production runtime behavior changes
- no package script/default gate changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no persistent harness state
- no raw content/secrets/hidden reasoning in harness reports
- no broad test-suite rewrite
- harness must be deterministic and focused

## Tasks

### 1. Design and audit

Create docs/design/agent-scenario-harness-foundation.md.

Include:

- Route 95 reference scan summary
- current validation/test landscape
- scenario harness goals
- scenario model
- step model
- assertion model
- safety model
- report/evidence model
- fixture strategy
- no-provider/no-browser/no-production-side-effect boundary
- future routes:
  - real CLI scenario harness
  - browser runtime harness
  - sandbox harness
  - long-session benchmark harness
  - output quality harness

### 2. Add scenario model

Add packages/ts-shell/src/core/harness/agentScenarioModel.ts.

Expected concepts:

- AgentScenario
- AgentScenarioStep
- AgentScenarioStepKind:
  - command
  - simulated-user-turn
  - assertion
  - fixture
  - checkpoint
- AgentScenarioCommandStep
- AgentScenarioUserTurnStep
- AgentScenarioAssertionStep
- AgentScenarioExpectedOutcome
- AgentScenarioContext
- AgentScenarioResult
- AgentScenarioStatus:
  - passed
  - failed
  - blocked
  - skipped

Required behavior:

- pure types/helpers
- deterministic ids/timestamps when helper logic exists
- no runtime execution in model file

Add focused tests if helpers exist.

### 3. Add scenario fixtures

Add packages/ts-shell/src/core/harness/agentScenarioFixtures.ts.

Fixtures should provide safe in-memory/test inputs for:

- compact command context
- memory candidate/review/store context
- warmup cache context
- sidebar event store
- browser preview/dry-run context
- fake normal-turn injection context
- validation evidence
- route/task metadata

Required behavior:

- no provider/model calls
- no browser execution
- no network
- temp/local stores only where existing APIs require explicit path
- deterministic clocks/ids
- no raw secrets

Add focused tests if helper logic exists.

### 4. Add scenario runner

Add packages/ts-shell/src/core/harness/agentScenarioRunner.ts.

Runner should:

- execute scenario steps deterministically
- support command steps through existing local command runtimes if clean
- support simulated user-turn step without provider/model call
- capture outputs
- capture sidebar events
- capture compact/memory/warmup/browser state if available
- stop on failed assertion unless scenario says continue
- return structured AgentScenarioResult

Required behavior:

- no provider/model calls
- no real browser execution
- no production side effects
- no persistent state unless explicit temp fixture
- no command behavior changes

Add focused tests.

### 5. Add assertions

Add packages/ts-shell/src/core/harness/agentScenarioAssertions.ts.

Assertions should include:

- output contains text
- output does not contain text
- output has section
- output line count under budget
- scenario emitted sidebar event
- compact injected once
- memory injected once
- memory record saved
- invalidated/deleted memory excluded
- browser dry-run says Executed: no
- next action exists
- validation status exists

Assertions should produce clear failure messages.

Add focused tests.

### 6. Add safety assertions

Add packages/ts-shell/src/core/harness/agentScenarioSafety.ts.

Safety checks should include:

- no raw content marker
- no secret-looking content
- no hidden reasoning marker
- no provider credential
- no automatic recovery claim unless expected
- no atomic rollback claim unless expected
- no browser executed claim unless expected
- no memory auto-injection claim unless expected
- no startup auto-load claim unless expected

This should be reusable by future scenario tests.

Add focused tests.

### 7. Add scenario report

Add packages/ts-shell/src/core/harness/agentScenarioReport.ts.

Report should include:

- scenario id/name
- status
- steps run
- outputs summary
- assertions passed/failed
- safety checks
- sidebar events summary
- compact/memory/warmup/browser evidence summary
- blockers
- next action
- redactions

Renderer should be concise and deterministic.

Add focused tests.

### 8. Add initial scenario examples

Add packages/ts-shell/src/core/harness/agentScenarioExamples.test.ts.

Required scenario examples:

1. compact + memory + sidebar continuity

- run `/compact`
- run simulated normal turn
- review memory candidates
- approve/save one candidate
- recall memory
- use memory
- run simulated normal turn
- render `/sidebar panel`
- assert compact and memory injection are one-shot
- assert sidebar activity exists
- assert next action exists
- assert no raw/secrets

2. memory lifecycle safety

- save approved memory
- recall it
- invalidate or delete it
- recall/wake again
- assert invalidated/deleted record excluded

3. browser dry-run visibility

- run `/browser dry-run navigate <url>`
- render `/sidebar`
- assert browser event appears
- assert Executed: no
- assert no browser execution claim

4. warmup cache preview

- rebuild warmup with explicit temp harness root
- render `/warmup status`
- render `/sidebar panel`
- assert warmup status appears
- assert injected into model: no

If any scenario is too coupled, implement the subset that is clean and document blockers.

### 9. Optional command/runtime adapter

If clean, add a small adapter that lets harness invoke local slash command runtimes without CLI process spawn.

Do not spawn real CLI in this route.
Do not rewrite CLI command bridge.

If command adapter is too coupled, use direct command runners and document future real CLI harness route.

### 10. Docs and roadmap update

Update:

- docs/design/agent-scenario-harness-foundation.md with final notes
- docs/design/browser-runtime-decision-dry-run-harness.md with Route 95 note
- docs/design/sidebar-live-panel-runtime-experiment.md with Route 95 note
- docs/design/context-engineering-continuity-baseline.md with Route 95 note
- docs/design/edit-capability-roadmap.md with concise status and Route 96 recommendation

Recommended next route:

- Route 96: Playwright CLI/Skills non-default execution prototype
  - if harness foundation is stable
- or Route 96: real CLI scenario harness
  - if direct command harness exists but spawn/CLI verification is next
- or Route 96: sandbox harness foundation
  - if browser execution should wait for sandbox coverage

## Validation

Route-specific final validation:

- focused tests for touched core/harness modules
- focused tests for command/context modules touched by adapters
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.

If broad src/core/shell or src/session paths expose unrelated failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- harness requires provider/model calls
- harness requires real browser execution
- harness requires CLI lifecycle rewrite
- harness requires SessionManager schema changes
- scenario runner becomes a second runtime implementation
- raw content/secrets would appear in reports
- cross-capability scenario examples become too coupled for this route
- broad package tests become necessary

## Final report

1. What changed
2. Reference scan summary, including Inspect AI and mini-swe-agent
3. Scenario examples implemented
4. Validation
5. Boundaries preserved
6. Residue cleanup
7. Risks / blockers
8. Next route recommendation
9. Proposed commit message

Do not commit or push.
