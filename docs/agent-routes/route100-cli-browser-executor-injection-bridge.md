# Route 100: CLI browser executor injection bridge for local-fixture execution

## Goal

Bridge Route 99 local-fixture browser execution into the real CLI scenario harness.

Route 99 added:

- non-default local-fixture browser execution
- local execution authority
- deterministic local fixture model
- Playwright CLI executor seam
- local fixture executor
- evidence redaction
- lifecycle surface
- sidebar/scenario harness coverage
- real CLI blocked-path scenario

Remaining Route 99 blocker:

- local-fixture executor cannot yet be injected through the real CLI child-process harness without unsafe lifecycle/authority changes.

Route 100 should add a safe CLI executor injection bridge:

- real CLI child process can receive explicit local-fixture browser executor configuration
- local-fixture execution can run through `/browser execute ...` in real CLI scenario tests
- injection is test/harness explicit
- default CLI behavior remains blocked
- no real browser launch
- no network access
- no provider/model call
- no SessionManager schema changes
- no broad CLI lifecycle rewrite

This route should prove the real CLI path can execute the same local-fixture browser action as the in-process harness, with sanitized evidence and sidebar activity.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/playwright-cli-real-execution-opt-in.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/playwright-cli-non-default-browser-execution.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- local-fixture browser execution works in-process with explicit injected executor/authority
- default real CLI `/browser execute ...` remains blocked
- real CLI harness exists
- real CLI local-fixture executor injection does not exist yet
- real browser execution remains unavailable

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- mini-swe-agent: /home/wang/projects/mini-swe-agent
- Inspect AI: /home/wang/projects/inspect_ai
- OpenHands: /home/wang/projects/OpenHands

Browser/tooling references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- mini-swe-agent: at most 7 files
- Inspect AI: at most 7 files
- OpenHands: at most 5 files
- Stagehand + Playwright MCP: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- total default budget: 30 files
- exceed by 2 only for directly relevant CLI injection / tool fixture / process harness files

Focus:

mini-swe-agent:

- CLI trajectory setup
- task configuration injection
- command environment setup
- tool executor abstraction
- process evidence

Inspect AI:

- sandbox/tool configuration
- eval fixture injection
- transcript/log capture
- explicit tool-use environment
- scorer/assertion separation

OpenHands:

- action/observation configuration
- runtime/tool injection
- session event evidence
- local execution status surface

Stagehand:

- local action execution boundary
- preview-to-execute handoff
- action result evidence

Playwright MCP:

- browser tool configuration
- server/tool availability boundary
- action evidence shape
- statefulness risk

Coding-agent baselines:

- CLI spawn tests
- environment gating
- test-only runtime config
- blocked/default behavior
- status/result rendering

Answer in docs/design/cli-browser-executor-injection-bridge.md:

1. What is the safest way to inject test/local executors into a real CLI child process?
2. Should injection use env, temp manifest, command harness context, or explicit test-only config?
3. How do references keep tool configuration explicit and auditable?
4. What evidence must the CLI scenario report prove?
5. What must remain blocked until real Playwright execution?
6. What should Route 101 own?

## This route changes

Allowed:

- docs/design/cli-browser-executor-injection-bridge.md
- docs/design/playwright-cli-real-execution-opt-in.md, Route 100 note only
- docs/design/real-cli-scenario-harness.md, Route 100 note only
- docs/design/agent-scenario-harness-foundation.md, Route 100 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 100 note only
- docs/design/sidebar-live-event-capture.md, Route 100 note only
- docs/design/context-engineering-continuity-baseline.md, Route 100 note only
- docs/design/edit-capability-roadmap.md, concise Route 100 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserCliExecutorInjection.ts
- packages/ts-shell/src/core/context/browserLocalFixtureManifest.ts
- packages/ts-shell/src/core/context/browserCliExecutionBridge.ts
- packages/ts-shell/src/core/harness/browserCliScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserCliExecutionScenarioExamples.test.ts

Allowed if clean:

