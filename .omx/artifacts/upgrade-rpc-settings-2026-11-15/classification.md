# Failure classification

- Initial settings/thinking: 8 assertion failures and 4 passes. These establish missing response facts and discovery/filtering behavior, but the project-default-over-explicit-user inference was later refuted. The original red log remains; production merge precedence was not changed.
- `green-first.log` is historical despite its name: two failures remained. Project precedence was a stale expectation; stale effort publication was an actual product defect, independently reproduced in `publication-red.log`.
- `callback-red.log` and `budget-red.log`: actual product failures in original-binding reporting and endpoint output admission, repaired in their owner paths.
- Discovery counterexamples cover initial missing extension/skill/invocation results, registration retirement, late response publication, transport cancellation, safe private errors and final skill predicate revocation. All original red logs are retained.
- `tests-final.log`: 11 suites / 200 passed before the final selected-skill predicate check. `skill-revocation-green.log` and `discovery-restored.log` cover the final change; the latter is 3 suites / 29 tests after restoration. Earlier settings restoration is 3 suites / 62 passed. Overlapping batches are not added together as unique tests.
- Seven reversal cases actually failed assertions and restored the touched files byte for byte. Nonzero process exit alone is not treated as proof.
- Older builds 770a85964afc and 6acc9fe09805 are historical only. Current native receipts and build-delivery.log bind to 119bed2092d3.
- Both current native probes passed without a recorded failed native run for this batch. Configured-model observation records actual bodySent, not an inspectable body. Original malformed catalog is a setup limitation; only the isolated fixture declares a minimal valid entry for the existing selected configured target.
- Final six gates and structural check passed in delivery-gates.log. The 119 existing documentation source advisories remain explicit.
- The stalled implementation lane produced no accepted changes or review. Only the two named independent final reviewers support the review verdict.
- A read-only recursive distribution-manifest search was terminated after it traversed old build generations without useful output; the known current manifest path was read directly. No product or validation result came from that search.
