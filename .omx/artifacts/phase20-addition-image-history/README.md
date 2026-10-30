# Image prompt history evidence

The previous paste-retention CLI probe exposed an independent defect: the original prompt barrier persisted only a string, while current request dispatch carried text and images. The submitted image reached HTTP but disappeared from saved user history and a later process's request.

The existing runtime → lifecycle facade → lifecycle handler → prompt barrier now carries an optional image array. The barrier writes the existing SessionMessage content union as one text block followed by image blocks, copying each image record to keep later caller mutation from changing the in-memory saved message. No images retains string content. Metadata, exact whitespace, pendingPrompt text, event order, source entry identity and the original barrier-before-dispatch ordering remain. No new store, schema, provider policy or replay engine was introduced; existing transcript decoding, toChatMessages and model context supply the replay.

Target schema/writer/readers were inspected before targeted read-only reference comparison: snapshot `f09d01b85e0384647fcab6779d35ab9dabe04be3`, agent-session.ts:1969–1978 creates a user text/image block array, and :1163–1181 persists that actual message. Cheers preserves its earlier durable prompt barrier and stores the exact submitted text rather than persisting environment framing or moving durability to message_end. Reference code was not copied.

Main-agent, serial validation:

- Initial baseline: four image-content assertions failed and the empty-image control passed. Two runtime fixture failures were TypeErrors from omitted mock terminal hooks, not valid product regressions; their logs remain. The repaired fixture supplies terminal completion and original manager callbacks, with assertions outside the runtime so its error handling cannot swallow them.
- Final restored checks: **nine unique tests** passed across the barrier (four), manager (two selected) and runtime (three selected). The 128 unselected tests did not run. These cover text/image and image-only barrier content, copied records, exact whitespace/metadata, completed/interrupted disk reload and toChatMessages, attachment forwarding before dispatch, plain-text compatibility and no duplicate barrier on seeded reentry.
- Four reversals produced 1/2/2/2 AssertionErrors: drop runtime attachments, drop facade forwarding, flatten durable content, share mutable caller image records. Each source buffer was restored in finally; `reversal.json` records source hashes. Restored focused tests passed before build.
- Five static gates, TypeScript build and freshness passed; 118 existing docs-source advisories remain. Build `d4297fc1e1cd6053249f47cb8afbb896d1654fdacef71d1638cead1669e053c0`, inputs `a8e6aba8fe59b75f8a3533c898053adb727ce845057ea765e933aa410e975471`.
- AST counts unchanged: runtime 19, lifecycle handler 15, lifecycle facade 29, barrier 1. The existing facade's conservative count exceeds 20 and remains recorded; this forwarding change adds no function-like names or behavior owner there.

Reproduce from repository root after build, serially:

```bash
rtk node .omx/artifacts/phase20-addition-image-history/reversal.mjs
rtk node .omx/artifacts/phase20-addition-image-history/audit.mjs
rtk node .omx/artifacts/phase20-addition-image-history/pty.mjs regular && rtk node .omx/artifacts/phase20-addition-image-history/pty.mjs fullscreen
```

Each actual Node CLI mode used one saved fixture message, isolated home/profile/Git project, a declared-vision loopback provider, 768 MiB heap, one 60-second overall deadline and 2 MiB cumulative output cap. The probe first exercised actual bracketed paste and alt+s stash/restore under 1,100 tiny runtime store issuances, using the original attachment host for public PNG bytes. Enter sent exactly one text/image request. Saved history contained one exact multimodal user message, without duplication. Ctrl+D exited zero and restored cooked flags.

A **new CLI process** then reopened the same saved session. With zero image-host or pressure injection in that process, a real followup sent a second HTTP request containing the original image once, exact historical text, and the new followup. The response painted; fresh disk reload retained three user messages total and the original image blocks. Both process exits in both modes were zero/cooked. Config/models/project bytes remained unchanged; scratch was removed. This proves the tested small image history through the current real adapter with a deterministic loopback response, not remote model vision quality, clipboard acquisition or arbitrary large-image performance.

Two CLI fixture failures remain: constructing a SessionManager outside withProfile bound it to a different profile and returned no session; then expecting historical text to contain the current-request environment prefix rejected an otherwise correct replay. Both were corrected in the observer/harness only. Original failure receipts are retained. Earlier paste-retention receipts remain historical and correctly report the image gap before this repair.

Limits: old transcripts that already lost an image cannot reconstruct it. No new policy for image-only automatic recovery, compaction retention, branch replay, privacy/retention or transcript size budgets is asserted by this batch. Completed-session fresh-process replay and interrupted-session disk read are tested; automatic interrupted dispatch with images has not been verified. No full local suite, concurrent heavy verification, subagent, executable build, 20k real PTY, live provider, independent review or NormProof judge ran. Broad Phase 20/ADD acceptance stays partial and the goal active.

Delayed CI readback: `8061bd928ad235a802d8ef8f8b23be62c9c04959` CI 41056737057 and Watch 41056737048 completed/success. Paste fix `bc121e28ff2d9a51872da16bd66a90dea3972ad6` Watch 41062973311 completed/success, CI 41062973370 in progress. Current batch commit/push/future CI are separate evidence.
