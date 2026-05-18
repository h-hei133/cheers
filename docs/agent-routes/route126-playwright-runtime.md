# Route 126: Playwright core runtime

## Goal

Land the first real Direct Playwright core runtime.

Route 125 already decided the direction:

- Direct Playwright should be the core browser runtime.
- Playwright MCP remains an optional backend.
- Stagehand-like behavior belongs above the runtime as future planner/repair logic.

Route 126 should move from decision spike to working runtime:

- approve and wire the minimal Playwright dependency if needed
- implement a real Direct Playwright adapter
- run controlled local/test browser scenarios through the real adapter
- keep injected/fake adapter tests as deterministic fallback
- expose clear `/browser runtime status`
- produce a short implementation report and Route 127 recommendation

This route should prefer progress over excessive scaffolding.

## Expected outcome

By the end of Route 126, the repo should have:

1. A real Playwright-backed runtime path.
2. A deterministic unavailable/skip path when browser binaries are missing.
3. Controlled local/test-page coverage for observe, extract, click, type, timeout, and cleanup.
4. Existing browser policy/evidence/report surfaces wrapping the real adapter.
5. A clear next route for either browser eval closeout or MCP optional backend prototype.

## Reference scan

Use references only where they directly answer implementation questions.

Primary:

- `/home/wang/projects/playwright-mcp`
- `/home/wang/projects/stagehand`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- Playwright MCP: max 10 files
- Stagehand: max 8 files
- OpenHands: max 8 files
- Inspect AI + mini-swe-agent: max 8 files total

Focus:

- Playwright browser/context/page lifecycle
- snapshot extraction strategy
- action result/evidence shape
- cleanup and timeout discipline
- deterministic unavailable/skip behavior
- eval/report shape

Do not spend time re-reading broad coding-agent architecture unless required by an immediate implementation decision.

## Files

Keep names shorter than Route 125.

Preferred new/updated files:

- `packages/ts-shell/src/core/context/pwRuntime.ts`
- `packages/ts-shell/src/core/context/pwAdapter.ts`
- `packages/ts-shell/src/core/context/pwEvidence.ts`
- `packages/ts-shell/src/core/context/pwStatus.ts`
- `packages/ts-shell/src/core/harness/pwFixtures.ts`
- `packages/ts-shell/src/core/harness/pwRuntime.test.ts`
- `packages/ts-shell/src/core/harness/pwReal.test.ts`
- `docs/design/playwright-runtime.md`

Allowed existing integrations:

- `browserCommandRunner.ts`
- existing browser eval harness
- existing browser evidence/report/sidebar/status code
- package files if a Playwright dependency is required

Avoid creating many one-purpose files.

## Dependency policy

This route may change package files.

Preferred order:

1. If Playwright or Playwright Core already exists in the workspace, use it.
2. Otherwise prefer adding `playwright-core` if it is enough.
3. Use `playwright` only if it materially simplifies controlled local runtime.
4. Keep dependency changes minimal and explain why.

If browser binaries are not available:

- do not fail the whole route
- expose `binary-missing`
- keep fake/injected tests passing
- mark real-browser tests as deterministic skipped/unavailable
- document the exact command/env needed to enable real local browser validation

Do not hide dependency or binary gaps.

## Implementation tasks

### 1. Short design doc

Create `docs/design/playwright-runtime.md`.

Include:

- Route 125 decision carried forward
- chosen dependency path
- runtime lifecycle
- supported operations
- unavailable/skip behavior
- validation result
- Route 127 recommendation

Keep this doc short.

### 2. Real runtime loader

Implement `pwRuntime.ts`.

Responsibilities:

- resolve Playwright package availability
- identify dependency status
- identify browser executable/binary status where possible
- create a runtime status object used by `/browser runtime status`
- expose a safe dynamic import path
- never launch a browser during passive status checks

Statuses should be small and stable:

- `ready`
- `package-missing`
- `binary-missing`
- `disabled`
- `failed`

### 3. Real Direct Playwright adapter

Implement `pwAdapter.ts`.

Support:

- create browser/context/page
- load controlled local/test HTML
- observe page
- extract visible text / selected fields
- click controlled target
- type controlled value
- timeout and cleanup
- close browser/context/page safely

Design the adapter so tests can run in two modes:

- real Playwright mode when package + browser are available
- injected client mode when unavailable

Do not turn this into a generic browser automation product yet.

### 4. Evidence mapping

Implement or simplify `pwEvidence.ts`.

Map Playwright results into existing browser evidence/report structures:

- operation
- target summary
- URL origin / local fixture marker
- DOM summary
- accessibility summary when available
- visible text budget
- redaction markers
- timeout/error kind
- cleanup status

Protect against leaking:

- raw DOM dump
- typed secret value
- cookies/session data
- hidden inputs
- credentials

### 5. Runtime status surface

Implement `pwStatus.ts` and wire it into `/browser runtime status`.

Status should show:

- Direct Playwright: ready / package-missing / binary-missing / disabled / failed
- dependency used
- real-browser validation availability
- MCP backend: optional, not default
- next action

Keep output compact.

### 6. Controlled fixtures

Implement `pwFixtures.ts`.

Include:

- static local HTML fixture
- JS-rendered fixture
- button/click fixture
- input/type fixture
- timeout fixture
- unsafe target fixture
- secret/redaction fixture

No public network required.

### 7. Tests

Add focused tests.

Required deterministic tests:

- runtime status when package missing
- runtime status when binary missing
- injected observe
- injected extract
- injected click
- injected type
- timeout handling
- cleanup on failure
- redaction of typed value / raw DOM / hidden data
- `/browser runtime status` integration

Required real-browser tests:

- real observe on local fixture
- real JS-rendered text
- real click result
- real type result
- real timeout/cleanup

Real-browser tests may skip only when package or browser binary is unavailable. The skip reason must be explicit and stable.

### 8. Eval reuse

Run existing browser eval gauntlet against the real adapter if available.

If not available, run it against injected adapter and report real-browser skip reason.

### 9. Roadmap update

Update `docs/design/edit-capability-roadmap.md` with a short Route 126 note only.

Mention:

- real Direct Playwright runtime path added or blocked
- dependency status
- validation status
- Route 127 recommendation

## Boundaries

Keep only these hard boundaries:

- no provider/model calls
- no public web automation
- no auth/cookie/session persistence
- no destructive/payment/upload/download flows
- no raw DOM/secrets in user-visible output
- no default enablement without explicit runtime availability/status

Everything else should be judged pragmatically.

## Validation

Run focused validation first:

- targeted tests for touched browser/context/harness files
- `/browser runtime status` tests
- existing browser eval harness if applicable
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If package files change, also run the relevant package-lock/package consistency check used by this repo.

Do not run broad unrelated package tests unless a touched dependency requires it.

## Final report

Include:

1. What changed
2. Dependency decision
3. Real browser availability result
4. Adapter operations covered
5. Evidence/redaction behavior
6. Validation
7. What was skipped and why
8. Route 127 recommendation
9. Proposed commit message

Do not commit or push.
