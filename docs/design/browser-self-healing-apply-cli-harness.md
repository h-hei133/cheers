# Browser self-healing apply CLI harness

Route 115 proves that Route 114 manifest repair is visible across real CLI child
processes without turning repair into execution authority.

## Reference scan summary

- Stagehand keeps browser eval fixtures explicit and task-scoped. Local
  implication: repair scenarios should use deterministic local fixture manifests,
  not live sites or discovery.
- OpenHands separates live status from exported trajectory/report artifacts.
  Local implication: repair apply output should report status and next action
  without embedding raw manifest content.
- Inspect AI writes manifest and segment artifacts as separate durable records.
  Local implication: the repaired manifest is evidence, but replay still needs a
  separate explicit command and gate check.
- mini-swe-agent treats trajectory files as explicit run artifacts with metadata.
  Local implication: CLI scenarios should record process evidence and command
  boundaries rather than rely on in-memory state.
- Playwright MCP exposes browser capabilities as named tools and gates unsafe
  capabilities separately. Local implication: repair metadata must not expand
  browser authority, unsafe code, screenshots, OCR, network, or MCP launch.

## Cross-process repair proof model

Each scenario uses at least two CLI child processes:

1. A repair process runs `/browser repair apply <proposal-id> --confirm
   --manifest <path>` against an explicit temp local/test manifest.
2. A follow-up process runs `/browser status`, `/browser execute ...`, or
   `/browser replay ...` with the repaired manifest passed through explicit test
   environment.
3. Tests inspect only sanitized manifest facts after the repair, such as manifest
   kind, patch warning marker, runner binding presence, skill metadata readiness,
   local-fixture allowlist presence, and sanitized fixture summary.

The proposal id is deterministic harness context. There is no proposal store,
startup load, dynamic discovery, provider/model call, MCP launch, browser launch,
or automatic replay.

## CLI fixture strategy

Fixtures create temp manifests for:

- external runner metadata repair
- skill runner metadata repair
- local fixture allowlist repair
- local fixture summary refresh

They also provide explicit child-process environment for follow-up status,
execute, or replay checks. Assertion helpers return compact facts instead of raw
manifest JSON.

## Evidence model

Reports include scenario id, proposal id, patch kind, manifest kind, apply
process result, follow-up process result, whether the manifest was patched,
whether the browser executed, whether replay executed automatically, raw manifest
exposure status, warnings/blockers, and next action.

The allowed evidence is metadata state and command output. Raw manifest content,
raw browser evidence, provider credentials, secrets, and hidden reasoning are not
reported.

## Blocked cases

The CLI harness keeps these blocked after repair apply:

- external network allowlist patch
- unsafe evidence patch
- missing `--manifest`
- invalid manifest path or unreadable manifest
- global/provider-owned manifest paths
- apply without `--confirm`
- replay without an explicit `/browser replay <receipt-id>` command

## Route 116 recommendation

Route 116 should either polish replay/report UX for repaired manifests or define
the external-network browser execution design. If proposal/manifest context needs
durability later, that should be a separate persistence-policy route.
