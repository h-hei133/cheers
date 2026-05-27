# runMvpIntegratedFlow Baseline Drift Register

This register is the Phase 2.5 Phase A baseline record for
`packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`.

## Current Full Suite Result

Command:

```text
npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
```

Result reproduced on 2026-05-27:

```text
167 tests, 133 passed, 34 failed
```

This suite is not a trusted green gate. The failures are classified below
instead of hidden or mass-rebaselined.

## Trusted Focused Baseline

Use this focused baseline when a route needs a narrow runMvp truthfulness
signal without depending on the unresolved legacy characterization cases:

```text
npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "renders mutation verification delivery from aggregated summary|reconciles mutation summary into aggregate without duplicating evidence|covers prompt -> handoff -> tool approval -> streamed result|denies escalation and terminates with explicit stopped_error terminal|keeps apply_patch workspace write opt-in no-write when approval is denied|routes explicit apply_patch runtime opt-in through the no-write surface|fails fast when real provider mode has no API key|keeps default task transcript internal while hiding role labels from output"
```

Reproduced result:

```text
8 passed, 159 skipped
```

The focused baseline covers current delivery formatting, mutation aggregation,
tool approval streaming, denied escalation, apply_patch no-write truthfulness,
real-provider missing-key failure, and transcript presentation. It is not a
replacement for the full legacy suite.

## Failure Family Classification

| Family | Failing tests | Current observed mismatch | Classification | Phase A action |
|---|---:|---|---|---|
| Read/inspect and repo-diagnosis completion expectations | 7 | Tests expect `completed`; runtime now returns `stopped_error` or lacks older diagnosis detail. | Unresolved; likely stale characterization in no-write/read-stage routing, but current contract needs a dedicated read/diagnosis route before rebaseline. | Recorded only. |
| Command allowlist blocker text | 3 | Tests expect old run-command allowlist blocker text; runtime returns `read-stage-required`. | Stale expectation or product contract drift; wording is externally visible and not safe to rebaseline casually. | Recorded only. |
| Write-intent target/content classification | 1 | Test expects `write-file`; runtime classifies as `repo-explain`. | Unresolved; may be stale prompt intent characterization or real routing drift. | Recorded only. |
| Continuation relocation blocker output text | 2 | Tests expect `Task not completed`; runtime preserves stopped status but uses newer planning-runtime output. | Stale output characterization; low risk in principle, but not rebaselined without the complete terminal wording contract. | Recorded only. |
| Ambiguous target/blocker wording | 6 | Tests expect old `ambiguous-target`, `Multiple sibling target files`, `Outcome: blocked`, or subtask-slot wording; runtime emits newer planning-runtime review text. | Stale characterization / unresolved blocker-surface drift. | Recorded only. |
| Verification status vocabulary | 3 | Tests expect `skipped`; runtime returns `not-requested` for some stopped repair/continuation paths. | Stale characterization, but coupled to stop reasons and verification vocabulary. Not safe to mass-rebaseline. | Recorded only. |
| Low-risk edit/write success expectations | 10 | Tests expect `completed` plus changed-file/verification evidence; runtime stops before mutation or verification evidence. | Unresolved; could be stale characterization or real product behavior drift. | Recorded only; no success upgrade. |
| Continuation lineage evidence marker | 1 | Test expects historical marker `continuation-lineage-activation-clarify:cross-file-candidate`; evidence no longer includes it. | Deprecated characterization / stale evidence-surface expectation. | Recorded only. |
| Verify continuation blocker text | 2 | Tests expect explicit verify-continuation unavailable text; runtime returns `read-stage-required`. | Stale expectation or result-surface drift. | Recorded only. |

## Failing Test Inventory

