# Stashed paste identity retention evidence

The default PasteStore retains payloads named by a DraftStash protector, but its old 1,024-ID FIFO signature history could expire those same tokens. After 1,100 subsequent tiny pastes, restore kept the draft text and caret but lost text expansion and image admission. The existing store now expires a nonresident signature first, retaining the 1,024-ID and eight-variant limits, existing payload budgets and exact token matching. A custom payload capacity greater than 1,024 still falls back to finite signature eviction; it does not gain indefinite identity retention.

Target ownership was read before a targeted, read-only reference comparison: reference snapshot `21a28aef90f19bc64dc6d1bccd5ed8bfb30e7a11`, PromptInput.tsx:1356–1372, restores text, caret and pasted contents together. Cheers keeps its existing store/protector rather than adding another payload map. No reference code was copied.

Validation ran serially in the owning package with one Vitest worker and 2 GiB heap:

- Original implementation: three stash regressions failed, seven controls passed; both actual host modes failed their restored expansion checks.
- Final/restored implementation: 49 paste tests, ten stash tests and nine filtered host tests passed, **68 unique tests**. The 393 unselected host tests did not execute. Intermediate runs and restored reruns are not added to the total.
- Three reversals: FIFO signature eviction produced three assertion failures; removing the signature bound and weakening exact expansion admission each produced one. `reversal.json` records identical original/restored SHA256; `finally` restored exact source bytes.
- Import cycles, config consumers, declarations, Node floor and strict docs drift passed. The 118 existing docs-source advisories remain. TypeScript build and freshness passed, build `00beea7bac87f10ef1e76ff89c1e16ede5439f75965bbeac16a346cb30887526`, inputs `f88bed95e191ccc9a0609cc0a2fb73699627cdf64e4c0b4e47af56d01cf826b9`.
- Paste owner remains 20 named callables. The conservative AST audit including its existing constructor is 21; repository `analyze-module-facades.mjs:136–138` excludes constructors. The initial audit failure from counting that constructor is retained, and `audit.json` reports both counts.

Reproduce from repository root after building:

```bash
rtk node .omx/artifacts/phase20-addition-paste-retention/reversal.mjs
rtk node .omx/artifacts/phase20-addition-paste-retention/audit.mjs
rtk node .omx/artifacts/phase20-addition-paste-retention/pty.mjs regular && rtk node .omx/artifacts/phase20-addition-paste-retention/pty.mjs fullscreen
```

Actual Node CLI probes used a physical PTY, one saved fixture message, isolated home/profile/Git project, a loopback HTTP provider, 768 MiB heap, 45-second wall and 2 MiB output limits. Bracketed paste and both alt+s gestures were actual input. Public PNG bytes were injected at the existing preference attachment host, and 1,100 tiny fillers were injected into the actual runtime PasteStore after stash. These are explicitly not clipboard acquisition or 1,100 keyboard events. Both modes retained exact draft/caret, text, image and interior expansion with zero unresolved tokens. Pressure retained 1,024 signatures, 128 payloads and 4,122 payload bytes. Enter issued one actual POST with exact text and one image_url block; no literal tokens entered that user message. The response painted, config/models/project were unchanged, exit was zero, cooked flags restored and scratch removed.

The first probe fixtures did not declare vision in models.json, so the existing adapter intentionally emitted nonvision text. An invalid attempt to place model metadata in credential config stopped before HTTP. Once metadata was placed in its actual owner, the wire contract passed. A saved-image assertion then exposed a separate pre-existing persistence gap: `core/shell/sessionRuntime.ts:259` calls the string-only `session/lifecycle/sessionPromptBarrier.ts` writer; saved text is exact but saved image history is absent. Final receipts retain `savedUser.imageMatches: false` and this gap explicitly. This batch validates restoration and the current HTTP submission; it does not repair or approve cross-session image replay. All failed receipts remain classified separately from the repaired signature defect.

`released-signature-expectation.log` preserves a corrected test assumption: after releasing protection, both payload and signature may expire on the next issuance. The final test separately checks payload release and eventual signature expiry without requiring an unresolved ID that has already left issued history.

Prior commit `8061bd928ad235a802d8ef8f8b23be62c9c04959`: delayed readback saw Architecture Watch 41056737048 completed/success and CI 41056737057 in progress, with matching heads. This batch's commit, push and future CI are separate evidence. No full local suite, parallel heavy process, subagent verification, compiled executable, 20k PTY, live provider, independent agent review or NormProof judge ran. Real user directory, desktop/clipboard, other platforms and the original Phase 20/ADD acceptance remain partial; the broad goal stays active.
