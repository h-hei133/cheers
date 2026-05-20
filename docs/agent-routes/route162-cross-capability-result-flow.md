# Route 162: Cross-capability stopped/result flow integration

## Module

- Primary module: Result Surface Engineering
- Secondary modules:
  - Provider / Model Engineering
  - Browser Engineering
  - Edit / Patch Engineering
  - Workspace / File Context Engineering
  - Runtime Engineering
  - Session / Continue Engineering
  - Harness / Eval Engineering
  - Capability Contract Architecture
- Route type: vertical flow integration
- Product behavior boundary:
  - integrate stopped/result/evidence/session handoff for existing non-success paths
  - no provider live calls
  - no browser capability expansion
  - no edit/write capability expansion
  - no new execution path
  - no result truthfulness change

## Goal

Calibrate three existing low-risk vertical flows through the modularized system:

1. Provider result flow
2. Browser unavailable / cleanup / timeout result flow
3. Edit precondition / stopped result flow

This route should use the implementation context pack from Route 161 as the wiring guide, then update it if the actual code path differs.

The goal is not to design a global unified `CapabilityHandoff`.
The goal is to make these three real result flows consistent across:

- owner module facade
- result surface / resultMapper
- session terminal summary
- transcript / continuation-safe evidence
- verifier or focused gates
- implementation-context manifest / recipes

This route is successful when:

- [ ] provider-specific stopped markers are no longer only generic stopped/error facts where the current code has provider-specific information
- [ ] browser unavailable / policy-blocked / timeout / cleanup summaries align with runtime receipt and result surface vocabulary
- [ ] edit missing-target / missing-content / stale-read / unsupported-future-edit stopped flow aligns with workspace/edit/result/session vocabulary
- [ ] no flow gains new execution capability
- [ ] result truthfulness remains stable
- [ ] implementation context files are updated to reflect the actual calibrated flows
- [ ] focused tests and `verify:result-contract` pass
- [ ] package sweep is not required unless escalation conditions are hit

This route is not successful if:

- [ ] it reads real provider config or runs live provider gates
- [ ] it expands browser actions or public web behavior
- [ ] it implements fenced replacement, broad edit, discovery edit, or any new write behavior
- [ ] it weakens permission, workspace authority, stale-read, or result truthfulness
- [ ] it hides capability failures behind completed
- [ ] it introduces a large global handoff abstraction before these flows are calibrated

## Internal inputs

Read the implementation context first:

- `docs/implementation-context/README.md`
- `docs/implementation-context/capability-flow-graph.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`

Then read only the relevant internal architecture docs:

