# C.7 test classification and repair boundary

Root reproduced the original 13 raw-response counterexamples against unchanged production: 10 assertion failures and 3 passing controls (`red.json`, `red.log`). This owner performed no validation or runtime execution.

The initial 13 `presence.test.ts` case bodies remain unchanged. Six controls were appended for invalid nested/native raw reads, direct-record numeric zero, and measured reads with an omitted write category. `tests.patch` remains the original frozen counterexample patch; `tests-final.patch` contains the final four test files against the base.

Existing expectations classified before editing:

- `usage/attribution.test.ts` captured-price/destination and turn-end warning fixtures supplied prompt-only usage but expected a measurable cache miss. **Stale expectation:** absence was being treated as zero. These fixtures now supply explicit numeric read zero; cost and destination assertions are preserved, and the notice asserts estimated overlap wording.
- The price-edit cache-summary fixture inherited accounting after a hit despite omitting the next read field. **Stale expectation:** sticky historical activity was being treated as current measurement. Its price-edit control now supplies explicit read zero while the other destination still omits it; existing summary counts and destination metadata assertions remain meaningful.
- The legacy/attributed continuity control previously omitted cache categories. **Control strengthening:** both records now supply measured read zero so the no-miss result continues to exercise the identity boundary rather than failing comparison for lack of evidence.
- `cacheWaste.test.ts` treated a literal zero read plus positive write as current read accounting without presence evidence. **Fixture classification:** explicit read/write facts identify the intended current measured records; all existing numeric summary assertions remain unchanged. An idle-label check requires possible expiry wording.
- `provider/response/usage.test.ts` exact normalized-object comparisons omitted the newly preserved presence properties. **Contract shape addition:** expected booleans were added without changing any existing numeric billing assertions. Four additional controls distinguish missing categories, reported nested zero, reported native zeros and invalid native values.
- Persisted category evidence accepts booleans only. Two corruption controls extend existing attribution decoding checks; earlier corruption scenarios remain intact.

The five-file production repair preserves numeric billing calculations and request/context authority. Canonical normalization distinguishes valid raw categories from accounting-default zeros; recording preserves this per-request evidence, including direct numeric zeros; bounded snapshot decoding preserves and validates it. Summary and miss comparison require read evidence. Older positive category counts remain evidence; old sticky-only zeros remain unknown. Reset/gap boundaries still break comparison.

The paid miss rate uses observed ordinary input and cache writes at their captured prices. An observed unpriced write withholds the dollar miss, including after later catalogue publication. Allocation to overlapping counts is an estimate. The actual turn-end text says estimated overlap; the existing five-minute idle threshold suggests possible expiry without asserting a measured provider TTL.

Read-only propagation inspection found canonical spreads in `turn/step.ts`, `/btw`, and `session/store/usage.ts`. `turn/request.ts` consumes numeric counts for tracing/context rather than writing an accounting record. These paths need no presence plumbing changes. No provider/cache-protocol or realized-savings evidence is claimed.

## Resumed main-thread consumer classification (2026-11-16)

Actual isolated execution of the current repaired lane found exactly four AssertionErrors in the existing cost-command fixtures; all 19 presence cases passed (45 total, 41 passed). Receipt: cost-classification.json. The tiny-positive-cost, unpriced-read, measured write-cost and model-switch fixtures lacked explicit read zero; the priced-write fixture also lacked a known write rate. The main agent supplied read zero only in those four scenarios and a write rate equal to the fixture input rate, preserving the original tiny amount, unknown-read-price, $0.2700 and model-change assertions.

The first edit matched a neighboring fixture with the same source line and accidentally changed its first prompt-only request; cost-corrected.json retained two AssertionErrors. The main agent restored that neighboring fixture exactly and applied the measured zero to the intended model-switch record. This was edit targeting, not product drift. cost-corrected-final.json proves 2 suites/45 tests passed; lane-green.json proves 8 suites/153 tests passed. No assertion was weakened or skipped.

## Existing UI recovery regression

The complete C7 isolated group executed 10 suites/572 tests: 562 passed, 10 failed, all in pre-existing unreadable-state role recovery scenarios. Running those exact scenarios on main before C7 integration reproduced the same 10 failures (6 passing controls) in unreadable-state-main-baseline.json, at strict logical selection read inside readStatusFacts. A separate C1 display/recovery repair owns those failures; they are not new cache accounting regressions. No scenario was skipped or weakened.

Actual cost-report consumer also exposed overly certain legacy idle/text-overlap wording: report-wording-red.json has one AssertionError before the owner repair. cacheLines now names estimated overlap, possible expiry, and the number of requests that actually reported reads. The request-consumer-first and terminal-consumer-first receipts passed 5 dispatched HTTP-to-persistence-to-cost cases and 4 actual terminal host cases.
