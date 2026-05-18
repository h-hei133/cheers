# Browser Self-Healing Explicit Apply

Status: Route 113 implemented candidate.
Date: 2026-05-18

## Scope

Route 113 adds explicit, user-reviewed apply for metadata-safe browser
self-healing proposals. Apply can change only explicit local/test metadata or
explicit sanitized receipt cache state. Applied repair is not authority to run
browser actions and is not authority to replay.

This route adds:

- apply policy
- apply plan
- apply executor
- apply surface
- `/browser repair status`
- `/browser repair apply <proposal-id> --confirm`
- report/sidebar-safe summaries

## Reference Scan Summary

Reference budget used: 8 files total.

- Stagehand: `README.md`, `claude.md`, and
  `packages/core/lib/v3/types/private/cache.ts`. Stagehand informed the
  boundary between cached action metadata and actual action execution. Local
  implication: apply may update safe cache metadata, but execution remains a
  separate explicit command.
- Playwright MCP: `README.md` and `tests/fixtures.ts`. Playwright MCP exposes
  browser action target evidence, read-only distinctions, unsafe code
  boundaries, and secret redaction settings. Local implication: apply output
  must prove no browser action, replay, MCP launch, or raw browser evidence
  occurred.
- OpenHands: `enterprise/integrations/github/github_view.py`. Recovery
  suggestions are derived from concrete failures and require user action.
  Local implication: repair apply remains user-reviewed and reports clear next
  steps.
- Inspect AI and mini-swe-agent: `inspect_ai/_eval/task/scan.py`,
  `mini-swe-agent/README.md`, and `mini-swe-agent/tests/conftest.py`.
  Trajectory repair reports should preserve reproducible observation evidence
  without hiding execution. Local implication: apply reports include applied vs
  blocked, changed metadata/cache, and no-execution proof.

No implementation code was copied from reference repositories.

## Applyable Proposals

Applyable with explicit local/test context:

- `repair-cache`: invokes existing explicit sanitized receipt cache repair
  when an explicit writable cache store is provided and `--confirm` is present.
- `request-confirmation`: records an ephemeral local/test confirmation apply
  result for the current command context only.

Planned but blocked until a safe writer exists:

- `add-runner-binding`
- `add-skill-metadata`
- `update-allowlist`
- `refresh-fixture`
- `retry-local-runner`

These require explicit manifest or allowlist write helpers that this route
does not introduce.

## Blocked Proposals

Always blocked:

- `reject-unsafe-evidence`
- `external-network-blocked`
- auth, payment, destructive, arbitrary JavaScript, dynamic discovery, or
  missing raw evidence repair

Unsafe or external-network proposals must produce blocked apply output rather
than a mutation.

## Apply Policy And Plan

`browserSelfHealingApplyPolicy.ts` classifies proposal kinds into:

- `apply-allowed`
- `apply-needs-explicit-context`
- `apply-needs-user-confirmation`
- `apply-blocked-unsafe`
- `apply-blocked-external-network`
- `apply-blocked-unsupported`
- `apply-not-applicable`

`browserSelfHealingApplyPlan.ts` records proposal id, proposal kind, target,
intended metadata changes, required context, confirmation requirement, risks,
blockers, warnings, and next action. Plans never write files and always record
`applied: false`, `browserActionExecuted: false`, and `replayExecuted: false`.

## Execution Boundary

`browserSelfHealingApplyExecutor.ts` may:

- call the existing explicit receipt cache `repair()` path for `repair-cache`
- return an ephemeral confirmation-context apply result for
  `request-confirmation`
- block unsupported manifest, runner, skill, fixture, allowlist, unsafe, and
  external-network applies

It never changes global runner binding, global allowlist, SessionManager
state, provider configuration, MCP configuration, or browser execution
behavior.

## Command, Report, And Sidebar Surface

`/browser repair status` explains the explicit-only repair boundary.

`/browser repair apply <proposal-id> --confirm` requires a proposal id and
confirmation. Output includes proposal id/kind, apply status, target, applied
yes/no, browser executed no, replay executed no, metadata/cache changed
yes/no, blockers/warnings, and next action.

Scenario reports summarize repair apply as
`repairApply=<outcome>/<target>/changed=<yes|no>`. Sidebar summaries allow only
safe apply lines and exclude raw evidence, secrets, hidden reasoning, and raw
content blobs.

## Route 114 Recommendation

Route 114 should choose one explicit path:

- browser replay UX/report polish
- self-healing apply CLI cross-process harness, if explicit context passing
  needs stronger evidence
- external-network browser execution design only after metadata-safe apply
  remains stable
