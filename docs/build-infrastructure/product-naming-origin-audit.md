# Product Naming And Origin Audit

Status: BI012 cleanup audit.
Date: 2026-05-29.

## Scope Searched

- Serena targeted inspection was used first across runtime loop, runtime events, browser context/harness, provider-adjacent recent BI surfaces, and current symbols for the newly added loop and browser modules. Serena was available; project onboarding memory initialization reported a missing `.serena` maintenance file, but targeted symbol/search tools worked.
- Text search then covered `packages/ts-shell/src`, `scripts`, root `package.json`, and docs outside explicitly historical folders.
- Focused product cleanup targeted recent BI002-BI011 product surfaces and directly related current browser runtime surfaces.

## Flagged Terms

- External source/product identifiers: `Playwright MCP`, `Stagehand-like`, `stagehand`, `opencode-compatible`, `aligned with opencode`.
- Learning-origin vocabulary in product identity: `reference agent loop`, `ReferenceAgentLoop`, `ReferenceLoop`, `agentLoopReference`.
- BI/process route vocabulary in product tests: `BI002`, `BI003`, `BI008`, `Route 127`, browser `MVP` scenario names, `MVP allowlist`, `pwCloseout`.
- Product field/output names: `mcpBackend`, `MCP backend`, `MCP launched` where the product meaning was only optional browser tool-server status.

## Product Cleanup

- Runtime loop product identity now uses local contract language: `agentLoopContract.ts`, `runAgentLoopContract`, and `AgentLoopContract*` types.
- Runtime event tests now describe local event observations instead of BI route numbers.
- Browser optional backend surfaces now use local `browser-tool-server` and `action-layer` vocabulary instead of external source identity.
- Browser validation report surfaces now use `PwValidationReport`, `createPwValidationReport`, `renderPwValidationReport`, and `toolServerBackend`.
- Browser runtime scenario tests now use `browserRuntimeCapabilityScenario*` names instead of `browserRuntimeMvpScenario*`.
- User-visible command/tool denial wording now says `controlled allowlist` instead of `MVP allowlist`.
- Model command output and account-auth PKCE comment no longer name `opencode`.

## Files Changed

- `packages/ts-shell/src/runtime/loop/agentLoopContract.ts`
- `packages/ts-shell/src/runtime/loop/agentLoopContract.test.ts`
- `packages/ts-shell/src/runtime/events/runtimeEventProjection.test.ts`
- `packages/ts-shell/src/runtime/events/jsonEventStream.test.ts`
- `packages/ts-shell/src/core/context/browserToolServerBackend.ts`
- `packages/ts-shell/src/core/context/browserToolServerBackendComparison.ts`
- `packages/ts-shell/src/core/harness/browserToolServerBackend.test.ts`
- `packages/ts-shell/src/core/harness/browserRuntimeCapabilityScenarioFixtures.ts`
- `packages/ts-shell/src/core/harness/browserRuntimeCapabilityScenarioExamples.test.ts`
- Browser runtime/context/report tests and surfaces under `packages/ts-shell/src/core/context` and `packages/ts-shell/src/core/harness`
- Controlled allowlist wording in focused tool/session/orchestration tests and projections
- `scripts/verify-browser-txn-gate.mjs`

## Left Unchanged

- `runMvpIntegratedFlow.ts` and `runMvpIntegratedFlow.test.ts` retain the legacy compatibility name. Renaming it would break the existing compatibility surface and is outside this cleanup route.
- `editCapabilityCloseoutManifest.ts` and its context consumers retain `closeout` because that manifest is an existing compatibility/status surface used by compact/session/sidebar projections.
- Historical route verifier scripts and package commands such as `verify:route-history:*`, `verify:edit-capability-closeout`, and `verify:real-user-capabilities:mvp` remain as compatibility/history entrypoints.
- Existing `packages/ts-shell/src/core/harness` route labels and older fixture ids remain under the harness README compatibility rule: they are evidence provenance labels, not product runtime ownership.
- Historical docs under `docs/build-infrastructure`, `docs/dev-history`, `docs/evidence/history`, `docs/product-architecture-reset`, `docs/agent-routes`, `docs/design`, and historical architecture/reference notes retain external source names when discussing learning history.
- Local semantic uses of `reference` meaning pointer/authority/receipt reference were not treated as external-origin vocabulary.

## Compatibility Exceptions

- `runMvpIntegratedFlow*`: legacy product compatibility shim and test surface.
- `editCapabilityCloseoutManifest*`: existing edit capability status manifest used across compact/session/sidebar surfaces.
- `verify-edit-capability-closeout.mjs`, `verify-real-provider-task-loop-mvp.mjs`, and route-history package scripts: historical/compatibility command surfaces. They are documented here rather than renamed to avoid breaking existing gates.
- Older `core/harness` route labels, `Mvp`, gauntlet, and validation provenance names covered by `packages/ts-shell/src/core/harness/README.md`.

## Remaining Risks

- The repository still contains many historical architecture docs under `docs/architecture` and `docs/project-map` that mention reference repositories. They were not deleted or rewritten because this route preserves history and prioritizes product surfaces.
- Some route-era vocabulary remains in older browser harness fixtures and compatibility tests under the harness compatibility rule. A later route can decide whether to migrate older fixture labels with shim coverage.
- Public consumers outside the repository could still reference legacy names; no external compatibility scan was performed.

## Search Evidence

- Focused search for `Playwright MCP`, `Stagehand-like`, `stagehand-like`, `playwright-mcp`, `planned-playwright-mcp`, `planned-stagehand-like`, `pwMcp`, `pwCloseout`, `ReferenceAgentLoop`, `ReferenceLoop`, `agentLoopReference`, `BI002`, `BI003`, and `BI008` returned no matches in `packages/ts-shell/src`, `scripts`, or `package.json` after cleanup except compatibility/history names listed above.
- File-name search now leaves only documented compatibility/history hits for `runMvpIntegratedFlow*`, `editCapabilityCloseoutManifest*`, route-history scripts, verifier command shims, and existing harness provenance files covered by the harness README.

## Next Route

Continue with `docs/build-infrastructure/route/route-bi013-tool-hook-permission-interception.md`.
