# ResultMapper Module Extraction

Route: `docs/agent-routes/route160-resultmapper-module-facades.md`

## Scope

This route keeps `packages/ts-shell/src/core/query/resultMapper.ts` as the
Result Surface truthfulness composition root while moving coherent
classification families behind Result Surface-owned facades. It is
behavior-preserving: no completed/stopped/error semantic changes, no
capability execution changes, no provider live calls, no session schema changes,
no CLI output changes, and no dependency changes.

## Responsibility Migration Table

| Current code block / responsibility | Current owner file | True owner module | Target facade or file | Migration decision | Reason | Validation required | Risk |
|---|---|---|---|---|---|---|---|
| Top-level `OrchestrationResult` construction and field preservation | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/resultMapper.ts` | leave in resultMapper | This is the final truthfulness composition root and the stable result contract shape. | existing resultMapper tests, result-contract | High if moved because session/continue consumers rely on exact fields. |
| Final completed/stopped/error decision order | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/resultMapper.ts` calling facades | leave in resultMapper | The route requires preserving externally asserted mapping order in the root composer. | existing resultMapper tests, boundary tests, result-contract | High if reordered because false success or vague errors could leak. |
| Terminal classification fallback from `TerminalReason` and continuation reason | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/terminalClassificationProjection.ts` | extract now | This is pure label projection and is separately reusable by boundary tests. | boundary tests, existing resultMapper tests | Medium if `stopped_error` retryable handling changes. |
| Explicit terminal classification preservation | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/resultMapper.ts` plus terminal facade fallback | leave in resultMapper | The root must choose explicit terminal facts before fallback projection. | existing resultMapper tests | Medium if explicit `error` is overwritten by fallback. |
| Actionable blocker marker parsing | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/actionableBlockerModule.ts` | extract now | Markers are evidence/result-surface facts, not capability execution logic. | boundary tests, result-contract | High if known blocker kinds drift. |
| Actionable blocker reason and do-next projection | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/actionableBlockerModule.ts` | extract now | Approval-denied next action and blocker stop reasons are user-facing Result Surface rules. | boundary tests, existing resultMapper tests | High if actionable stopped paths become vague errors. |
| Approval denied and policy blocked mapping | `core/query/resultMapper.ts` | Result Surface with Permission / Policy inputs | `core/query/actionableBlockerModule.ts` | extract now | Result Surface consumes policy facts and projects stopped reasons; policy execution stays outside. | boundary tests, result-contract | High if denial appears as success or generic failure. |
| Command/tool result hard-failure classification | `core/query/resultMapper.ts` | Result Surface with Tool inputs | `core/query/capabilityResultClassification.ts` | extract now | Approved command execution failure provenance is result classification, not tool execution. | existing resultMapper tests, boundary tests | High if bash failures stop being classified as errors. |
| MCP unavailable/protocol/tool-error mapping | `core/query/resultMapper.ts` | Result Surface with Tool / Runtime inputs | `core/query/actionableBlockerModule.ts` and `core/query/capabilityResultClassification.ts` | extract now | MCP facts arrive as reasons/evidence and should normalize through Result Surface facades. | boundary tests, result-contract | Medium if unavailable becomes generic error. |
| Browser unavailable/policy/timeout/adapter mapping | `core/query/resultMapper.ts` | Result Surface with Browser / Runtime inputs | `core/query/actionableBlockerModule.ts` | extract now | Browser result reasons are consumed as safe summaries; no browser execution moves. | boundary tests, result-contract | Medium if policy blocked or timeout labels drift. |
| Edit/patch verification, stale-read, no-mutation mapping | `core/query/resultMapper.ts` | Result Surface with Edit / Patch inputs | `core/query/actionableBlockerModule.ts` and `core/query/capabilityResultClassification.ts` | extract now | Result Surface owns stopped/error truthfulness over edit receipts; writer policy stays outside. | boundary tests, existing resultMapper tests | High if stale-read or verification failed maps to completed. |
| Provider not-configured / opt-in diagnostic mapping | `core/query/resultMapper.ts` | Result Surface with Provider / Model inputs | `core/query/actionableBlockerModule.ts` where facts are reason/evidence based | defer | Current inline rules do not contain provider-specific markers beyond generic stopped/error handling; add facade coverage when provider result facts become explicit here. | result-contract if later touched | Medium if future provider facts are added ad hoc. |
| Continuation/replay result mapping | `core/query/resultMapper.ts` | Session / Continue plus Result Surface | `core/query/terminalClassificationProjection.ts` only | facade existing fallback | Only retryable continuation classification is present here; session replay state remains outside this route. | existing resultMapper tests | Medium if retryable `stopped_error` classification changes. |
| Unknown/fallback error mapping | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/resultMapper.ts` | leave in resultMapper | The root composer owns final fallback when no facade produces a more specific classification. | existing resultMapper tests, result-contract | High if unknown failures become actionable without evidence. |
| Evidence marker parsing | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/actionableBlockerModule.ts` | extract now | Evidence markers are Result Surface inputs and should not be embedded in the root composer. | boundary tests | Medium if marker allowlist changes. |
| User-facing reason/do-next projection | `core/query/resultMapper.ts` | Result Surface Engineering | `core/query/actionableBlockerModule.ts` and root composer | extract now for actionable blockers; leave final fallback in root | Actionable next actions are facade-owned; final fallback order remains in root to preserve truthfulness. | boundary tests, existing resultMapper tests | High if next action is dropped for approval denial. |
| Test-only contract fixtures | `core/query/resultMapper.test.ts` | Harness / Eval plus Result Surface | `core/query/resultMapperBoundary.test.ts` | facade existing helpers | Boundary tests should cover facade-level classification without changing fixtures into product logic. | boundary tests | Low if kept test-local. |

## Facade Ownership

### `terminalClassificationProjection.ts`

Owns pure terminal label projection from `TerminalReason` and continuation
facts. It does not override explicit terminal classifications supplied by the
query terminal; `resultMapper.ts` remains responsible for that precedence.

### `actionableBlockerModule.ts`

Owns stable actionable blocker kinds, evidence marker parsing, reason
selection, and approval-denied next-action projection. It consumes safe
result/evidence summaries only and does not execute command, MCP, browser,
edit, provider, permission, or workspace behavior.

### `capabilityResultClassification.ts`

Owns capability-result classification helpers used by the root composer:
successful mutation with verification caveat, hard failure signals, and
approved bash execution failure provenance. It does not run capabilities or
change verification behavior.

## ResultMapper Ownership After Extraction

`resultMapper.ts` remains the acceptable Result Surface truthfulness root when
it only:

- selects the latest coding result from the transcript
- preserves the top-level `OrchestrationResult` shape
- preserves explicit terminal facts before fallback projection
- calls Result Surface facades in the existing mapping order
- owns final fallback behavior for completed/stopped/error truthfulness

## Stop Conditions Rechecked

No package dependency changes are planned. Provider live calls, browser
execution, edit execution, permission/workspace behavior, session schema, CLI
surface, and result-contract expectations stay outside this route.

## Final Classification

`resultMapper.ts` is acceptable as the Result Surface truthfulness composition
root after this extraction. The current central-file pass is complete for the
atlas set; future work should be selected by module lifecycle gap and product
risk rather than by central-file size.

Best next action: choose either `Harness / gate taxonomy` when release/report
confidence is the blocker, or `Edit / Patch thin integration` when mutation
capability is explicitly prioritized.
