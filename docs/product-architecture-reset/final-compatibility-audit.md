# Final Architecture Compatibility Audit

Reset Route I audited the final G/H/I reset state. This is an audit artifact,
not a feature plan and not a product-readiness upgrade.

## Reset Route Status

| Route | Status | Evidence |
|---|---|---|
| G: scripts/package surface grouping | COMPLETE | `verify:product:*`, `verify:evidence:*`, `verify:provider:*`, `verify:release:*`, and `verify:route-history:*` aliases exist. Old aliases remain. Commit `c95881c`. |
| H: route history quarantine move | COMPLETE with scoped debt | Thirty historical `scripts/route*.ts` runners moved to `scripts/dev-history/routes/`; old and grouped aliases resolve to moved scripts. Route docs and report JSON remain indexed but unmoved for compatibility. Commit `a31f354`. |
| I: final audit | COMPLETE | Current audit found no product runtime imports from docs/scripts/history, no provider default enablement, and no evidence truthfulness weakening. |

## Compatibility Findings

- Product runtime import boundary: no non-test TypeScript source import from
  docs, scripts, dev-history, agent-routes, or implementation-context.
- Grouped package commands exist:
  - `verify:product:*`: 11 aliases.
  - `verify:evidence:*`: 5 aliases.
  - `verify:provider:*`: 6 aliases.
  - `verify:release:*`: 5 aliases.
  - `verify:route-history:*`: 32 aliases.
- Top-level `scripts/route*.ts` count is zero; quarantined route runner count
  under `scripts/dev-history/routes/` is thirty.
- Old route aliases remain the compatibility surface and still resolve through
  `package.json`.
- Route221 schema, frozen tasks, fixtures, and gate stayed at their existing
  paths and remain active evidence infrastructure.
- Route227 and Route228 reports stayed historical snapshots. They were not
  promoted to runtime truth or default product readiness.

## Truthfulness Findings

- Result contract and Route221 anti-false-success gates pass.
- Route208 route-history smoke reports `realProviderTouched=false`,
  `providerMode=synthetic`, and stopped/not-ready states remain stopped rather
  than success.
- CLI print/session gate still reports stopped/partial states truthfully and
  keeps real provider home unused by default.
- No validation evidence showed a skipped, partial, not-proven, or blocked
  state becoming success.

## Provider Boundary

No live provider gate was run. Provider and live command names remain opt-in
surfaces. The reset did not add `PRIVATE_AGENTS_REAL_HOME` to default test,
build, product, evidence, route-history, or release aliases.

## Facade Ownership

`packages/ts-shell/src/product/*` facades are reset compatibility facades unless
a later route proves one is the final domain owner. The current named migration
targets are:

- evidence/verdict -> durable evidence/result domain.
- providerProposal -> provider/proposal domain modules.
- edit -> edit authority, apply, readback, and recovery modules.
- verification -> verification dispatch, command planning, and verifier receipt
  modules.
- repair -> repair iteration and repair evidence modules.
- turn -> already documented as a compatibility entrypoint around
  `runMvpIntegratedFlow`.

## Remaining Route Clutter

- `docs/agent-routes/route*.md` remains in place for direct-link compatibility.
- `docs/implementation-context/route*-report.json` and Route227/228 summaries
  remain in place because producers, reports, and Route221 checks still refer
  to those paths.
- `scripts/verify-route205-*`, `scripts/verify-route206-*`, and
  `scripts/verify-route221-anti-false-success-gate.mjs` remain at top level.
  Route221 is active evidence infrastructure; Route205/206 wrappers need a
  separate compatibility move if route verifier wrappers are quarantined later.
- Route labels still appear in product/evidence tests and historical report
  adapters where they preserve provenance.

## Validation Ledger

All listed commands passed:

- `npm test -w packages/ts-shell -- src/product/evidence/verdictFacade.test.ts src/product/providerProposal/providerProposalFacade.test.ts src/product/edit/editFacade.test.ts src/product/verification/verificationFacade.test.ts src/product/repair/repairFacade.test.ts src/product/turn/turnFacade.test.ts src/core/query/resultMapper.test.ts src/core/query/resultMapperBoundary.test.ts`
- `npm run verify:result-contract`
- `npm run verify:route221-anti-false-success-gate`
- `npm run verify:route-history:route208-product-path-benchmark`
- `npm run verify:product:cli-entry`
- `npm run build -w packages/ts-shell`
- Non-test TypeScript import scan for docs/scripts/history imports.
- Provider default-off package script inspection.
- `git diff --check`

## Final Judgment

The reset reduced route-grown project surface by grouping package commands and
moving route runner scripts out of the top-level script namespace. It did not
finish every historical quarantine: route docs, route report JSON, and active
Route221 evidence assets remain compatibility-bound. The repository is ready
for post-reset feature development if future work respects these remaining
compatibility boundaries instead of treating route-history evidence as runtime
truth.

