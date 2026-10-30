# Model catalogue diagnostics and configuration ownership

Feedback 31. The existing catalogue loader now returns providers and controlled
diagnostics together. `loadCatalog` keeps its array contract by delegating to
that acquisition. Config publication carries diagnostics with accepted providers;
rejection retains both, and catalogue refresh compares both. This covers a
corrected empty overlay whose providers equal the earlier fallback catalogue.

Missing optional files stay silent. Unreadable files, invalid JSON and invalid
provider containers produce fixed notices and preserve other layers. The existing
JSON visitor inspects only top-level `providers`, including escaped spellings;
duplicates warn while preserving JSON's last-object behavior. No user file is
rewritten and no catalogue scope or provider/auth behavior is added.

Settings carries its captured save path through the original draft and exposes
it beside Stored and in the read-only source view. Model details and Model group
settings distinguish config.json from user-profile-only models.json. The guide
also distinguishes the generated cache and current-session model/role choices.

Reference: pi's `core/model-config.ts:158–217` keeps one immutable acquisition of
providers plus an error, ignores missing files and returns an empty custom layer
on parse failure. This change agrees with those decisions. Its raw exception
messages are not adopted because catalogue content must stay report-safe here.
No evidence of duplicate-key detection was found in that focused loader; the
bounded top-level-owner check follows the explicit local requirement, using the
JSON parser dependency already present in the target project.

`validation.log`: five static gates, ten focused files / 219 tests, TypeScript
build, serially with one Vitest worker and bounded heaps. Four independent
reversals in `reversal.json` fail assertions and restore original bytes. No full
suite, independent review, executable build or large PTY test was run. The 118
existing documentation advisories remain.

`module-counts.json` records current and baseline named-callable counts. The
catalogue owner grows from 6 to 13 and publication helper from 1 to 2. Existing
model/settings picker counts remain 46/23 under this conservative count; this
batch does not resolve those pre-existing responsibility-ceiling findings.

`regular.json` and `fullscreen.json`: original Node CLI and PTY relay, one saved
session / one message, isolated home/profile/project, synthetic offline provider,
768 MiB heap cap, 45-second deadline. Each sees a safe malformed-catalogue notice,
the current model's file ownership, clears the notice after an external fixture
correction and reopening, then inspects actual user and project settings save
paths. User/project configs stay byte-identical; models.json is changed only by
the probe's explicit correction. No model request occurs; exit 0 and cooked
terminal flags are restored. These checks do not validate a real provider.

Initial regular probing passed; tightly spaced Esc during fullscreen probing left
the rewind panel open before the settings command. The retained
`before-close-spacing-*.json` receipts show this. The probe now separates panel
dismissals beyond the established 600 ms double-Escape window. Both final modes
pass. The initial four command-test failures came from Vitest spreading array
rows into arguments; wrapping each argument array in an object corrected the
fixture without changing command behavior.

Build ID:
`d1cc517998304f1864056e6917061d109b7abbd08f9bcf68f4e8427af508921c`.
Inputs digest:
`4f6fe518a669059e1b73f8507dbe919afb8082d684905ea71936e6a8b2eb24cd`.
