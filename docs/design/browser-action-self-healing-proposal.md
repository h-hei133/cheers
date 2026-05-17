# Browser Action Self-Healing Proposal

Status: Route 112 implemented candidate.
Date: 2026-05-17

## Scope

Route 112 adds proposal-only browser action self-healing on top of Route 111
repair readiness. A proposal is a safe, structured recommendation for how a
future explicit repair route could make blocked replay actionable. It is not a
repair executor and does not mutate cache, metadata, runner bindings,
allowlists, confirmations, receipts, or fixtures.

Self-healing is safe to name in this project only when it means:

- classify a replay failure from existing sanitized metadata
- propose the minimal user-reviewed repair category
- produce deterministic proposal-only patch metadata
- render safe output for the command, scenario report, and sidebar summary
- preserve `Applied: no`, `Executed: no`, and `Automatic replay: no`

## Reference Scan Summary

Reference budget used: 10 files total.

- Stagehand: `README.md`, `claude.md`, and
  `packages/core/lib/v3/types/private/cache.ts`. Stagehand separates
  `observe` from `act`, caches action metadata, and treats self-healing as a
  bridge from cached repeatable actions to later repair when a site changes.
  Local implication: proposals may describe action-cache metadata repair, but
  they cannot execute or invoke AI-mediated repair in this route.
- Playwright MCP: `README.md` and `tests/fixtures.ts`. Browser actions depend
  on explicit snapshot targets, tool response sections, read-only flags, and
  redaction/output boundaries. Local implication: proposals must stay
  metadata-only and cannot treat screenshots, raw snapshots, or unsafe code as
  repair authority.
- OpenHands: `enterprise/integrations/github/github_view.py`. Recovery
  suggestions are user-facing prompts derived from concrete failures. Local
  implication: self-healing output should be actionable but framed as a user
  choice.
- Inspect AI: `_eval/task/scan.py` and `agent/_react.py`. Failure surfaces
  should rewrap generic failures into actionable context while keeping model,
  compaction, and approval boundaries explicit. Local implication: proposals
  should state the required gate and avoid hidden side effects.
- mini-swe-agent: `README.md`, `tests/conftest.py`, and
  `tests/run/test_inspector.py`. Linear trajectories and observation fixtures
  make failures reproducible and reportable. Local implication: scenario
  coverage should assert the failure-to-proposal mapping and safe report text.

No implementation code was copied from reference repositories.

## Proposal Model

`BrowserSelfHealingProposal` contains:

- proposal id
- status: `proposed`, `blocked`, `not-applicable`, or `unsafe`
- kind: runner binding, skill metadata, confirmation, cache repair, allowlist,
  fixture refresh, retry local runner, reject unsafe evidence, or external
  network blocked
- confidence: `high`, `medium`, `low`, or `blocked`
- failure kind and repair readiness
- required user action
- optional proposal-only patch reference
- blockers, warnings, next action, and evidence tokens
- applied/executed/automatic replay all fixed to `no`

## Proposal-Only Patch Model

`BrowserSelfHealingPatch` is deterministic metadata only. Patch kinds cover:

- runner binding patch
- skill metadata patch
- confirmation patch
- cache repair patch
- allowlist patch
- fixture refresh patch
- no-op blocked patch

Every patch records `wouldWrite: no`, `cacheWrite: no`, and
`metadataMutation: no`. Unsafe content creates a blocked patch instead of a
proposal.

## Failure Coverage

Proposal-producing replay failures:

- missing runner -> add runner binding
- missing skill metadata -> add skill metadata
- missing sandbox/allowlist/confirmation -> request confirmation
- corrupted or missing cache -> repair cache metadata after explicit review
- stale fixture -> refresh fixture
- timeout or malformed local/test response -> retry local runner

Blocked proposals:

- unsafe evidence -> reject unsafe evidence
- external URL -> external network blocked
- unsupported action or invalidated/deleted receipt -> no repair apply in this
  route

Successful replay is `not-applicable` internally and does not render noisy
self-healing output.

## Output, Report, And Sidebar

Blocked replay output can include both Route 111 repair readiness and a
`Browser self-healing proposal` section with proposal kind, confidence,
required user action, proposed patch kind, patch status, blockers/warnings, and
next action.

Scenario reports summarize proposal kind and confidence from safe output text.
Sidebar summaries allow only compact proposal lines and exclude raw evidence,
secrets, hidden reasoning, and raw content blobs.

## No-Apply Boundary

This route does not add:

- repair apply
- browser execution changes
- automatic replay
- cache or metadata mutation
- external network
- dynamic discovery
- MCP launch
- provider/model calls
- package or SessionManager schema changes

## Route 113 Recommendation

Route 113 should choose one explicit path:

- explicit self-healing apply design, still behind user approval and safe
  metadata only
- replay UX/report polish if proposal output needs product tightening
- external-network browser execution design only after proposal-only behavior
  remains stable
