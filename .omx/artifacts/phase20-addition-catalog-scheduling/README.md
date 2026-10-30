# Catalog scheduling and covered ambient reads

Feedback 33, suggestions 3–5. Product changes stay in the existing catalog,
surface and ambient owners. The host changes only its status peer read wiring.

- `decodeSessionSummary` awaits the existing bounded asynchronous transcript
  decoder and forwards cancellation. The original reader rechecks directory and
  all three file versions after decoding, before cache admission.
- Chrome measures overlay geometry before acquiring ambient facts. A row added
  by ambient facts triggers a second layout measurement, preserving report form
  at the exact fit boundary. Search, transient hints, clipped rows and full-screen
  overlays skip the hint's ambient acquisition.
- The host also reads peers for composer status before layout. That separate
  path reuses the existing session-bound peer cache while a picker/reader is
  active. A missing or foreign cached count stays unavailable; cache-only reads
  do not renew its TTL.

Reference decisions compared before implementation: pi's session info reader
uses asynchronous line iteration with cancellation, agreeing with cooperative
acquisition here. Its TUI composites rendered overlays using actual dimensions,
agreeing with retaining geometry-driven layout. That compositor takes already
rendered underlying content; it does not establish a hidden ambient-I/O policy.
This change supplies that demand decision locally rather than importing another
renderer, cache or streaming infrastructure.

`validation.log`: five static gates, seven focused files / 123 tests, then only
the two new host cases (376 other host cases skipped), then TypeScript build.
All ran serially. The 118 existing documentation advisories remain.
`reversal.json`: six independent reversals each cause assertion failures and
restore the original bytes. `module-counts.json` counts named callable owners;
the host adds no callable. This is not an independent review or a full suite.

`regular.json` and `fullscreen.json` exercise the original Node CLI through the
existing PTY relay: eight sessions, one message each, isolated home/profile,
synthetic offline provider, 768 MiB heap cap and a 45-second deadline. Each opens
resume, waits past two peer TTLs with actual key-triggered redraws, deletes two
sessions including a searched result, clears search, closes the panel and exits.
Both observe zero peer scans behind the panel, refresh after close, retained
browse, unchanged survivors/config, zero requests, exit 0 and restored cooked
terminal flags. This is not a large-directory or large-transcript terminal test.

The initial observer imported a nonexported binding and exited before startup;
`startup-observer-regular.json` retains that harness failure. The first working
probe exposed the separate composer-status scan (`before-host-regular.json`),
which was fixed in the host wiring. The first post-fix probe counted every
transcript read during deletion and failed (`before-target-observation-regular.json`).
The final observer attributes each read to its synthetic session and records
bounded caller stacks. Both final probes read only the current fixture's
transcript synchronously; startup and the existing `GitCommitIntent.current`
path account for those reads. During the first regular-mode deletion window,
four current-session reads occurred; its deletion target had zero. Fullscreen
windows had zero total reads. All four deletion targets had zero synchronous
transcript reads. The unrelated Git polling path is documented, not changed.

Final build ID:
`194f2ee5e1e40dbde22761937400ba33dffef19230020aaa5da4b7a7b61e7da9`.
Inputs digest:
`969a0534db7258c243e2ca18506d95a983b2d19805694417152c5d4f5e085db6`.

Metadata/state JSON parsing and later summary projection remain synchronous.
The transcript yield change guarantees scheduling opportunities, not faster total
time or an end-to-end latency/heap bound. User-directory experience, other
platforms, real providers and independent review remain unverified. Feedback 33
and the overall addition remain partial.
