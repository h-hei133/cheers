# single-file apply_patch synthetic isolated write lane

## Decision

Add a synthetic isolated fixture write lane for single-file `apply_patch`.

The lane is not default production wiring. It writes only through an injected
fixture writer after the write decision gate returns `approved-for-write` and
final stale-read passes after approval.

## Boundary

The lane requires:

- explicit `approved-for-write`
- digest-bound permission UX evidence
- final stale-read pass after approval
- one verified `Update File` operation
- injected isolated fixture `writeFile`

It permits:

- `changedFiles=[fixture target]`
- `writeIntents=[fixture target]`
- terminal success only for the isolated fixture write

It keeps:

- `productionWriterInvoked=false`
- `noProductionWrite=true`
- no applied production patch record
- default production `apply_patch` / unified diff rejection unchanged

## Required proofs

- Pending permission blocks without fixture changes.
- Stale fixture content blocks after approval and before the fixture writer.
- Unsupported multi-file/add/delete/move shapes block before writing.
- Successful write changes only the approved fixture target.
- `LOCKED.md` and unrelated fixture files remain unchanged.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/isolatedWriteLane.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/writeDecisionGate.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next step

Proceed to a real-provider isolated fixture write smoke only after this
synthetic lane passes. The real-provider gate must be explicit opt-in, redacted,
and confined to a temporary fixture.
