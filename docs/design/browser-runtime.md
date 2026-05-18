# Browser Runtime

Status: Route 127 closeout.
Date: 2026-05-18

## Direction

Direct Playwright is the core browser runtime for controlled local/test browser
execution. It is still explicit and manifest-scoped. There is no default
public browsing mode.

Playwright MCP is an optional backend contract over the same safe
evidence/report model. Route 127 defines the contract but does not launch MCP
and does not make it the default runtime.

Stagehand-like observe/act/extract behavior remains a future planner or repair
layer above the runtime, not the low-level browser lifecycle owner.

## Chromium Binary Strategy

`pwRuntime.ts` checks browser readiness without launching a browser.

Executable resolution order:

1. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
2. Playwright-managed Chromium path from `playwright-core`
3. Common local Chromium/Chrome paths for the current OS

Stable statuses:

- `ready`: package import and executable are available.
- `package-missing`: no usable Playwright package can be imported.
- `binary-missing`: package is importable, but no Chromium executable exists.
- `disabled`: explicit status/runtime check is disabled.
- `failed`: readiness probe itself failed.

The current machine reports `binary-missing` with reason code
`runtime-binary-missing`. To unblock real-browser validation, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a controlled local Chromium binary or
run `npx playwright install chromium`.

## Runtime And Evidence

`pwAdapter.ts` owns the real lifecycle: launch Chromium, create an ephemeral
context, create one page, load local fixtures, observe/extract/click/type, and
close page/context/browser. It does not persist auth, cookies, sessions, or
storage.

`pwEvidence.ts` maps runtime output into safe browser runtime results. It emits
operation, fixture marker, visible text summary, accessibility summary, cleanup
status, and failure reason codes. Raw DOM, hidden input values, typed values,
cookie/session/storage values, and secret-looking content are excluded from
user-visible output.

Failure reason codes:

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

## Eval And Report Shape

`pwEval.ts` reuses the existing browser eval harness and emits `pwReport.ts`
entries with:

- scenario id
- operation
- mode: `real`, `injected`, or `skipped`
- outcome: `pass`, `fail`, or `skip`
- reason code
- evidence summary
- cleanup status
- duration budget result
- redaction status

Injected fallback evals run deterministically. Real evals run when Chromium is
available and skip with stable reason `playwright-browser-binary-missing` when
it is not.

## MCP Optional Backend

`pwMcp.ts` defines the Playwright MCP backend as `optional-not-default`.
Supported operations map to the same report/evidence model, but MCP server
lifecycle and tool-schema mapping remain outside the Direct Playwright core
runtime. Route 127 does not start MCP.

## Remaining Risks

- Current machine lacks a Chromium executable, so real-browser cases are
  cleanly skipped rather than executed.
- Public navigation, auth/session persistence, downloads/uploads, payment,
  destructive flows, and provider/model calls remain blocked.

## Route 128 Recommendation

Route 128 should choose one path: implement the Playwright MCP optional backend
prototype over the Route 127 report contract, add a Stagehand-style planner
above Direct Playwright, or add a public-safe navigation gate. Do not combine
those scopes.
