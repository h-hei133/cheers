# Route 164: Result Surface - session terminal blocker detail parity

## Module

- Primary module: Result Surface Engineering
- Secondary modules: Session / Continue Engineering, Provider / Model Engineering, Browser Engineering, Edit / Patch Engineering, Harness / Eval Engineering
- Route type: foundation drift repair
- Product behavior boundary:
  - align terminal blocker detail rendering with existing Result Surface blocker vocabulary
  - do not change result truthfulness
  - do not add new provider/browser/edit capability behavior
  - do not change session schema or transcript format

## Goal

Fix the high-risk foundation drift found by Route 163.

Route 163 found no blocking foundation contradictions, but recorded one high-risk drift:

- `resultMapper` / `actionableBlockerModule` recognize newer Route 162 provider/browser/edit blocker markers
- `sessionTerminalState` still renders terminal blocker details from an older narrower marker set

This route should make session terminal blocker-detail rendering consume the same blocker vocabulary as Result Surface truthfulness mapping, while preserving completed/stopped/failed semantics.

This route is successful when:

- session terminal blocker details recognize provider-specific blocker markers already known by Result Surface
- session terminal blocker details recognize browser cleanup / unavailable / policy / timeout markers already known by Result Surface
- session terminal blocker details recognize edit missing-content / unsupported-future-edit / stale-read style markers already known by Result Surface
- no new blocker category is invented unless it already exists in the Result Surface contract
- resultMapper truthfulness stays unchanged
- CLI/session terminal output changes are covered by focused tests
- Route 163 foundation risk register is updated from high-risk drift to resolved or reduced

This route is not successful if:

- it changes completed/stopped/failed classification
- it hides failures behind completed
- it expands provider/browser/edit behavior
- it changes SessionManager schema or transcript JSONL format
- it broadens CLI UX beyond blocker detail parity
- it creates a second independent blocker vocabulary

## Inputs to read

Read:

- `docs/foundation/foundation-consistency-audit.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/foundation/foundation-consistency-matrix.json`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/resultmapper-module-extraction.md`
- `docs/implementation-context/capability-flow-manifest.json`

Then inspect the relevant source:

- `packages/ts-shell/src/core/query/actionableBlockerModule.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/core/shell/sessionEventSurface.ts` if terminal rendering flows through it
- existing sessionRuntime / resultMapper tests

External references are not needed for this route.

## Implementation guidance

Prefer one source of blocker detail vocabulary.

Good options:

- expose a small Result Surface projection from `actionableBlockerModule`
- or make `sessionTerminalState` consume existing blocker classification output instead of parsing a narrower local marker list
- or add a tiny bridge in Result Surface if direct dependency would create the wrong ownership

Avoid duplicating marker strings in multiple places.

Keep session terminal rendering as rendering. It should not become the truthfulness owner.

## Scope

Calibrate these existing blocker families if present in code:

### Provider blocker details

Examples may include current equivalents of:

- provider not configured
- real-provider opt-in required
- unsupported provider/model mode
- provider diagnostic failure
- provider unavailable

Do not read provider config.
Do not run provider live gates.
Do not change provider readiness behavior.

### Browser blocker details

Examples may include current equivalents of:

- browser unavailable
- package/binary missing
- policy blocked
- timeout
- cleanup failed / cleanup unknown
- raw content excluded / redacted

Do not add browser actions.
Do not expand public browsing.
Do not change browser runtime behavior.

### Edit blocker details

Examples may include current equivalents of:

- missing target
- ambiguous target
- missing concrete content
- stale-read blocked
- unsupported future edit
- unsupported broad refactor / discovery edit / fuzzy replacement

Do not implement new edit capability.
Do not change workspace authority or stale-read behavior.
Do not add fenced replacement execution.

## Tests

Add or update focused tests.

Likely tests:

- `sessionTerminalState` blocker detail test
- `sessionRuntimeBoundary` test if full terminal line rendering changes
- `resultMapperBoundary` or `crossCapabilityResultFlow` test if shared projection is exposed

Required coverage:

- provider blocker marker renders an actionable terminal detail
- browser cleanup or unavailable marker renders an actionable terminal detail
- edit missing-content or unsupported-future-edit marker renders an actionable terminal detail
- unknown blocker still falls back safely
- terminal classification stays stopped/error exactly as before
- completed paths are not affected
- no raw DOM, provider config path, secret, or raw file dump appears in terminal detail

## Documentation updates

Update:

- `docs/foundation/foundation-risk-register.md`
- `docs/foundation/foundation-consistency-audit.md`
- `docs/foundation/foundation-consistency-matrix.json`
- `docs/architecture/module-backlog.md`

If the actual terminal flow differs from Route 161 / 162 context, update only the relevant entries under:

- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-flow-graph.md`

Do not rewrite the whole implementation context.

## Boundaries

Hard boundaries:

- No provider live calls.
- No provider config reads.
- No external MCP execution.
- No browser capability expansion.
- No edit/write capability expansion.
- No runtime execution behavior change.
- No permission change.
- No workspace authority or stale-read behavior change.
- No result truthfulness change.
- No session schema or transcript format change.
- No CLI flag/mode behavior change.
- No dependency or package script changes.
- No hidden skips.
- No commit or push.

## Validation

Validation tier: Tier 3, because this touches Result Surface and session terminal rendering.

Required:

- focused session terminal blocker tests
- focused result mapper / cross-capability result flow tests touched by this route
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse check if foundation matrix or implementation manifest is updated
- `rtk git diff --check`
- `rtk git status --short --branch`
- package guard:
  - `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

Run `runMvpIntegratedFlow.test.ts` only if orchestration result handoff changes.

Package sweep is not required by default.

## Completion report

Final report should include:

1. Branch and base commit
2. Files changed
3. What blocker vocabulary was aligned
4. Provider blocker terminal parity
5. Browser blocker terminal parity
6. Edit blocker terminal parity
7. Result truthfulness preservation
8. Foundation risk status update
9. Validation tier used and why package sweep was or was not run
10. Validation commands and results
11. Real-provider gate status
12. External MCP status
13. Audit/history residue handling
14. Source/package change confirmation
15. Remaining risks
16. Best next action
17. Proposed commit message

Do not commit or push.
