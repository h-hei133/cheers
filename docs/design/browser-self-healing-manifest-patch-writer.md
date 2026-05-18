# Browser Self-Healing Manifest Patch Writer

Status: Route 114 implemented candidate.
Date: 2026-05-18

## Scope

Route 114 adds an explicit local/test manifest patch writer for metadata-safe
browser self-healing repairs. It lets `/browser repair apply <proposal-id>
--confirm --manifest <path>` patch explicit manifests for runner binding,
skill metadata, local-fixture allowlist, and fixture summary refresh.

Manifest patching is not browser execution and is not replay authority.

## Reference Scan Summary

Reference budget used: 8 files total.

- Stagehand: `README.md`, `claude.md`, and
  `packages/core/lib/v3/types/private/cache.ts`. Stagehand informed the split
  between cached action repair metadata and actual action execution. Local
  implication: manifest patches may make metadata reusable, but replay remains
  explicit.
- Playwright MCP: `README.md` and `tests/fixtures.ts`. Browser tools expose
  action target metadata, read-only flags, unsafe code boundaries, and secret
  redaction. Local implication: manifest patches must stay local/test and
  cannot add unsafe capabilities, external network origins, or raw evidence.
- OpenHands: `enterprise/integrations/github/github_view.py`. Recovery
  actions are reported as user-visible, bounded suggestions. Local
  implication: patch output reports applied vs blocked and the next explicit
  command.
- Inspect AI and mini-swe-agent: `inspect_ai/_eval/task/scan.py`,
  `mini-swe-agent/README.md`, and `mini-swe-agent/tests/conftest.py`.
  Repair reports should preserve reproducibility while distinguishing
  applied/not-applied evidence. Local implication: scenario reports include a
  manifest patch summary and no-execution proof.

No implementation code was copied from reference repositories.

## Manifest Patch Taxonomy

Allowed patch kinds:

- `add-runner-binding`
- `add-skill-metadata`
- `update-allowlist-local-fixture`
- `refresh-fixture-summary`
- `add-confirmation-local-context-reference`

Blocked patch kinds:

- external network allowlists
- auth, payment, destructive, upload, download, screenshot, OCR, or arbitrary
  JavaScript capability changes
- dynamic discovery
- global config mutation
- raw evidence insertion
- secret-looking values

## Allowed Targets

The writer supports only explicit local/test manifest files:

- browser external runner manifest for runner binding and skill metadata
- browser local fixture manifest for local-fixture allowlist and fixture
  summary refresh

Unsupported manifest formats return a blocked result. The route does not patch
global provider configuration, default runtime state, SessionManager state, or
sidebar state.

## Validation And Atomic Writes

The writer:

1. Requires an explicit manifest path.
2. Loads and validates the current manifest.
3. Applies a sanitized in-memory metadata patch.
4. Validates the patched manifest.
5. Writes to a temp file beside the manifest.
6. Renames the temp file over the manifest.

The result records validation evidence and never includes raw manifest content.

## Apply Output

Apply output includes:

- proposal id
- proposal kind
- manifest patch status
- patch kind
- target manifest kind
- applied yes/no
- metadata/cache changed yes/no
- browser executed no
- replay executed no
- blockers/warnings
- next action

Scenario reports summarize manifest patch status as part of
`repairApply=<outcome>/<target>/changed=<yes|no>/manifestPatch=<status>`.
Sidebar summaries allow only safe patch summary lines.

## No-Auto-Replay Boundary

Applied manifest metadata only prepares explicit local/test context. It never
starts replay, never starts browser execution, never launches MCP, never calls
providers/models, and never grants external network access. Users must still
run `/browser replay <receipt-id>` explicitly.

## Route 115 Recommendation

Route 115 should choose one explicit path:

- self-healing apply cross-process CLI harness
- browser replay UX/report polish
- external-network browser execution design only after local/test manifest
  patching remains stable
