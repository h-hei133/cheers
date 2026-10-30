# Settings top category navigation

Feedback 32. Settings categories now use the existing chip strip above the
full-width content panel. Picker navigation owns both category identities and
focus; the redundant settings chips contract has been removed. Left/Right
changes category, Tab/Shift+Tab toggles rows and section headings, and Up/Down
moves within that domain. Enter on a heading enters its first field. Escape
clears search at its selected result, returns headings to rows, or closes rows.
Model and help catalogues retain the default side navigation contract.

The existing chip renderer windows the active category at narrow widths and
registers only painted spans. Query changes now retire chip spans along with
content hit maps, because showing All can move the chip window. Focus, search,
staged edits, discarded values and return-to-field identity remain covered.
Settings search ranking moved intact into its existing settings subdomain;
category order remains an explicit input rather than a second duplicated list.

Reference comparison was read before editing: the local settings-selector
(1940-1960) and tab-bar (205-226) in the terminal reference place category movement
on horizontal arrows and switch headings/rows with Tab. This implementation
uses the target's existing chip window and pointer registration. It does not
introduce a second tab renderer or import reference code. Placement and focus
reversals below reject restoring the old behavior.

`validation.log`: five static gates, nine focused files / 202 tests, then the
TypeScript build, serially. `reversal.json` records four independent assertion
failures (placement, Tab domains, stale chip spans and model side default), each
with byte-exact source restoration. The restored navigation file passed all
22 tests after the final Tab-cycle assertion was added. One Vitest worker and
1536 MiB heap; build heap 2048 MiB. No full suite or concurrent verification.
The 118 existing documentation source advisories remain.

Initial focus tests used a right-side detail label as a left-list click target,
expected an untruncated heading at 80 columns, and assumed the wrong next field.
These were harness expectations: clicks now use the painted list column, narrow
labels assert their visible prefix, and actual Enter callbacks verify field IDs.
A probe attempt was refused by build freshness after a test assertion changed;
rebuilding produced the final identity below before any CLI fixture ran.

`audit.mjs` / `module-counts.json`: settings picker 23 -> 20, settings search 1,
navigation 12 unchanged. Existing host/command registry counts remain 30/121;
this batch does not resolve their pre-existing ceiling findings. No NormProof
judge or independent agent review was run.

`regular.json` and `fullscreen.json`: original Node CLI through a PTY, one saved
session / one message, isolated profile/home/project, offline synthetic provider,
768 MiB heap, 45-second deadline. Each physically resizes the PTY to 40, 80 and
120 columns, checks the top strip, uses arrows/Tab/Enter through section/field
inspection and return, changes category while retaining the field, searches All
and exits search at the selected field. The model browser still exposes its
side navigation. User/project configuration and model catalogue bytes are
unchanged, zero requests, exit 0, cooked terminal flags restored. Exit times
136 ms regular / 142 ms fullscreen are small-fixture observations, not a desktop
latency benchmark. Unit tests additionally cover real painted category clicks,
short frames and invalidated old hit maps. Actual desktop input and other
platforms remain unverified.

Final build: `6a98f52461a8e7443de16bc14fb88b92395048201c67b39d0678a5c0855fb0de`.
Inputs: `40eb551ecc21d86b841a49d4e2567490c43a062e7a5666f0a9c1c336c9fc9967`.
`build.json` and both CLI receipts bind this identity. Feedback 35 and 36/37 and
the large-directory experience portion of feedback 33 remain outstanding.
