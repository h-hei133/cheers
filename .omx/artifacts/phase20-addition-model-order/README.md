# Model catalogue ordering and nonselectable group headings

Feedback 35. Providers with an admitted model row sort first, then unavailable
providers; each provider group sorts by display label with ID fallback and tie
break. Model rows sort by ID within the same readiness groups. Exact connection
identities and their stable tie order remain intact. Sorting precedes the
navigation publication so category views and cross-category search use one
ordered source. Roles / All models remain first in navigation, role row order is
unchanged, and an extra current request outside the catalogue stays pinned.

The unavailable group has a display-only Not ready heading. Readiness already
covers missing configuration, bad credentials, connection state and incompatible
effort, so Not configured would incorrectly describe every blocker as absent
configuration. Headings have no selection, pointer or wheel authority. Providers
below them remain browsable and expose the original exact-target inspection and
configuration path. No authentication, readiness or write policy is changed.

Read-only reference comparison: the local terminal reference model-hub.ts
(744-748, 772-778) alphabetizes unlocked and locked providers separately and
inserts a separator. hub-frame.ts (248-250) renders a separator without item
selection. This implementation uses the existing target navigation contract,
renderer and viewport. Unlike the reference's version/MRU model ranking, model
IDs follow the user's alphabetical requirement. Five independent reversals
(provider labels, model IDs, heading keyboard, pointer and admission) fail
assertions and restore source bytes exactly; see reversal.json and logs.

Final validation: final-validation.log contains five static gates, nine focused
files / 269 tests, TypeScript build, owner audit, regular CLI and fullscreen CLI,
all serial. Vitest has one worker and 1536 MiB heap; build heap 2048 MiB. Earlier
eight-file 257 and restored three-file 52 passes are additional scoped runs, not
a substitute for the final batch. Existing documentation source advisories: 118.
No full local suite, independent review, executable build or large PTY was run.

Initial failures were classified before changing expectations. Alphabetization
changes the *previously painted* neighbour order, so deleting epsilon now chooses
gamma, and a deleted cross-provider search result follows the surviving shared-d
row in its original visible sequence. ModelFocus behavior remains unchanged.
The new inspection test also needed to load its detail owner before applying a
configuration action. Assertions for identity, no network and no writes remain.

Deferred CI check found the catalogue ownership commit 94a47379 failed run
41018354924: 12688 passed / 1 failed / 3 skipped. The only failure was the settings
wheel fixture omitting the newly captured SettingsDraft.file. The fixture now
supplies that contract through a typed SettingsHost and locates the settings list
in its new left content column. All 12 wheel tests pass in the final batch.
prior-ci-failure.json preserves a bounded failure summary. That historical run
remains failed; this batch's remote CI is separate. The settings-navigation
commit 26d3a53c last read CI41020546837 in progress and Watch41020546679 success.

Original Node CLI regular/fullscreen: one session with one message, synthetic
offline provider, isolated profile/home/project, 768 MiB heap, 45-second deadline.
Both physically resize to 40/80/120 columns, verify provider and search/model
order, pinned current model, visible Not ready heading, keyboard skipping,
exact unavailable-model inspection and return. Models and both config files
remain byte-identical; zero requests, exit 0, cooked terminal flags restored.
Exit times 130/138 ms apply only to these small fixtures. Actual desktop input,
other platforms and real provider behavior were not evaluated.

Initial CLI receipts preserve assumptions corrected in the harness: built-in
providers interleave alphabetically with custom fixtures, and the existing
40/80-column panel truncates a Configure connection label. Probes now use the
actual next provider, painted label prefix and exact visible action identity.
They retain the real CLI and full built-in catalogue.

module-counts.json: navigation 12 -> 13, renderer 6 unchanged, new order owner 1;
model picker remains at its inherited 46 named callables. That ceiling finding
is recorded, not waived or represented as resolved. No NormProof judge was run.

Final build: 02517cf6aedf162c04ac06a13af6cdddbf144202f4b18b3a8f31b3e167b52d65.
Inputs: fc9a56afaba143945a564cf526162ac72b4b207cdc9a6197f1f65b5f12cbd27c.
Both CLI receipts and build.json bind that identity. Temporary fixtures removed.