- add explicit test/harness env var for local browser fixture manifest
- add temp manifest support in real CLI scenario harness
- add command runtime adapter that reads explicit safe fixture manifest
- add CLI scenario coverage for local-fixture execution success
- add sidebar event assertion through real CLI path
- extend CLI scenario report with browser execution evidence summary

## This route must preserve

Route-specific boundaries:

- no default browser execution
- no real Playwright process launch
- no MCP server launch or dynamic MCP discovery
- no external network
- no browser session persistence
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no auth/payment/destructive actions
- no file upload/download
- no arbitrary JavaScript execution
- no screenshot/OCR capture
- no raw content/secrets/hidden reasoning in CLI fixture manifest or reports
- CLI executor injection must be explicit, local, test/harness scoped, and auditable

## Tasks

### 1. Design and audit

Create docs/design/cli-browser-executor-injection-bridge.md.

Include:

- Route 100 reference scan summary
- Route 99 blocker and current behavior
- injection mechanism decision
- fixture manifest model
- CLI child-process environment strategy
- authority/allowlist/confirmation mapping
- evidence model
- sidebar event model
- safety/redaction model
- why real Playwright remains deferred
- Route 101 recommendation

The design should be opinionated. Prefer an explicit temp manifest + env pointer if it is the safest and least invasive path.

### 2. Add local fixture manifest model

Add packages/ts-shell/src/core/context/browserLocalFixtureManifest.ts.

Expected concepts:

- BrowserLocalFixtureManifest
- BrowserLocalFixtureManifestVersion
- fixture entries
- sandbox authority entries
- allowlist entries
- confirmation entries
- executor mode:
  - local-fixture
  - fake-test
- manifest source:
  - cli-harness
  - test-only
- redactions
- warnings

Required behavior:

- validate manifest shape
- reject raw secrets
- reject raw HTML unless safely summarized
- reject external-network execution mode
- reject auth/payment/destructive capability
- deterministic serialization for tests
- no process/browser execution

Add focused tests.

### 3. Add CLI executor injection loader

Add packages/ts-shell/src/core/context/browserCliExecutorInjection.ts.

Loader should:

- read explicit env/config input provided by CLI harness
- load fixture manifest from explicit temp path or safe inline test config if existing conventions support it
- validate manifest
- construct local-fixture executor context
- construct sandbox authority / allowlist / confirmation state
- return disabled/noop when no injection config exists

Required behavior:

- no default path
- no global config
- no hidden auto-enable
- no network
- no provider/model calls
- clear errors for invalid/missing manifest
- redacted error messages

Add focused tests.

### 4. Add CLI execution bridge

Add packages/ts-shell/src/core/context/browserCliExecutionBridge.ts.

Bridge should connect validated injection config to existing browser command runtime context.

Expected behavior:

- create optional BrowserExecutor from manifest
- create local execution authority
- create allowlist from local-fixture origins only
- create confirmation state if represented
- expose a read-only summary for status/sidebar/report
- no executor if manifest invalid
- no real Playwright launch
- no MCP launch

Add focused tests.

### 5. Wire bridge into CLI command path if clean

Update the narrowest existing command runtime / CLI command execution bridge path.

Required behavior:

- real CLI child process can receive manifest env from harness
- `/browser execute observe local-fixture://...` can run with local-fixture executor only when manifest is present and valid
- no manifest means existing blocked behavior
- invalid manifest means blocked with safe error
- original command behavior remains unchanged
- no broad cli.tsx rewrite

If CLI path is too coupled:

- keep bridge pure/tested
- document blocker
- recommend Route 101 CLI bridge polish
- but attempt narrow integration first

### 6. Add harness fixture support

Add packages/ts-shell/src/core/harness/browserCliScenarioFixtures.ts.

Fixtures should:

- create temp manifest
- create local fixture
- create safe allowlist/authority/confirmation entries
- provide env vars for agentCliProcess
- provide cleanup helper
- expose expected evidence assertions

Required behavior:

- temp paths only
- no raw secrets
- no network
- deterministic fixture content
- cleanup after test

Add focused tests if helper logic exists.

### 7. Extend real CLI scenario harness

