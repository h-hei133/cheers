# Playwright Runtime

Status: Route 126 implementation.
Date: 2026-05-18

## Decision Carried Forward

Route 125 chose Direct Playwright as the preferred opt-in core browser
runtime. Playwright MCP remains an optional backend, and Stagehand-like
observe/act/extract behavior remains a future planner/repair layer above the
runtime.

## Dependency Path

Route 126 adds `playwright-core` to `packages/ts-shell`. The workspace had no
usable Playwright dependency; the previous lockfile reference was only an
optional Vitest peer. `playwright-core` is the minimal runtime dependency and
does not make browser execution default.

Current local status: the package imports successfully, but Chromium binary
availability is reported through `pwRuntime.ts`. If the binary path is missing,
status is `binary-missing` and real-browser tests take the explicit unavailable
path. To enable real local validation, install Chromium for Playwright or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a controlled local Chromium binary.

## Runtime Lifecycle

`pwRuntime.ts` performs passive status checks only. It dynamically imports
`playwright-core` or `playwright`, probes the Chromium executable path, and
never launches a browser during `/browser runtime status`.

`pwAdapter.ts` implements the existing `BrowserRuntimeExecutor` boundary. For
real execution it launches Chromium headless, creates an ephemeral context,
opens one page, loads a controlled local fixture with `page.setContent`, runs
observe/extract/click/type, maps evidence, and closes page/context/browser in
cleanup. It has no cookie/auth/session persistence and no public web
automation.

## Supported Operations

Covered through controlled local fixtures and the existing action-loop,
receipt, provenance, and eval harness layers:

- observe
- extract visible/JS-rendered text
- click a controlled target
- type into a controlled safe input
- timeout handling
- cleanup on failure
- unsafe/sensitive target blocking through existing policy

## Evidence And Redaction

`pwEvidence.ts` maps operation, fixture marker, DOM/accessibility summaries,
visible text, target summary, timeout/error kind, cleanup status, and
redaction markers into the existing browser runtime result shape.

User-visible output excludes raw DOM, typed values, hidden input values,
cookie/session data, and secret-looking text.

## Validation Result

Route 126 adds deterministic injected tests plus real-browser tests that use
the same adapter. Real-browser cases run only when package and Chromium binary
availability are proven; otherwise they assert the stable unavailable reason.

Focused validation covers runtime status, injected observe/extract/click/type,
timeout, cleanup, redaction, `/browser runtime status`, and browser eval
gauntlet reuse.

## Route 127 Recommendation

Route 127 should either close out the browser eval score/reporting surface for
Direct Playwright, or prototype Playwright MCP as an optional backend using the
same status/evidence/receipt contracts. Do not add public browser automation,
auth/session persistence, downloads/uploads, payment/destructive flows, or
provider/model calls.
