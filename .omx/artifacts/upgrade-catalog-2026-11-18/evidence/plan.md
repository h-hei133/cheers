# F2.2 refresh tests

Draft destination: `packages/ts-shell/src/core/models/refresh.test.ts`. Only this directory is edited by the test lane; package sources and existing tests remain frozen. Update the two local imports if the integrated owners are renamed to `refresh`/`store`.

The draft calls the real refresh/cache owners, uses loopback HTTP on a random port, and isolates HOME, USERPROFILE and CHEERS_TEST_ROOT in a private `/tmp/cheers-test/` home. It refuses a leaked process-profile path before touching storage. Server response gates use request arrival and `vi.waitFor`; cleanup releases unfinished responses, joins every refresh and closes every socket. There are no sleeps or synthetic HTTP responses.

The temporary options intersection declares optional `signal` and `admission: () => string | undefined` without editing the frozen interface. A fetch call-through observer sees real headers; JSON observers consume the real body before cancellation/admission retirement. The same observer establishes actual JSON acquisition before a successor refresh in the body-race case.

Expected counterexamples from the audited source, not executed outcomes:

- Eight absent/invalid-body cases return success on 304; metadata-only and several invalid providers also send an unbacked validator.
- A caller ETag sends an unbacked validator. A caller validator from index A also bypasses the stored index-URL check on index B.
- An old 200 replaces the successor after either response or JSON waiting.
- An old 304 rewrites the successor's ETag, using either the original validator or a rotated response ETag, and can relabel its index URL.
- Four 200 cancellation/admission cases and two 304 header cases publish after the original caller has retired.
- Null/primitive/array model records and primitive/array model maps create phantom entries.
- Valid 304 responses report zero counts and omit the cache path.

Expected controls from source: URL isolation without a caller override; null model maps fail without replacing cache; HTTP and JSON failures preserve exact old raw cache; the initial valid 200 publishes two providers/three models; a valid 304 preserves body content. These assertions intentionally coexist with the failing assertions in compound scenarios.

Reference decisions retained from Pi's `remote-catalog-provider.ts`: body-backed validator (155); cancellation checks after response/body (157/183); captured-body publication on 304 (161-163); non-object record filtering (48); publication owner for persistence (186-191). Cheers remains an explicit whole-index refresh. No Pi scheduling, shard or Last-Modified mechanism is copied.

No build, test, verify, NormProof or provider command has run in this lane. The main thread must copy the draft only after capturing its source identity, classify actual baseline failures, integrate the owner change and run focused validation serially.