| Test | Classification |
|---|---|
| derives file-oriented intent from prompt and uses glob without default bash demo path | Unresolved read/inspect completion expectation. |
| blocks dir/list-directory command intent instead of node --version fallback | Stale command allowlist blocker text or product contract drift. |
| keeps multi-suffix targets stable for write tasks | Unresolved write-intent classification drift. |
| truthfully blocks continuation relocation when multiple candidates are ambiguous | Stale continuation blocker output characterization. |
| truthfully blocks continuation relocation when no recovery path exists | Stale continuation blocker output characterization. |
| routes runtime why/how questions to repo diagnosis instead of generic chat | Unresolved repo-diagnosis completion expectation. |
| classifies symptom-oriented repo diagnosis as needs-verification with grounded evidence | Unresolved repo-diagnosis detail expectation. |
| targetResolution blocker stops ambiguous sibling edit before mutation | Stale blocker output characterization. |
| repairs edit-transform-unclear follow-up by reusing the target for fenced replacement | Stale verification status vocabulary. |
| keeps corrective post-edit follow-up as edit even when it also asks to verify | Unresolved edit success expectation. |
| stops unsupported batch edit across multiple files actionably | Stale ambiguous-target wording characterization. |
| runs low-risk content verification after a file edit | Unresolved write/verification success expectation. |
| runs low-risk multi-file consistency verification after a file edit | Unresolved edit/verification success expectation. |
| keeps multi-file consistency source separate from append target | Unresolved multi-file edit success expectation. |
| verifies constrained multi-file code edits preserve protected files | Unresolved multi-file edit success expectation. |
| runs a constrained small refactor and keeps usage/protected files in sync | Stale ambiguous-target wording characterization. |
| verifies README-only correction while nested code paths stay unchanged | Unresolved edit/verification success expectation. |
| runs a constrained small bugfix and comment correction with protected files | Unresolved edit success expectation. |
| creates and corrects a usage example file while preserving source files | Unresolved create/edit success expectation. |
| fails low-risk multi-file consistency verification when target misses source item | Unresolved changed-file and verification-failure evidence expectation. |
| runs a small code edit plus README correction with low-risk file verification | Stale ambiguous-target wording characterization. |
| returns deterministic failure boundary for partial batch edit failure | Stale ambiguous-target wording characterization. |
| keeps no-write inspect flow provider-free in real mode | Unresolved no-write inspect completion expectation. |
| does not consume custom provider config on no-write inspect flow | Unresolved no-write inspect completion expectation. |
| does not enter provider retry path for no-write inspect flow | Unresolved no-write inspect completion expectation. |
| promotes weak-evidence corrective continuation into executable repair instead of continuity summary | Stale verification status/stop-reason characterization. |
| avoids repeating the previous direction for same-file corrective continuation when alternate transforms exist | Stale verification status/stop-reason characterization. |
| returns clarify for weak/no-cue follow-up when same-file slot confidence is low | Stale blocker wording characterization. |
| returns blocker disambiguation for weak/no-cue follow-up when cross-file reopen candidates are ambiguous | Deprecated continuation lineage evidence marker expectation. |
| retires stale blocker evidence for generic temporal re-entry while allowing explicit transform override | Stale missing-transform blocker wording characterization. |
| unifies post-exhaustion cross-file ultra-weak cues to a single missing-transform blocker surface | Stale missing-transform blocker wording characterization. |
| truthfully blocks verify continuation when structured verify object misses command evidence | Stale verify-continuation blocker text or product contract drift. |
| truthfully blocks verify resume when verify object cwd authority mismatches workspace root | Stale verify-continuation blocker text or product contract drift. |
| blocks command intents outside MVP allowlist with actionable stopped_error | Stale command allowlist blocker text or product contract drift. |

## Phase A Decision

No product runtime behavior was changed. No failing expectation was rebaselined
in code because the candidate low-risk updates touched verification vocabulary
or externally visible blocker wording and could mask result-surface drift.

The full suite remains a legacy characterization suite with classified drift.
Future repair should be split by owner route: read/diagnosis routing, blocker
surface wording, verification vocabulary, edit/write success contracts, and
continuation lineage evidence.

## Phase 2.6-A Recovery Result

Command:

```text
npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
```

Result reproduced after recovery on 2026-05-27:

```text
167 tests, 167 passed
```

All 34 previously recorded failures were resolved.

Runtime fixes:

- Task lifecycle activation no longer preempts ordinary verify-after-edit or
  repair-follow-up prompts unless the prompt explicitly requests a lifecycle,
  readiness, analysis brief, execution plan, context, or related-read surface.
- Run-command blocker plans with `blockedReason`/`targetMissing` now preserve
  the existing command-blocker route instead of being converted to a generic
  lifecycle `read-stage-required` surface.

Current-contract test rewrites:

- Read/inspect, repo-diagnosis, no-write provider-free inspect, ambiguous
  target, continuation relocation, and ultra-weak continuation cases now assert
  the current planning-runtime no-write/review-only handoff contract instead of
  older completed-output or route-era wording.
- Verification vocabulary assertions now preserve the current stopped,
  not-run/not-proven, no-write semantics instead of expecting old skipped or
  lineage marker strings.

Truthfulness notes:

- No stopped, partial, blocked, skipped, not-run, no-provider, or not-proven
  state was converted into success.
- Current planning-runtime review-only handoffs remain `stopped_error` and
  carry `planning-runtime-product:no-write-default`.
- Route221 anti-false-success evidence infrastructure remains unchanged.
