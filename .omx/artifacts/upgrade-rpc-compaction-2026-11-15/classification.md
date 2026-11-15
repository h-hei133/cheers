# Failure classification

- `compaction-red.log`: four actual assertion failures / one pass before production repair; not setup failures.
- `compaction-green.log`: six static gates and 4 suites / 43 tests passed. `compaction-accepted.log`: gates, restoration 1 suite / 5 tests, structural analysis and current build passed.
- Three reversals fail assertions and restore original files exactly.
- Native first/second probes: history fixture omitted a second older message needed for a legal cut under the existing policy. The first timed out waiting for a request that was properly declined; the second captured the actual nothing outcome. Product cutoff unchanged.
- Native third/fourth probes: cancellation and successful compaction passed, but the observer counted old `compaction` events. Current persistence writes `compaction-prepared` / `compaction-commit`. The corrected observer and extra old record passed on the unchanged build.
- Final loopback probe: 3 actual POSTs, cancelled summary socket closed, no cancelled commit, successful reuse commit and EOF join. Current configured-model probe: 2 actual bodySent requests, prompt and summary; original connection and credentials unchanged, isolated minimal valid catalog required; exact request body not inspectable.
- Independent reviews are separate from root execution and do not cover retry.
