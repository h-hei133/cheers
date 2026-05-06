# single-file apply_patch real provider non-mutating dry-run gate

## Decision

Add a real-provider gate contract for the single-file `apply_patch`
production-adjacent opt-in dry-run route.

This step does not run a real provider by default and does not read, print,
copy, modify, clean, or commit `/home/wang/.private-agents-real`. It does not
modify provider/auth core, release gates, CLI, SessionManager,
`runMvpIntegratedFlow`, `resultMapper.ts`, `sessionRuntime.ts`, or writer code.

## Gate Preconditions

The real provider non-mutating dry-run gate may run only after:

- explicit operator opt-in for this gate
- synthetic opt-in dry-run integration passed
- isolated fixture is prepared outside the real repository
- no-write mode is active
- route output is no-write and non-success-like
- redaction check is enabled
- before/after repository cleanliness checks are planned

The gate must not use `/home/wang/.private-agents-real` as runtime home, must
not print provider config paths/content, and must not expose auth/key/provider
configuration.

## Contract

The gate records:

- `explicitOptIn`
- `syntheticRouteValidated`
- `isolatedFixture=true`
- `noWriteMode=true`
- `privateAgentsRealRead=false`
- `providerConfigPrinted=false`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `noAppliedPatchRecord=true`
- redaction result and leak list
- failure attribution

Failure attribution categories:

- `explicit-opt-in-missing`
- `synthetic-route-not-validated`
- `route-failure`
- `redaction-failure`
- `unexpected-write`
- `unexpected-success-claim`

## Real Provider Gate Command Policy

When a future execution explicitly opts in, run the gate only after focused
synthetic validation:

```bash
rtk git status --short
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSyntheticOptInDryRunIntegration.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRealProviderDryRunGate.test.ts
```

Then run the future real-provider smoke command with an isolated runtime home
and fixture. The smoke command must be explicit opt-in, no-write, and
redaction-checked. It must record:

- provider failure
- route failure
- redaction failure
- unexpected write
- unexpected success claim

Before and after the smoke:

```bash
rtk git status --short
```

If `rtk` audit residue is created, clean or restore it before committing. If
`rtk git status` itself recreates audit residue, use the smallest raw git
status/restore needed and state why RTK was not sufficient.

## Current Implementation Boundary

This step adds only the gate contract and focused contract tests. It deliberately
does not add a default real-provider smoke command because real provider
execution requires a separate explicit runtime opt-in and isolated environment
confirmation.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRealProviderDryRunGate.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSyntheticOptInDryRunIntegration.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchOptInDryRunRoute.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Phase Seal

After this step, the production opt-in dry-run route phase is represented
through:

1. opt-in route seam
2. synthetic no-write integration
3. real-provider non-mutating gate contract

Production write remains blocked. Writer remains unreachable.
