# runMvp Validation Plan

This route is docs-only, so current validation is limited to path checks,
`git diff --check`, and `git status --short --branch`.

Future implementation routes must run focused validation tied to the phase
being extracted. Do not run live provider unless a future route explicitly
opens a provider gate.

## Always Required After Runtime Extraction

```text
npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
npm run verify:result-contract
npm run verify:route221-anti-false-success-gate
npm run build -w packages/ts-shell
git diff --check
git status --short --branch
```

Also run the product/runtime import scan after any runtime import move:

```text
rg -n "from .*docs|from .*scripts|from .*dev-history|docs/|scripts/|dev-history|agent-routes|implementation-context" packages/ts-shell/src --glob "*.ts" --glob "*.tsx" --glob "!**/*.test.ts" --glob "!**/README.md"
```

## Phase-Specific Validation

| Phase | Focused validation |
|---:|---|
| 1 | `runMvpIntegratedFlow.test.ts`, `turnFacade.test.ts`, fenced stream tests, build. |
| 2 | Anchored proposal runtime test, task lifecycle activation tests, provider no-write inspect cases, browser harness tests if browser wiring changes. |
| 3 | Read/diagnosis tests, command blocker tests, target resolution tests, planning runtime no-write cases. |
| 4 | Read/inspect/repo-explain runMvp cases, context packet planning cases, no-write real-mode inspect cases without live provider. |
| 5 | Edit/write/repair runMvp cases, fenced edit activation tests, edit facade tests, repair facade tests, workspace authority tests if policy moves. |
| 6 | Command/verify runMvp cases, verification facade tests, `taskRelevantVerificationRoute.test.ts`, `verificationCommandPlan.test.ts`. |
| 7 | Evidence/verdict facade tests, result contract, Route221 anti-false-success gate, session result parity and continuation evidence parity tests. |
| 8 | Full runMvp suite, turn facade tests, CLI entry gate if product entry imports change, import boundary scan, build. |

## Truthfulness Regression Focus

Every implementation phase must preserve these invariants:

- `not-run` is not success.
- `skipped` is not success.
- `partial` is not success.
- `blocked` is not success.
- `not-proven` is not success.
- no-provider/no-write defaults remain no-provider/no-write.
- read-only/context flows keep `changedFiles=[]`.
- provider-called evidence does not imply proposal or write success.
- proposal exact-ready does not imply write authority.
- write authority does not imply verification success.
- repair proposal or repair apply does not imply repair success without
  post-repair verification.
- raw provider, DOM, process, config, or secret content does not become
  transcript-safe evidence.

## Baseline Notes

`docs/product-architecture-reset/runmvp-baseline-drift-register.md` records the
current recovered baseline:

```text
npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
167 tests, 167 passed
```

Future extraction routes should treat that full suite as the primary
compatibility gate for the legacy path, not as permission to weaken assertions
or broaden runtime behavior.

## Validation Not Required For This Planning Route

- build
- unit tests
- full package test sweep
- live provider
- browser runtime gate
- Route227/228 report reruns
