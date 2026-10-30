# Bounded configured-provider research probe

Result: **provider-or-model-unverified**. The final original Node CLI run emitted `query.failed` before any native research child started. Its structured error classification is `unclassified-live-or-runtime`; it does not establish a provider outage, unavailable model, authentication failure or research product defect. No fallback model was tried. ADD-11/12 and the overall Phase 20 acceptance remain open.

The earlier deterministic HTTP composition evidence is in [research-wire](../phase20-addition-research-wire/README.md). This batch attempts the separate model-driven read/citation/contradiction path, rather than counting deterministic responses as live research quality.

## Fixture and limits

The current immutable build is `e2930dba7c8af5c2ce9a7ae62770da5573bfeaa5485c38b406ce9216dbc1b47f`, inputs `e2bd5e51ebe097036feaf680dd0ffb219c2f3a5c5eb302c0a9a533badcce0d38`. No product source changed. Both attempts use regular mode, one saved message, an isolated Git project/home/profile, the normal configured openai-compatible adapter and explicit requested model `gpt-6.1-terra`. Backend model identity is unconfirmed. Credential availability is a local preflight, not endpoint readiness.

Two public documents deliberately disagree: release.md restricts v2 to Linux and FEATURE_X=1, disables it for FEATURE_X=0 and excludes Windows; an unversioned mirror claims all platforms are enabled by default. Two explicit fixture skills require reading the primary source, trying to disprove broad claims, retaining actual native citations and disclosing same-model correlation. These are fixture instructions; the model did not demonstrate following them.

Allowed tools are read/glob/grep/research_run, MCP is disabled, offline mode and warming off prevent autonomous discovery requests, and configured retries are disabled. The CLI still permits its explicit foreground provider request. Limits: 768 MiB CLI heap, 360-second wall deadline, 2 MiB captured terminal output, four root steps and native quick depth with its existing five-minute deadline. Requested maxOutputTokens=1536 does not prove remote enforcement. No report save is requested.

## Observations and exclusions

| Observation | First attempt, excluded diagnosis | Final attempt |
|---|---|---|
| Wall observation | 5 seconds | 6 seconds |
| Native run | ready / brief | ready / brief |
| Methods and original input | retained | retained |
| Native children / child request IDs | 0 / 0 | 0 / 0 |
| Sources / claims / report fragments | 0 / 0 / 0 | 0 / 0 / 0 |
| Review | not run | not run |
| Ledger pending | 1 | 1 dispatched unknown, 0 unsent |
| Remote input/output usage | unknown | unknown |
| Child/owner retained | no / no | no / no |
| CLI exit / cooked flags | 0 / restored | 0 / restored |

The first receipt, [excluded-terminal-classifier.json](excluded-terminal-classifier.json), preserves the actual failed assertion. Its `provider-network-suspected` classification is **invalid**: the classifier scanned the entire terminal, including the echoed question's word “network”. It also wrongly required an empty ledger even when remote usage was unknown. Neither observation warrants a product fix.

The final [receipt](gpt-6.1-terra-receipt.json) classifies only query.failed/lifecycle.error and stopped query result fields, discarding their text. It records a failed query and no native tool result. The ledger's dispatched reservation is retained rather than silently released; completed research would still require settlement. This matches the existing native request policy and its explicit unknown-output reconciliation contract. A ledger dispatch mark is not transport-level HTTP counting or proof that the backend received the request.

All-reference checks over an empty source/claim set are vacuous and prove no citation quality. Recorded input/output totals of zero are known settled totals with one unresolved attempt, not evidence of zero tokens or zero billing. There was no successful review, coverage, contradiction resolution or report.

The original operator configuration and public fixture files remained byte-identical. Only necessary configured credentials were copied to a0600 fixture config under a0700 scratch root. Each attempt removed that fixture. Terminal/model output and raw errors were held in bounded memory and discarded; no endpoint, key, response body or generated model text is archived. Each serialized receipt was scanned for the exact configured key and endpoint before writing.

## Validation and delivery boundaries

The main agent ran both syntax checks and both bounded CLI attempts serially. Both CLI processes exited; each probe command returned1 because live research was unverified. No full suite, build, executable, 20k-message terminal probe, assistant subagent, independent review or structural judge ran for this evidence batch. The verified build was reused. Product source was not reversed or modified to manufacture a green result.

Target inspection covered research run admission/recovery, the native request ledger's incomplete-usage settlement and existing research policy tests. Unknown remote outcomes are deliberately preserved; no new ledger, runner or provider/auth behavior was added. HANDOFF records the terminal-echo classification pitfall.

One delayed CI read is preserved in [prior-ci.json](prior-ci.json): ff084423 CI/Watch both completed/success; 22e2a1fb Watch completed/success and CI in_progress, all with exact head identities. This observation does not claim CI for the present evidence commit.

Reproduction from repository root uses the normal configured credentials and requires a fresh matching build. Preserve existing receipts before running; the driver refuses to overwrite its final receipt. Run the two node syntax checks, then `rtk proxy node --max-old-space-size=768 .omx/artifacts/phase20-addition-research-live/pty.mjs gpt-6.1-terra`. A nonzero exit for provider-or-model-unverified is intentional. Do not infer model unavailability from that exit or repeat it with another model on this evidence.