Update agentCliScenarioRunner / process helpers only if needed.

Required behavior:

- support scenario-level env injection from fixture helper
- preserve default no-provider/no-browser/no-network env
- include browser execution evidence in report summary
- safety assertions apply to manifest-driven outputs
- no provider/model call

Add focused tests.

### 8. Add real CLI local-fixture execution scenarios

Add packages/ts-shell/src/core/harness/browserCliExecutionScenarioExamples.test.ts.

Required scenarios:

1. default CLI execution remains blocked

- no manifest
- run `/browser execute observe local-fixture://demo`
- assert blocked
- Executed: no

2. invalid manifest blocks safely

- manifest path points to invalid/unsafe manifest
- run `/browser execute observe local-fixture://demo`
- assert safe blocked result
- no raw manifest content leak

3. local-fixture observe success through real CLI

- valid manifest env
- run `/browser execute observe local-fixture://demo`
- assert Executed: yes
- assert local-fixture mode
- assert sanitized evidence

4. local-fixture extract success through real CLI

- valid manifest env
- run `/browser execute extract local-fixture://demo`
- assert safe extraction evidence
- no raw/secrets

5. external URL still blocked

- valid local fixture manifest
- run `/browser execute navigate https://example.com`
- assert external/future blocked
- Executed: no

6. sidebar event appears if CLI path preserves event surface

- run execution then `/sidebar` or use command output activity evidence if same CLI process cannot persist events
- if separate CLI processes cannot share in-memory events, document limitation and assert command output event summary instead

### 9. Update browser execution output/reporting

Ensure output clearly includes:

- Execution mode: local-fixture / disabled
- Executor source: cli-harness/test-only
- Manifest status: valid/invalid/missing
- Executed: yes/no
- Evidence summary
- Redactions
- Next action

Do not expose raw manifest content.

### 10. Tests

Required focused tests:

- manifest validates safe fixture
- manifest rejects raw secrets/raw HTML/unsafe capabilities
- injection loader returns disabled without env
- injection loader rejects missing/invalid manifest safely
- bridge constructs local fixture executor only for valid manifest
- `/browser execute` default blocked remains unchanged
- real CLI default blocked scenario passes
- real CLI local-fixture observe success passes
- real CLI local-fixture extract success passes
- real CLI external URL blocked with manifest
- report safety assertions pass
- no provider/model/browser/MCP/network side effects

### 11. Docs and roadmap update

Update:

- docs/design/cli-browser-executor-injection-bridge.md with final notes
- docs/design/playwright-cli-real-execution-opt-in.md with Route 100 note
- docs/design/real-cli-scenario-harness.md with Route 100 note
- docs/design/agent-scenario-harness-foundation.md with Route 100 note
- docs/design/browser-sandbox-network-allowlist.md with Route 100 note
- docs/design/sidebar-live-event-capture.md with Route 100 note
- docs/design/context-engineering-continuity-baseline.md with Route 100 note
- docs/design/edit-capability-roadmap.md with concise status and Route 101 recommendation

Recommended next route:

- Route 101: real Playwright CLI local-only execution experiment
  - only if CLI fixture injection is stable
- or Route 101: browser execution report/evidence hardening
  - if CLI bridge works but evidence/report needs polish
- or Route 101: external-network browser execution design
  - only after local CLI execution is safe and evidence is stable

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
- focused tests for touched harness modules
- real CLI scenario tests added by this route
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.

If real CLI scenario tests reveal unrelated existing CLI failures, narrow to safe subset and document blocker.

## Stop conditions

Stop and report if:

- CLI injection requires broad cli.tsx rewrite
- CLI injection requires SessionManager schema changes
- CLI injection requires provider/model calls
- CLI injection requires real browser launch
- CLI injection requires network access
- default browser execution would become enabled
- manifest semantics become confusing or unsafe
- raw manifest/fixture content or secrets would appear in output
- in-memory sidebar events cannot persist across separate CLI processes; document rather than forcing persistence

## Final report

1. What changed
2. Reference scan summary
3. CLI injection design
4. CLI scenarios implemented
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.
