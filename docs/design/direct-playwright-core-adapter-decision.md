# Direct Playwright Core Adapter Decision

Status: Route 125 decision-and-spike.
Date: 2026-05-18

## Reference Scan Summary

Bounded references inspected:

- Playwright MCP: `README.md`, `package.json`, `tests/fixtures.ts`,
  `tests/click.spec.ts`.
- Stagehand: `README.md`, `claude.md`, and targeted `act` / `extract` /
  `observe` references.
- OpenHands: `AGENTS.md`, `tests/unit/utils/test_redact.py`, and targeted
  sandbox/status references.
- Inspect AI: `examples/browser/browser.py`,
  `tests/tools/test_web_browser.py`.
- mini-swe-agent: `README.md`, `src/minisweagent/agents/default.py`,
  `src/minisweagent/environments/local.py`.
- opencode: `packages/opencode/src/tool/apply_patch.ts`.
- gemini-cli: `packages/core/src/tools/edit.ts`.
- ClaudeCode: `tools/FileEditTool/FileEditTool.ts`.

Findings:

- Playwright MCP has mature browser tool schemas, accessibility snapshots, and
  deterministic click/type evidence, but it adds an MCP server lifecycle,
  tool-schema/context cost, and a second permission mapping surface.
- Stagehand points to a useful future high-level observe/act/extract and
  action-cache layer, but it is not the low-level runtime boundary because it
  introduces planner/model and repair semantics.
- OpenHands reinforces sandbox status, runtime availability, and strict
  redaction before logging MCP/server configuration.
- Inspect AI and mini-swe-agent reinforce deterministic eval harnesses,
  skipped/unavailable reporting, concise trajectories, and independent runner
  invocations.
- opencode, gemini-cli, and ClaudeCode reinforce keeping execution, permission,
  result metadata, and user-facing surface separate instead of hiding broad
  behavior inside one tool.

## Decision

The project should stop hand-rolling low-level browser runtime behavior.

Preferred direction: **Direct Playwright as the opt-in core browser runtime**,
wrapped by the existing local control plane:

- manifest and availability checks
- action-loop policy
- DOM/accessibility snapshot mapping
- provenance, receipt, sidebar/report surfaces
- eval gauntlet

Playwright MCP should remain an **optional backend** and ecosystem integration
path. It is useful when persistent MCP browser context or MCP tool ecosystems
are the product goal, but it should not be the default core runtime because the
local control plane loses direct lifecycle and permission visibility.

Stagehand-like behavior should stay a **future planner/repair layer** above the
runtime, not the runtime itself.

## Package And Runtime Audit

Route 125 does not change dependencies and does not install Playwright.

The target workspace package metadata does not declare Playwright in
`packages/ts-shell/package.json`; the lockfile contains Playwright references
only indirectly. The new availability audit therefore supports deterministic
`package-missing`, `unavailable`, and injected `available` states without
requiring a real import or browser launch.

## Adapter Spike Result

Added a Direct Playwright adapter seam that implements the existing
`BrowserRuntimeExecutor` boundary through injected Playwright-like clients.
When real Playwright is unavailable, the seam produces deterministic
unavailable/blocked evidence. No real browser launches in the route tests.

The spike proves controlled local/test scenarios for:

- observe
- extract
- click
- type
- sensitive-target blocking
- invalid adapter evidence
- timeout/unavailable handling
- redaction of raw DOM, secret-looking content, and hidden reasoning labels
- `/browser runtime status` direction surface
- existing browser eval gauntlet reuse

## Decision Matrix

| Runtime path | Decision | Rationale |
| --- | --- | --- |
| Direct Playwright | Preferred core | Best control-plane visibility; maps cleanly into existing policy, evidence, receipt, and eval layers. |
| Playwright MCP | Optional backend | Mature tool/evidence shape, but server lifecycle and permission mapping are heavier. |
| Stagehand-like | Future planner | Strong observe/act/extract pattern, but higher-level planner/repair semantics belong above runtime. |
| Hand-rolled runtime | Reject | Duplicates Playwright responsibility and increases safety/policy drift risk. |

## Route 126 Recommendation

Route 126 should decide and implement the Direct Playwright dependency/runtime
path if approved:

- add `playwright` or `playwright-core` only through an explicit dependency
  route
- prove browser binary availability without broad install side effects
- keep runtime opt-in and controlled local/test scoped
- preserve no raw DOM/page content, no cookies/auth/session persistence, no
  public automation, no MCP launch, and no provider/model calls
- run the controlled observe/extract/click/type gauntlet with real Direct
  Playwright

