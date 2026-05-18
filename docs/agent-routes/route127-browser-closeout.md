# Route 127: Browser runtime closeout

## Goal

Close out the Direct Playwright browser runtime as a usable, testable, reportable capability.

Route 126 landed the real Direct Playwright path with `playwright-core`, but the current machine is still `binary-missing`.
Route 127 should aggressively move from "runtime implemented" to "runtime validated or cleanly gated".

This route owns:

- real Chromium enablement strategy
- real local-fixture browser validation
- browser eval/report closeout
- failure taxonomy
- concise runtime status UX
- optional Playwright MCP backend contract over the same browser runtime evidence model

Prefer shipping one coherent browser runtime surface over adding more one-off scaffolding.

## Expected outcome

By the end of this route:

1. `/browser runtime status` clearly tells whether real browser execution is ready, missing a binary, disabled, or failed.
2. Real local Playwright tests run when a Chromium binary is available.
3. Binary-missing is not treated as a mystery failure.
4. Browser eval output has stable pass/skip/fail reporting.
5. Evidence and reports distinguish observe/extract/action/timeout/policy/cleanup failures.
6. MCP optional backend has a small contract shape, but is not default and does not need to launch.
7. Route 128 has a clear direction: MCP backend prototype, Stagehand-style planner, or public-safe navigation gate.

## Reference scan

Use references for implementation answers only. Do not over-read.

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

- Playwright MCP: tool result contracts, browser context lifecycle, snapshot/action evidence
- Stagehand: observe/act/extract layering, action confidence, repair boundary
- OpenHands: browser action observation and failure reporting
- Inspect AI: eval pass/fail/skip/report model
- mini-swe-agent: compact trajectory and reproduction reporting

Do not re-open broad architecture unless a touched file requires it.

## Files

Keep names short.

Likely touched or added:

- `packages/ts-shell/src/core/context/pwRuntime.ts`
- `packages/ts-shell/src/core/context/pwAdapter.ts`
- `packages/ts-shell/src/core/context/pwEvidence.ts`
- `packages/ts-shell/src/core/context/pwStatus.ts`
- `packages/ts-shell/src/core/context/pwMcp.ts`
- `packages/ts-shell/src/core/context/pwReport.ts`
- `packages/ts-shell/src/core/harness/pwFixtures.ts`
- `packages/ts-shell/src/core/harness/pwEval.ts`
- `packages/ts-shell/src/core/harness/pwCloseout.test.ts`
- `packages/ts-shell/src/core/harness/pwMcp.test.ts`
- `docs/design/browser-runtime.md`

Allowed existing integrations:

- `browserCommandRunner.ts`
- browser eval harness
- result/report/sidebar/status surfaces
- package files if dependency or browser-management decision requires it

Avoid route-specific long filenames.

## Dependency and binary strategy

Resolve the Route 126 binary gap.

Preferred order:

1. Support `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for a controlled local Chromium.
2. Detect common local Chromium/Chrome paths if this repo already has a convention for that.
3. If project discipline allows it, add the minimum Playwright package/tooling needed to install or manage Chromium.
4. If binary cannot be enabled, make the skip reason exact and leave an actionable command/env note.

The route may update package files if needed.

Do not fake real-browser validation. Either run it against a real binary or report a stable skip.

## Implementation tasks

### 1. Collapse docs

Create or update `docs/design/browser-runtime.md`.

This should become the short canonical browser runtime doc.

Include:

- Direct Playwright is core runtime
- Chromium binary strategy
- runtime status meanings
- eval/report shape
- MCP optional backend position
- remaining risks
- Route 128 recommendation

Do not create a new long design doc name.

### 2. Runtime readiness

Improve `pwRuntime.ts`.

It should answer:

- is the package importable?
- is a browser executable available?
- where did the executable come from?
- is the runtime disabled by env/config?
- what exact command/env would unblock it?
- can real tests run now?

Keep statuses stable:

- `ready`
- `package-missing`
- `binary-missing`
- `disabled`
- `failed`

Add a compact machine-readable reason code.

### 3. Real local browser validation

Strengthen `pwAdapter.ts` and real tests.

Real tests should cover:

- static local fixture observe
- JS-rendered fixture observe
- extract visible text
- click button and observe changed state
- type into input without leaking typed value
- timeout fixture
- cleanup after success
- cleanup after failure

Use local fixtures only. No public web.

### 4. Browser eval closeout

Add or update `pwEval.ts`.

The eval runner should produce:

- scenario id
- operation
- mode: real / injected / skipped
- outcome: pass / fail / skip
- reason code
- evidence summary
- cleanup status
- duration budget result
- redaction status

Reuse existing browser eval harness where possible.

Do not build a parallel eval system if one already exists.

### 5. Failure taxonomy

Add a small taxonomy, probably in `pwReport.ts` or `pwEvidence.ts`.

Classify failures as:

- `runtime-package-missing`
- `runtime-binary-missing`
- `runtime-disabled`
- `navigation-timeout`
- `observe-failed`
- `extract-failed`
- `action-target-missing`
- `action-timeout`
- `policy-blocked`
- `cleanup-failed`
- `adapter-invalid-result`
- `unknown`

Use it in tests, status, and eval reports.

### 6. Report and status UX

Improve `/browser runtime status`.

It should show, compactly:

- Direct Playwright status
- dependency
- executable source or missing reason
- real validation readiness
- last/available eval mode if wired
- MCP backend: optional/not default
- next action

Do not dump raw internals.

### 7. MCP optional backend contract

Add `pwMcp.ts`.

This is not a live MCP launch.

Define only:

- backend kind
- supported operation shape
- evidence mapping shape
- lifecycle expectations
- where MCP loses direct control compared with Direct Playwright
- readiness status: optional / unavailable / not-launched

Add tests proving MCP can share the same report/evidence contract without becoming default.

### 8. Redaction closeout

Strengthen redaction tests.

Required assertions:

- raw DOM is not emitted
- hidden input values are not emitted
- typed secret values are not emitted
- cookies/session/storage are not emitted
- reports contain summaries and reason codes, not page dumps

### 9. Roadmap note

Update `docs/design/edit-capability-roadmap.md` with a short Route 127 note.

Mention:

- real browser closeout result
- binary readiness result
- eval/report status
- MCP optional backend contract status
- Route 128 recommendation

## Boundaries

Keep these hard boundaries only:

- no provider/model calls
- no public web automation
- no auth/cookie/session persistence
- no destructive/payment/upload/download flows
- no raw DOM/secrets in output
- no default public browsing mode

Everything else should be solved pragmatically.

## Validation

Run:

- focused browser runtime tests
- focused browser eval/report tests
- focused MCP contract tests
- real browser tests when binary is available
- injected fallback tests always
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If package files change:

- run the repo's package consistency check
- confirm the exact dependency diff

Do not run broad unrelated tests.

## Final report

Include:

1. What changed
2. Binary/runtime readiness result
3. Real browser validation result
4. Eval/report closeout result
5. Failure taxonomy added
6. MCP optional backend contract result
7. Redaction guarantees
8. Validation
9. Remaining risks
10. Route 128 recommendation
11. Proposed commit message

Do not commit or push.
