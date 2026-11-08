# C5a read-only handoff

Captured at 2026-11-08 03:32:46 UTC from Cheers delivery commit
6bad3dbc6a45017fe51b3f54f92f9af7e26f666c. The collection began with a clean
worktree. The delivery commit and the observed byte snapshot are recorded
separately in identity.json; source bytes were unchanged before and after the
165-row collection.

The selected experiment scope is:

- J5: single-file Write and Edit full replacement content using explicit,
  isolated write-rule fixtures. Direct artifact rows cover allow and block on
  Node 20.3.0 and Node 24.15.0. Focused Cheers rows cover the normal,
  prepared, security, and Git consumers. Product Edit invocation is still an
  unavailable capability row; direct artifact and focused host coverage do not
  claim every product path.
- J6: the current Write/Edit seam is an input for prose, prose plus pre, and
  prose plus CI comparisons. The seam can produce a real host block, while
  ordinary permission remains separate. No remote CI result is bound to this
  candidate.
- J7: bounded Stop compatibility and a fixed scripted completion probe are
  available. Pinned legacy producer stdout, R0a producer stdout, and current
  Cheers parser rows remain separate. The scripted repair and repeated-block
  rows are not real-provider lifecycle evidence.

The current capability collection has 165 rows: 106 observed, 12 unsupported,
and 47 unavailable. Unknown, unsupported, not-configured, and unavailable
states remain explicit. The selected rows and all unavailable reasons are in
capabilities.json.

Identity and independent verification:

- identity.json binds the delivery commit, observed source members, profile,
  evidence manifest, judge input, write rules, contract, archive, patch,
  write-gate artifact, parser/dependency bytes, Node 20.3 and Node 24.15
  executables, and the read-only NormProof producer.
- The pinned archive and six contract hunks passed the fresh isolated
  conformance consumer: validation/conformance.txt records 10 passed and 0
  failed. That consumer extracts and executes the pinned archive and does not
  import NormProof source.
- edit-probe.json records 16 direct producer rows. Both runtimes agree on
  Write/Edit allow and block, not_configured, and could_not_decide. Direct
  invalid content still returns no_violation; this is a current artifact
  refresh gap, not proof of valid content.
- Raw pinned and R0a producer stdout are under raw/node*-stop-*.json. Current
  Cheers parser replay is under raw/node*-host.json in stop-parser-* rows.
  compatibility.json keeps legacy flat allow/block/retry separate from the
  versioned reason-code closed set.
- validation/focused.txt records the current Cheers consumer result: two files,
  62 tests passed, 0 failed. It includes reverse checks for invalid output,
  empty output, timeout, version mismatch, input-incomplete Edit, unsupported
  tools, and ordinary permission separation.
- shadow-probe.json records four isolated shadow runs with hostExitCode 0.
  Compliant fixtures have underlyingExitCode 0 and proofVerdict proven;
  violating fixtures have underlyingExitCode 2 and proofVerdict failed. The
  blocking command separately exits 1 because promotion is unavailable.

M1 can use the source-members and producer-members snapshots to restore
dependency identity without importing NormProof source. J5 can use only the
explicit single-file seam and must retain independent functional and norm
oracles. J6 must keep trial, proposal, and check denominators separate and
retain unavailable CI/provider rows. J7 may use the bounded Stop rows and
scripted completion rows, but must report producer, parser, mutation, and
host terminal states separately.

The pinned artifact remains shadow-only. No production default, CI workflow,
severity, shipped artifact, or upstream repository was changed. Real provider,
Windows/macOS, remote CI, billing, and independent replication evidence remain
unavailable. The prior a5c600f matrix and drifted J4 receipt remain historical
and were not overwritten.

Node support is recorded in identity.json as two separate facts: direct Node
20.3.0 and Node 24.15.0 execution was observed, while the pinned package
engine declaration remains >=24 and npm install admission was not measured.
The Cheers floor remains >=20.3.0; direct execution does not widen the package
engine promise.
