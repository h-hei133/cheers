# Routes 01-12 Closeout Audit

Date: 2026-05-12
Route: 13
Status: complete audit, documentation only

## Summary

Routes 01-12 are closed against the current deterministic evidence. The project
remains limited dogfood / deterministic release-candidate ready for the bounded
surface only. This audit found no capability widening, no default gate change,
no real-provider default readiness claim, and no external/user-configured MCP
readiness claim.

No product code was changed by Route 13. The only documentation drift found was
that Route 12 planned-files stopped/no-write continuity was not yet reflected in
the main state/runbook wording.

## Route Closeout Table

| Route | Claimed outcome | Current evidence | Result | Remaining limitation |
| ---: | --- | --- | --- | --- |
| 01 | Opt-in real candidate mutation happy paths passed for single-file update, single-file create, and exactly-two update. | `verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`; current real suite remains explicit opt-in and listed only in this audit. | Closed as non-default prior evidence; no full real execution run in Route 13. | No broad real-provider mutation readiness claim. |
| 02 | Candidate mutation failure taxonomy stabilized. | `verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test`. | Pass. | Taxonomy evidence is deterministic; real provider failures remain separately attributed. |
| 03 | Deterministic two-file CLI/user-entry evidence added. | `verify:real-user-capabilities:two-file-cli-evidence`. | Pass. | Exactly-two write remains candidate-only, not MVP/default. |
| 04 | Mutation routing projection helper extracted. | `mutationRoutingProjection.ts`; candidate mutation suite. | Pass. | Projection does not widen write support. |
| 05 | Compact continuity summary builder extracted. | `compactContinuitySummary.ts`; session durability and mutation continuity checks. | Pass. | Continuity evidence does not imply arbitrary long real-provider sessions. |
| 06 | MCP error taxonomy improved without external MCP readiness claims. | `verify:mcp:error-taxonomy`. | Pass. | External/user-configured MCP remains unclaimed. |
| 07 | Live TTY limited dogfood manual checklist created. | `docs/manual-checks/live-tty-limited-dogfood-checklist.md`. | Closed as manual-only guidance. | Not a default gate or release-readiness claim. |
| 08 | Unsupported patch E2E verifier added. | `verify:real-user-capabilities:unsupported-patch-e2e`. | Pass. | Deterministic real-model-like evidence only; no unsupported mutation support. |
| 09 | Release/readiness claims audited. | `verify:release:deterministic`; docs wording. | Pass. | Broad/general release remains forbidden. |
| 10 | Three-file planning/no-write evaluated. | `docs/design/three-file-planning-no-write-evaluation.md`. | Closed as evaluation only. | No 3-file write support. |
| 11 | Exactly-three existing-file Update File planning/no-write added. | `verify:real-user-capabilities:three-file-planning-no-write`. | Pass. | Stopped/no-write only; no writer reachability. |
| 12 | Planned-files stopped/no-write continuity added. | `verify:real-user-capabilities:planned-files-continuity`. | Pass. | Planned files are not changed files and are not write success evidence. |

## Gate And Capability Audit

Default gates did not change during Route 13. `verify:release:deterministic`
still reports `realProviderTouched=false`, `candidateMutationRealExecuted=false`,
`externalMcpServerUsed=false`, `userMcpConfigUsed=false`, and
`broadReleaseReady=false`.

Current mutation boundary:

- MVP: selected-workspace existing-file single-file `Update File`.
- Candidate: single-file `Add File` create.
- Candidate: exactly-two existing-file `Update File` write.
- Candidate/no-write: exactly-two planning/preflight and exactly-three
  planning/no-write.
- Unsupported: 3-file writes, 3+ files, delete/move, broad `apply_patch`,
  rollback, atomicity, fuzzy/AST patching, and arbitrary project mutation.

Result surfaces remain distinct:

- success: verified writes report `changedFiles`.
- stopped/error: unsupported, partial, route, model-output, and post-write
  failures do not become success claims.
- planned-files: exactly-three planning/no-write reports target/planned files
  while keeping `changedFiles=[]` and writer invocation false.

## Verification

All required Route 13 commands passed:

- `rtk git status --short --branch`
- `rtk git log --oneline -35`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test`
- `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`
- `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e`
- `rtk npm run verify:real-user-capabilities:three-file-planning-no-write`
- `rtk npm run verify:real-user-capabilities:planned-files-continuity`
- `rtk npm run verify:session-durability:long`
- `rtk npm run verify:mcp:local-execution`
- `rtk npm run verify:mcp:error-taxonomy`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`
- `rtk npm run verify:real-user-capabilities -- --tier=mvp`
- `rtk npm run verify:provider-readiness:real`
- `rtk npm run verify:provider-readiness:real -- --classification-self-test`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk npm run verify:release:deterministic`

## Real Provider And MCP Claims

Full opt-in real-provider execution was not run in Route 13. Dry-run/listing and
default readiness checks did not load or read the real provider home and did not
print secrets. Real-provider candidate mutation remains explicit opt-in only.

MCP evidence remains local and deterministic. The project does not claim
external MCP, user-configured MCP, remote MCP, or arbitrary MCP ecosystem
readiness.

## Architecture Debt And Next Surface

The route sequence reduced local risk by extracting projection/continuity
helpers and adding deterministic gates, but `scripts/verify-real-user-capabilities.mjs`
is now a large mixed verifier that owns many scenario families. The next bounded
surface should be verifier decomposition, not new mutation capability.

Recommended next route:

- Extract candidate mutation scenario definitions and result classification
  helpers from `scripts/verify-real-user-capabilities.mjs` into focused
  script-support modules.
- Preserve every command-line flag, output marker, status code, default gate,
  real-provider opt-in behavior, and redaction boundary.
- Do not change provider/auth core, MCP core, mutation write capability,
  route behavior, or release/default gate membership.
- Validate with the candidate mutation suite, failure taxonomy self-test,
  dry-run real listing, MVP gate, provider readiness default/classification
  checks, result contract, TS shell build, deterministic release, and diff
  hygiene.
