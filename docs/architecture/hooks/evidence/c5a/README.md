# C5a experiment-lane evidence

This directory freezes the current Cheers candidate for the selected J5/J6 single-file
Write/Edit seam and the bounded J7 Stop compatibility probe. It is an experiment handoff,
not a pinned release refresh.

- identity.json binds delivery commit, observed source bytes, contract, archive, patch,
  write artifact, parser/dependency, profile, manifest, runtimes, and read-only producer.
- capabilities.json is the curated current row set. The complete 165-row run remains
  in the temporary collection output while the selected rows and all unavailable rows are
  retained here.
- compatibility.json keeps legacy flat block/retry/allow separate from versioned closed-set
  output and separates actual producer stdout from captured R0a replay.
- raw/ contains command stdout/exit records and judge verdicts; validation/ contains
  conformance and focused consumer receipts.
- Fixtures are source snapshots with executable source stored as .txt so evidence cannot
  be discovered as a test.

Current source/artifact status is bound. The prior a5c600f matrix and drifted J4 receipt
remain historical. The pinned artifact is still shadow-only; real provider, platform, remote CI,
billing, and independent replication evidence remain unavailable. No production default,
workflow, severity, or shipped artifact was changed by this lane.
