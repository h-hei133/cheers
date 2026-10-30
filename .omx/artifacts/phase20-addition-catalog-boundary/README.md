# Catalogue directory boundary checks

Listing now checks the shared session directory once instead of separately
walking all ancestors for the directory and its four fixed leaf paths. Each
core file retains `lstat`, opened-handle version checks, source budgets and the
final directory/file version recheck. Direct references keep the original leaf
admission, including the lock, because they can return without reading core
files. The product change is confined to the existing catalogue files owner.

The target was inspected before the read-only terminal reference at snapshot
`f09d01b85e0384647fcab6779d35ab9dabe04be3`, session manager lines 799–826.
Both retain bounded asynchronous acquisition and cancellation. The target keeps
its additional multi-file profile and physical-version fences; the reference
does not have this layout. No reference code or second catalogue was introduced.
Link/replacement/cancellation tests and reversals protect that stricter contract.

`scan.mjs` measures 256 generated sessions with one short synthetic message
each. Before uses the retained pre-change build, explicitly recorded as a
snapshot rather than claiming it is fresh for the edited tree. After checks the
current build. The fixture SHA-256, file bytes and offered IDs match exactly.
Only synchronous filesystem calls during catalogue acquisition are counted.

| Observation | Before | Final after |
|---|---:|---:|
| Synchronous `lstat` calls | 150,212 | 42,500 |
| Synchronous `stat` calls | 28,545 | 8,961 |
| Synchronous `realpath` calls | 28,545 | 8,961 |
| Total synchronous calls | 207,302 | 60,422 |
| Complete scan | 1,658 ms | 729 ms |

The call reduction is 70.85%. Timings are single synthetic observations with
uncontrolled caches, not a release bound or a measured user-directory speedup.
Both runs complete all 256 matches without unreadable records or source limits.

`cli.mjs` runs the actual Node CLI, one terminal mode at a time. It reuses the
preceding large-directory observer. Each isolated fixture has 2,307 generated
sessions, one message each, totalling 6,303,012 bytes. Each run has a 768 MiB
Node heap cap, 90-second deadline, 2 MiB output cap and offline configuration
without credentials. No user sessions are read.

| Mode | First frame | Full scan | Key during scan | Search | Delete |
|---|---:|---:|---:|---:|---:|
| Regular | 176 ms | 6,862 ms | 72 ms | 168 ms | 151 ms |
| Fullscreen | 164 ms | 6,866 ms | 51 ms | 168 ms | 151 ms |

Both catalogues complete with 2,307 matches, no unreadable/source-limit status,
retain the browse after deletion, abort the reopened browse on Escape and
publish no later page. Config bytes remain intact, requests are zero, exit is 0,
cooked flags restore and scratch state is removed. Section 21.25 observed
13.0–13.4 seconds on a similar generated fixture; that historical context is
not a controlled paired CLI benchmark. Neither fixture is the actual 41 MiB
user directory, and no total-heap or physical-I/O claim is made.

All validation ran serially on the main agent: five static gates, three focused
files / 66 tests, five effective reversals, restored files / 17 tests, TypeScript
build, actual CLI modes and six filtered reference-consumer tests. The latter
20 unselected tests were not executed again. Gates pass with 118 pre-existing
documentation advisories. The owner has eight named callables (baseline seven),
nine if its constructor is included. `build.json` binds the final fresh build.

`reversal.json` records the five assertion failures and byte restoration.
`reversal-first.json` preserves an ineffective early reversal: removing the entry
guard alone leaves profile identity enforced by the directory guard. It is not
counted as evidence; removing both boundary checks fails.
`fullscreen-close-observation-failure.json` preserves the initial fixture failure:
the panel cleared before its retirement receipt arrived. The probe now waits for
the actual retirement before reopening; product behavior was not changed for it.
`log-normalization.json` records raw and retained hashes: log trailing whitespace
and terminal blank lines were removed for the repository whitespace gate.

No full local regression, executable, 20,000-message PTY, delegated review,
live-provider request or other-platform test ran. Phase 20 and ADD remain
partial, including actual user-directory and desktop acceptance.
