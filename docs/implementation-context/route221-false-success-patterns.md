# Route221 False-Success Patterns

Status: frozen development harness input.

Route221 is not a feature route. This document records the false-success
patterns discovered while auditing Route207-220 and defines the patterns future
routes must defend against before claiming `COMPLETE`.

## Evidence Rule

Future routes may add route-local tests, fixtures, and benchmarks, but those
checks can only protect regression coverage. They cannot be the primary proof
for `COMPLETE` unless the route also supplies frozen-task, product-path, or
pre-existing gate evidence with negative controls.

## Patterns

| Pattern | False claim | Required correction |
|---|---|---|
| Demo-only completion | A demo path ran, so the capability exists. | Classify as `focused-only` or `route-local-benchmark` unless the product path and frozen task pass. |
| Export-only completion | A report, projection, or display surface exists, so the runtime capability exists. | Prove the producer, consumer, and terminal/result semantics on the product path. |
| Route-local benchmark completion | A benchmark created by the same route passed, so the route is `COMPLETE`. | Use route-local benchmarks only as secondary evidence; primary evidence must include frozen/product/pre-existing gates. |
| Fake/focused mislabeled as product capability | Synthetic provider or focused fixture evidence is reported as live or product proof. | Keep `fake/focused-only`, `focused-only`, `benchmark-proven`, `live-provider-proven`, and `product-proven` distinct. |
| Review-ready mislabeled as apply-ready | A patch proposal or review surface exists, so mutation is ready or done. | Keep proposal, confirmation, apply, readback, and verification as separate verdict fields. |
| Continuation-created mislabeled as repair success | A repair continuation was created, so the task was repaired. | Repair success requires repair apply plus post-repair verification. |
| Command-channel proof mislabeled as task-relevant verification | Any command passed, so the task was verified. | Verification evidence must show the command is task-relevant, dispatched, passed, and tied to the changed target. |
| Local stdout invisible to audit | The main thread saw console output that is not in a durable artifact. | Put task verdicts, counters, and evidence classifications in committed artifacts or verifier output. |
| Main-thread override of audit `PARTIAL` | A process exited zero or the main thread reinterpreted `PARTIAL` as `COMPLETE`. | A `PARTIAL` audit can only become `COMPLETE` after an independent rerun returns `PASS`. |
| Apply without verification | Files changed, so the task succeeded. | Apply is only mutation evidence. Success requires readback and required verification evidence. |
| Default-safe mislabeled as completed work | The route did not write, call providers, or run commands, so it succeeded. | Default safety is safety evidence, not task completion evidence. |

## Non-Negotiable Classifications

- Fake provider evidence is never live provider evidence.
- Focused tests are never broad product proof by themselves.
- Route-local benchmark evidence is never primary `COMPLETE` evidence by itself.
- Repair proposal is not repair apply.
- Repair continuation is not repair success.
- Apply without verification is not task success.
- Audit `PARTIAL` remains `PARTIAL` unless an independent rerun returns `PASS`.

## Use In Future Routes

Every future capability route report should identify which of these patterns it
could accidentally trigger, which frozen tasks were used to prevent that
overclaim, and which claims remain `not-proven`.