- `docs/architecture/resultmapper-module-extraction.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/session-runtime-module-extraction.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

External references are optional and should not be used by default.

Use external references only if internal contracts conflict or a stopped/failed classification is ambiguous. If used, record:

- exact question being answered
- repository and files read
- decision taken from the reference

Likely useful only if needed:

- opencode for tool/permission result surface
- OpenHands for action/observation result classification
- Inspect AI for eval/report result taxonomy

## Current project surfaces

Likely provider surfaces:

- `packages/ts-shell/src/orchestration/providerModule.ts`
- provider readiness / diagnostic projection files
- provider CLI readiness surfaces if result display is touched

Likely browser surfaces:

- `packages/ts-shell/src/orchestration/browserModule.ts`
- `packages/ts-shell/src/core/context/browserTool.ts`
- `packages/ts-shell/src/core/context/browserTxn.ts`
- `packages/ts-shell/src/core/context/browserTrace.ts`
- `packages/ts-shell/src/core/context/browserTxnReport.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceiptProjection.ts`

Likely edit/workspace surfaces:

- `packages/ts-shell/src/orchestration/editPatchModule.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/futureEditContract.ts`
- `packages/ts-shell/src/orchestration/futureEditPlanner.ts`
- `packages/ts-shell/src/orchestration/workspaceFileContract.ts`
- `packages/ts-shell/src/orchestration/workspaceTargetProjection.ts`

Likely result/session surfaces:

- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/core/query/actionableBlockerModule.ts`
- `packages/ts-shell/src/core/query/capabilityResultClassification.ts`
- `packages/ts-shell/src/core/query/terminalClassificationProjection.ts`
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/core/shell/sessionEventSurface.ts`
- `packages/ts-shell/src/core/shell/sessionPersistenceProjection.ts`

Likely tests:

- resultMapper boundary / resultMapper tests
- provider readiness / provider CLI surface tests
- browser tool / transaction / command runner tests
- edit expectation / future edit / workspace target tests
- sessionRuntime boundary tests if terminal/session output changes
- runMvp tests if orchestration flow changes

Codex should inspect current file names before assuming exact paths.

## Implementation tasks

### 1. Create route closeout doc

Create:

- `docs/architecture/cross-capability-result-flow.md`

This doc should record:

- provider result flow before/after
- browser result/cleanup flow before/after
- edit precondition stopped flow before/after
- exact facades touched
- result states preserved
- tests run
- any implementation-context updates

Keep it concise and technical.

### 2. Provider result flow

Calibrate provider-specific stopped/result flow.

Target states may include current equivalents of:

- provider not configured
- real-provider opt-in required
- unsupported provider/model mode
- provider diagnostic failure
- provider unavailable

Expected behavior:

- no real provider call
- no real provider config read
- no secret or config path exposure
- provider-specific reason code / marker preserved when available
- result surface maps to stopped or failed according to current truthfulness contract
- session terminal summary remains safe
- verifier/result-contract coverage remains stable

Do not add provider functionality. Only integrate existing facts more clearly through the provider -> result surface flow.

### 3. Browser result / cleanup flow

Calibrate browser stopped/result flow.

Target states may include current equivalents of:

- browser unavailable
- Playwright package or binary missing
- browser policy blocked
- browser timeout
- cleanup succeeded / cleanup failed / cleanup unknown
- raw content excluded / redacted

Expected behavior:

- no public browsing expansion
- no new browser action
- no screenshot/OCR expansion
- timeout/cleanup facts remain truthful
- runtime receipt vocabulary is used where appropriate
- result surface and session summaries do not include raw DOM, secrets, hidden values, screenshots, or large dumps
- continuation-safe evidence remains compact

### 4. Edit precondition / stopped flow

Calibrate edit stopped/precondition flow.

Target states may include current equivalents of:

- missing target
- ambiguous target
- missing concrete content
- stale-read blocked
- unsupported future edit
- unsupported broad refactor / discovery edit / fuzzy replacement
- verification not requested / skipped when relevant

Expected behavior:

- no new write behavior
- no fenced replacement implementation
- no multi-file discovery edit
- no generated content from vague prompts
- workspace authority and stale-read semantics unchanged
- stopped reason / do-next is actionable
- result surface/session summary stays consistent with edit expectation and workspace contracts

### 5. Keep the flows separate

Do not collapse provider, browser, and edit into one generic mega-object.

Shared vocabulary may be reused:

- stopped / failed / completed
- reasonCode
- reason
- doNext
- evidenceId
- redaction
- cleanup
- verification

But each flow should keep capability-specific fields where needed.

### 6. Update implementation context

Update files under `docs/implementation-context/` if the code path differs from Route 161 assumptions.

Likely updates:

- provider flow in `capability-flow-manifest.json`
- browser flow in `capability-flow-manifest.json`
- edit/patch flow in `capability-flow-manifest.json`
- recipes for provider diagnostic, browser action/result, result stopped path, and bounded edit preconditions
- `capability-flow-graph.md` if flow order or facade names changed

Do not make the context verbose. Keep it useful for future Codex implementation.

### 7. Add or update focused tests

Add new tests only where they clarify flow boundaries.

Possible new test file:

- `packages/ts-shell/src/core/query/crossCapabilityResultFlow.test.ts`

Or update existing focused tests if that is cleaner.

Required coverage, wherever placed:

- provider not-configured or opt-in-required maps through provider/result surface without secret leakage
- browser unavailable/policy/timeout/cleanup maps through runtime receipt/result surface with redaction
- edit missing target/missing content/stale-read/unsupported future edit maps to actionable stopped
- result truthfulness does not change for unknown hard errors
- completed paths are not introduced for stopped failures
- transcript/session summary is safe when touched

### 8. Update backlog and atlas

Update:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`

Record that the project has started vertical result-flow calibration after the central-file pass and implementation-context pack.

The next route should be chosen from actual findings. Possible next actions:

- continue vertical calibration for tool/runtime success/failure flow
- browser result/session projection follow-up
- edit verification/stale-read closeout
- import boundary audit after several calibrated flows
- only then consider shared handoff extraction if repeated fields stabilize

## Boundaries

Hard boundaries:

- No provider/model live calls.
- No real-provider config reads or secret printing.
- No external MCP execution.
- No browser capability expansion.
- No edit/write capability expansion.
- No broad shell/allowlist expansion.
- No permission weakening.
- No workspace authority change.
- No stale-read behavior change.
- No result truthfulness weakening.
- No session schema or transcript format changes.
- No CLI behavior changes.
- No package/dependency changes.
- No broad abstraction replacing capability-specific flows.
- No hidden skips.
- No commit or push.

Validation tier:

- Tier 3 by default: cross-capability vertical result-flow integration.
- Required:
  - focused provider/browser/edit/result tests touched by this route
  - `verify:result-contract`
  - `verify:edit-capability-closeout` if edit/workspace stopped flow is touched
  - runMvp tests only if orchestration flow is touched
  - build
  - diff/status/package guard
- Package sweep is optional, not default.
- Escalate to package sweep only if:
  - result-contract expectations are broadly rebaselined
  - provider/browser/edit execution behavior changes
  - CLI/session/schema/package scripts change
  - focused gates reveal unexplained failures

## Validation

Suggested commands, adjust to touched files:

- focused provider result tests
- focused browser result/cleanup tests
- focused edit precondition tests
- focused resultMapper/result surface tests
- `rtk npm run verify:result-contract`
- `rtk npm run verify:edit-capability-closeout` if edit path touched
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts` if orchestration flow touched
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`
- `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

Package sweep is not required by default.

## Completion report

Final report should include:

1. Branch and base commit
2. Files changed
3. Provider flow changes
4. Browser flow changes
5. Edit precondition flow changes
6. Result truthfulness preservation
7. Implementation-context updates
8. Validation tier used and why package sweep was or was not run
9. Validation commands and results
10. Real-provider gate status
11. External MCP status
12. Audit/history residue handling
13. Source/package change confirmation
14. Remaining risks
15. Best next action
16. Proposed commit message

Do not commit or push.
