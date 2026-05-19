# Route 146: Tool policy result contract

## Goal

Unify the Tool / Policy / Result contract across command, MCP, browser, edit, provider, and session-adjacent tool paths.

Route 145 extracted Session / Continue substrate seams while keeping the full package baseline green:

- `runMvpIntegratedFlow.test.ts`: 151 passed
- package sweep: 2059 passed / 1 skipped
- closeout/result-contract/build gates passed

Route 146 should use that green baseline to unify the next major cross-layer seam:

- tool availability
- policy decision
- execution dispatch
- result classification
- evidence projection
- transcript-safe summary
- user-facing terminal result

This is a contract unification route, not a capability expansion route.

## Expected outcome

By the end of Route 146:

1. There is one documented Tool / Policy / Result lifecycle contract.
2. Command, MCP, browser, edit, provider, and session-adjacent paths can be mapped into the same contract vocabulary.
3. Stopped/completed/error semantics are less duplicated and less divergent.
4. Tool policy denials produce stable reason code and do-next fields.
5. Tool unavailable/disabled/blocked/failed states are clearly distinct.
6. Evidence and transcript summaries are replay-safe and redacted.
7. Existing full package baseline remains green.
8. Future agent-loop extraction can depend on a stable tool/result seam.

## Required inputs

Read:

- `docs/architecture/module-backlog.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/capability-contract.md`
- `docs/architecture/runmvp-package-closeout.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/agent-loop-projection-extraction.md`
- `docs/architecture/agent-loop-baseline-dispatch.md`

Use Route 144/145 green package baseline as the safety gate.

## Reference scan

Use references only for tool/policy/result contract patterns.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/playwright-mcp`

Budget:

- opencode: max 12 files
- ClaudeCode: max 8 files
- OpenHands: max 8 files
- gemini-cli: max 8 files
- Inspect AI + mini-swe-agent + Playwright MCP: max 10 files total

Focus:

- tool registry and execution context
- permission/policy decision shape
- stopped/error/completed result mapping
- unavailable/disabled/blocked distinction
- tool observation/evidence summaries
- transcript-safe event projection
- terminal result surface
- MCP/browser/command tool error contracts

Do not study provider/browser/edit internals beyond their result/policy boundary files.

## Files

Likely touched:

- tool registry / dispatcher files
- policy / allowlist files
- result mapper files
- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- `packages/ts-shell/src/orchestration/flowDispatch.ts`
- browser tool policy/projection files
- edit expectation / mutation projection files
- MCP taxonomy/result files
- provider readiness projection files if already present
- session projection files only if transcript summary needs alignment

Likely new files:

- `packages/ts-shell/src/core/tools/toolPolicyResult.ts`
- `packages/ts-shell/src/core/tools/toolPolicyResult.test.ts`
- `packages/ts-shell/src/core/tools/toolResultProjection.ts`
- `packages/ts-shell/src/core/tools/toolResultProjection.test.ts`
- `docs/architecture/tool-policy-result-contract.md`

Avoid broad rewrites and avoid moving every tool implementation.

## Implementation tasks

### 1. Contract audit

Create `docs/architecture/tool-policy-result-contract.md`.

Map current lifecycle for:

- command tools
- MCP tools
- browser tools
- edit/write/patch paths
- provider/model readiness path
- session/continue-adjacent replay actions

For each, record:

- availability state
- policy state
- execution state
- result state
- reason code
- do-next
- evidence summary
- transcript summary
- terminal surface

Identify divergences.

### 2. Define unified vocabulary

Define a small contract vocabulary.

Suggested availability states:

- `available`
- `unavailable`
- `disabled`
- `not-configured`
- `not-installed`
- `not-ready`

Suggested policy states:

- `allowed`
- `blocked`
- `requires-approval`
- `approval-denied`
- `not-applicable`

Suggested execution states:

- `not-run`
- `running`
- `succeeded`
- `failed`
- `timed-out`
- `cancelled`
- `invalid-result`

Suggested result states:

- `completed`
- `stopped`
- `failed`

Rules:

- do not rename externally asserted values unless all tests are updated intentionally
- map old values into the contract instead of breaking callers
- do not invent a large taxonomy

### 3. Add shared contract helper

Add `toolPolicyResult.ts`.

It should provide pure helpers for:

- build policy-blocked result
- build unavailable result
- build approval-denied result
- build execution-failed result
- build completed tool result
- normalize reason code / do-next
- map capability area to terminal-safe label

Keep it small and typed.

### 4. Add shared projection helper

Add `toolResultProjection.ts`.

It should project:

- result summary
- evidence summary
- transcript-safe summary
- terminal-facing summary
- redaction status

It must not include:

- raw DOM
- raw file dumps
- secrets
- hidden values
- long stdout/stderr dumps unless already budgeted

### 5. Integrate high-value call sites

Do not try to update every caller.

Choose the most valuable paths:

- command allowlist blocked
- command execution success/failure
- browser policy blocked/unavailable
- MCP unavailable/protocol error
- edit unsupported/missing target/missing content
- provider not-configured/opt-in required
- continuation missing evidence if already using similar result shape

Replace duplicated local result construction only where safe.

### 6. Preserve existing semantics

For every touched path, verify:

- current terminal classification stays stable unless intentionally improved
- reason code stays stable or is explicitly mapped
- do-next stays actionable
- result contract tests continue to pass
- transcript summaries remain redacted
- package-level tests remain green

### 7. Focused tests

Add `toolPolicyResult.test.ts` and `toolResultProjection.test.ts`.

Required coverage:

- command policy blocked
- command unavailable
- command success
- command failure
- browser policy blocked
- browser unavailable
- MCP unavailable/protocol error
- edit missing target/content
- provider not configured / opt-in required
- approval denied
- stopped vs failed distinction
- transcript-safe projection excludes raw data/secrets

### 8. Existing tests and green baseline

Run the focused tests for each touched path.

Required preservation gates:

- command/policy/result tests from Routes 139-144
- browser agent/transaction policy tests if touched
- edit expectation tests if touched
- MCP taxonomy tests if touched
- provider readiness tests if touched
- runMvpIntegratedFlow.test.ts
- full packages/ts-shell test sweep if feasible

### 9. Backlog update

Update `docs/architecture/module-backlog.md`.

Route 147 should now be selected based on remaining architecture value, not failures.

Likely next candidates:

- Agent-loop dispatch extraction v2
- CLI/core split preparation
- Capability contract adoption across edit/browser/session/tool
- Provider readiness parity map
- Session event vocabulary hardening

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser feature expansion
- no edit/patch feature expansion
- no broad shell/allowlist expansion
- no permission weakening
- no SessionManager schema migration
- no CLI redesign
- no package dependency changes
- no broad runMvp rewrite
- no broad tool registry rewrite
- no hiding failures behind skips
- no commit or push

## Validation

Run:

- focused tool contract tests
- focused touched command/policy/result tests
- focused browser/edit/MCP/provider tests if touched
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts`
- `rtk npm run test -w packages/ts-shell` if feasible
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If package sweep becomes red, classify and fix only extraction-caused drift.

## Final report

Include:

1. What changed
2. Unified tool/policy/result contract
3. Call sites integrated
4. Semantics preserved or intentionally mapped
5. Redaction / transcript safety
6. Validation and package baseline result
7. Remaining risks
8. Route 147 recommendation
9. Proposed commit message

Do not commit or push.
