# Image prompt interrupted recovery evidence

Current image persistence `165940b36995545fbe94abf95bb90b8a458e037c` was previously verified through a completed-session followup, with interrupted dispatch explicitly absent. This bounded probe now verifies the existing recovery path rather than adding a second attachment replay mechanism. Target inspection showed saved model context retains the original multimodal user message and `/continue` supplies a separate recovery prompt; the resulting HTTP request, rather than the lack of an attachments field in the resume bridge, determines whether the image survives.

Actual Node CLI regular and fullscreen each used one saved fixture message, isolated home/profile/Git project, declared-vision loopback provider, 768 MiB heap, a 60-second total deadline and 2 MiB cumulative terminal cap. They used actual bracketed paste, alt+s stash/restore and Enter, with public PNG bytes injected at the original attachment host and 1,100 tiny issuances injected into the actual store. This reuses the bounded earlier fixture; it is not clipboard acquisition or 1,100 physical pastes.

The first POST reached the loopback server with exact current text and one image_url. The server deliberately kept the response pending. Actual Ctrl+C stopped the turn, closed that HTTP response and left a durable interrupted session with the exact text/image user content. Measured cancellation was 51 ms regular / 50 ms fullscreen for this small fixture, including the receipt polling interval; this is not a production cancellation latency bound. No completed response or token settlement was fabricated for that request.

After Ctrl+D exit zero/cooked, a **new CLI process** reopened the same session and actual `/continue` reached the original recovery owner. With no image-host or pressure injection in the second process, the second POST contained the exact historical image and text, one image_url total and the original recovery instruction. The final reply painted, durable session became completed and pendingPrompt cleared. User messages remained exactly two, including the original fixture message; recovery did not append a duplicate submitted user prompt. Config/models/project bytes remained unchanged. Four CLI process exits across both modes were zero and restored cooked flags; scratch was deleted.

Commands run serially from repository root:

```bash
rtk node --check .omx/artifacts/phase20-addition-image-recovery/pty.mjs && rtk node --check .omx/artifacts/phase20-addition-image-recovery/observe.mjs
rtk node .omx/artifacts/phase20-addition-image-recovery/pty.mjs regular && rtk node .omx/artifacts/phase20-addition-image-recovery/pty.mjs fullscreen
```

No product source changed, so no new build, unit rerun or source reversal ran. Probe checkBuild verified current freshness, build `d4297fc1e1cd6053249f47cb8afbb896d1654fdacef71d1638cead1669e053c0`, inputs `a8e6aba8fe59b75f8a3533c898053adb727ce845057ea765e933aa410e975471`. The prior implementation, unit and reversal evidence remains in the image-history batch. These new checks passed on their first behavioral run in both modes.

Limits: this proves text plus one small image recovery after cancellation during a pending HTTP response. It does not prove image-only automatic recovery, mid-tool/checkpoint images, compaction/branch retention, arbitrary large-image behavior, unknown remote billing reconciliation, live model quality, clipboard or platform acceptance. No full local suite, concurrent heavy process, subagent verification, executable build, 20k real PTY, live provider, independent review or NormProof judge ran. Original Phase 20 and ADD acceptance stay partial and the goal active.

Delayed CI readback: paste fix `bc121e28ff2d9a51872da16bd66a90dea3972ad6` CI 41062973370 / Watch 41062973311 completed/success. Image persistence `165940b36995545fbe94abf95bb90b8a458e037c` Watch 41065163449 completed/success, CI 41065163338 in progress, both heads matched. This evidence batch's commit, push and future CI are separate.
