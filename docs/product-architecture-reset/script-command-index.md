# Script Command Index

This index records the Reset Route G package-command grouping. It is a command
surface map only; old commands remain supported compatibility aliases.

## Grouped Command Families

| Group | Purpose | Compatibility rule |
|---|---|---|
| `verify:product:*` | Product/runtime invariant checks such as CLI, session, MCP, workspace safety, and result-contract gates. | Calls the existing focused `verify:*` command. |
| `verify:evidence:*` | Evidence, report, result truthfulness, and anti-false-success gates. | Calls the existing evidence or Route221 gate command. |
| `verify:provider:*` | Explicit provider-readiness or real-provider checks. | Calls existing provider commands and does not make them default. Real/live aliases remain opt-in. |
| `verify:release:*` | Release gates. | Existing release commands stay in place; `verify:release:gate` aliases the old release-gate test. |
| `verify:route-history:*` | Route-era verifiers and benchmarks kept for provenance. | Calls existing `verify:route*` commands; old names remain valid. |
| `demo:route-history:*` | Route-era demos kept for provenance. | Calls the existing route demo command. |

## Backing Script Namespaces

Reset Route H moved historical `scripts/route*.ts` runners to
`scripts/dev-history/routes/`. Package commands are the compatibility surface:
old `verify:route*` aliases and new `verify:route-history:*` aliases both
resolve to the moved scripts.

`scripts/verify-route221-anti-false-success-gate.mjs` stayed at its old path
because it is active evidence infrastructure, not simple route history.

## Active Evidence Exceptions

`verify:route221-anti-false-success-gate` is route-named but remains active
evidence infrastructure. The grouped aliases intentionally expose it through
both `verify:evidence:route221-anti-false-success-gate` and
`verify:route-history:route221-anti-false-success-gate` until a later route can
move the backing script and fixtures without weakening the gate.

Route227 and Route228 commands and reports remain historical evidence snapshots.
The grouped route-history aliases preserve discoverability; they do not promote
historical provider/live results into current product readiness.

## Provider Opt-In Boundary

Provider or live aliases do not set `PRIVATE_AGENTS_REAL_HOME` and are not
included in default `test`, `build`, product, evidence, or release aliases added
by this route. Running a real-provider gate still requires the existing explicit
opt-in environment and isolated runtime directories.

## Route G Validation Representatives

Use a small representative set instead of sweeping all route-history commands:

- Old product alias: `npm run verify:cli-entry`.
- New product alias: `npm run verify:product:cli-entry`.
- Old evidence alias: `npm run verify:route221-anti-false-success-gate`.
- New evidence alias: `npm run verify:evidence:route221-anti-false-success-gate`.
- Old route-history alias: `npm run verify:route205-repair-proof-chain`.
- New route-history alias: `npm run verify:route-history:route205-repair-proof-chain`.
- Provider opt-in check: inspect package scripts and do not run live provider.
