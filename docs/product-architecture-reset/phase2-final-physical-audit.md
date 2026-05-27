# Phase 2 Final Physical Architecture Audit

This audit closes Phase 2 Goal 3. It records current repository facts after the
Goal 0/1/2 physical reset checkpoints and this Goal 3 outer cleanup.

## Final Status

Status: COMPLETE for Phase 2 Goal 3.

The goal was an architecture cleanup/audit route, not a feature route. No
product runtime behavior, provider default, session schema, Route221 evidence
infrastructure, Route227/228 report path, or package command behavior was
intentionally changed.

## Baseline Drift Classification

The full `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
suite is not a clean baseline.

Current sampled command:

```text
npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
```

Current result:

```text
167 tests, 133 passed, 34 failed
```

The failures were present before any Goal 3 file edits in this checkpoint. The
current `HEAD` before edits was clean, and `HEAD` only added the Goal 3 route
document after the previous Goal 2 checkpoint; there are no changes between
`5e02556` and `HEAD` in `runMvpIntegratedFlow.ts`,
`runMvpIntegratedFlow.test.ts`, `SessionManager.ts`, or
`turn/roleDraftStage.ts`.

| Failure family | Sample expectations | Classification | Current action |
|---|---|---|---|
| Read/inspect and repo-diagnosis expectations | expected `completed`, received `stopped_error` or `read-stage-required` | Unresolved baseline drift; likely stale characterization where current runtime is more conservative, but not fixed in this audit route. | Recorded, not hidden. |
| Command allowlist/blocker text expectations | expected old command-blocker text, received `read-stage-required` | Stale expectation or product contract drift; needs a dedicated runtime/result route to decide wording and lifecycle contract. | Recorded, not rebaselined. |
| Ambiguous target and continuation relocation blockers | expected old `Task not completed`, `Outcome: blocked`, or specific blocker strings | Stale expectation / unresolved characterization drift. | Recorded, not rebaselined. |
| Verification status expectations | expected `skipped`, received `not-requested` | Unresolved result-surface characterization drift; touches truthfulness vocabulary and must not be changed casually. | Recorded, not rebaselined. |
| Low-risk write/edit verification scenarios | expected `completed`, received `stopped_error` | Unresolved; could be stale expectation or real product drift. | Not fixed because this route forbids feature/runtime behavior work. |
| Continuation lineage evidence marker expectations | expected exact historical evidence marker strings | Deprecated characterization or stale evidence-surface expectation. | Recorded, not rebaselined. |

This audit does not claim the full suite is green. Focused Goal 3 validations
must be read separately from this known broad-suite drift.

## Cleaned Or Re-Owned Families

Goal 3 re-owned the `packages/ts-shell/src/core/harness/` artifact family in
place:

- Added `packages/ts-shell/src/core/harness/README.md`.
- Added `docs/product-architecture-reset/harness-eval-artifact-index.md`.
- Classified browser/CLI/agent scenario harnesses, browser transaction
  evidence, browser eval benchmark files, Playwright tests, and public read-only
  smoke config as dev/eval harness or compatibility adapter surfaces.
- Preserved old paths and import compatibility.

No Route221 schema, frozen tasks, fixtures, or anti-false-success gate moved.
No Route227/228 historical report paths moved.

## Compatibility And Provenance

Compatibility preserved:

- Old harness import paths remain unchanged.
- `verify:browser-txn-gate` remains the focused browser transaction harness
  gate.
- Route history docs remain at `docs/agent-routes/route*.md`.
- Historical route reports remain at `docs/implementation-context/route*-report.json`.
- Route runner scripts remain quarantined under `scripts/dev-history/routes/`.
- Old package aliases remain available.

Provenance preserved:

- Route labels and `Mvp`/`gauntlet`/`closeout` names in harness files were not
  rewritten.
- Route221 remains active evidence infrastructure.
- Route227/228 remain historical evidence snapshots, not runtime truth.

## Boundary Audit

Product/runtime source did not gain imports from docs, scripts, dev-history,
route reports, or route-history docs. The required import scan is:

```text
rg -n "from .*docs|from .*scripts|from .*dev-history|docs/|scripts/|dev-history|agent-routes|implementation-context" packages/ts-shell/src --glob "*.ts" --glob "*.tsx" --glob "!**/*.test.ts" --glob "!**/README.md"
```

Remaining structural debt:

- `core/harness/` still lives under `core` and should later be split by
  subfamily, not bulk-moved.
- `runMvpIntegratedFlow.test.ts` has unresolved broad-suite drift.
- Route docs and route reports are indexed but still path-compatible in their
  historical locations.
- Route221 active evidence assets still carry route-era names by design.
- Package script inventory counts from Route A are a baseline snapshot; current
  package scripts include later grouped aliases.

## Truthfulness Impact

No truthfulness behavior changed. This checkpoint did not alter evidence,
result mapping, redaction, provider selection, write authorization, verification
status, session persistence, or CLI result classification.

Skipped, partial, blocked, not-proven, not-run, and no-provider states were not
converted into success.

## Recommendation

Return to feature work is safe if future work respects the remaining
compatibility boundaries and does not treat the full
`runMvpIntegratedFlow.test.ts` suite as green.

Continue to a Phase 2.5 cleanup only if the next route explicitly owns one of
these debts:

- rebaseline or repair the `runMvpIntegratedFlow.test.ts` broad-suite drift;
- split one `core/harness/` subfamily with compatibility shims;
- migrate route reports behind a provenance-preserving evidence index;
- split browser/runtime harness ownership out of `core`.
