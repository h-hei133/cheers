# Image-only back question admission

The synchronous and asynchronous back sources projected each user message to text and then required nonblank text. As a result, a saved image question disappeared from `/back`, and duplicate IDs for those excluded questions bypassed the question identity check. The existing tree/navigation owner already retains image content and accepts an empty user text projection; a second attachment replay system would not address source admission.

Both source paths now use the existing `messageHasContent` owner. Actual image data qualifies independently of prompt text; empty text and empty image data remain excluded. Question IDs, original text projection, dropped counts, source version, full-query cache, limits, cancellation and one-use pages remain under their existing owners. The existing row summary displays `Image message` when an admitted question has no prose. The label is not inserted into the editable prompt or saved history.

After target inspection, read-only reference snapshot `f09d01b85e0384647fcab6779d35ab9dabe04be3` was inspected: tree-selector.ts:370–372 includes user messages by role without a text requirement; agent-session.ts:4173–4177 keeps user navigation and editor text separate. Its fork-selector source at 4242–4255 still excludes empty text, so that fork source was not treated as a solution for this defect. This implementation follows the target's existing retained-user navigation semantics and stronger content, source identity and version guards. No reference code was copied.

Validation ran serially by the main agent:

- Baseline: four AssertionErrors and one empty-image control passed. Two image-only/whitespace image questions were missing, duplicate image ID admission failed to reject, and actual OverlayHost had no visible image question.
- Final focused validation: **48 passed**, four unselected. Picker 31, source 8, boundary 6 and saved-lifetime integration 3. The omitted tests are the existing large turn/question/text limits. This batch did not run them or a 20k real CLI fixture. Included controls cover empty text/data rejection, literal text/dropped count, exact ID/ordinal selection, version continuity, closed pages, cancellation and full-query continuation.
- A saved-session integration uses `readBackSource`, the actual picker and original `navigateSession`/SessionManager writer. Selection retains the exact text/image union once, returns empty text, keeps later answer in the transcript, and adds no duplicate user message.
- Three independent reversals restore text-only synchronous admission, text-only asynchronous admission and blank image label. They fail 3, 3 and 1 AssertionErrors respectively. All restore exact source bytes in `finally`; the restored focused set passed again.
- Import cycles, config consumers, declarations, Node floor and strict docs drift passed, with the existing 118 docs advisories retained. TS build and freshness passed. The two owning production modules add no named callables; see audit.json.

The actual Node CLI regular and fullscreen each opened a completed saved session with three tiny messages: earlier prose, one image with empty text, later assistant answer. The environment used isolated home/profile/Git project, no credentials, synthetic mode with a rejecting fetch observer, a 768 MiB CLI heap, 45-second deadline and 2 MiB terminal cap. Actual `/back` showed the image row, actual Enter selected it through the original navigation owner, and fresh saved reads verified it as the active leaf with the exact original image content. The original transcript prefix and later answer remained in the tree; user count stayed two, with no duplicate prompt. Reopen plus actual Escape left state bytes unchanged. Both exits were zero/cooked, config/project unchanged, zero observed fetch attempts, and scratch removed.

Build `a0c8252603f0d5a787d1686cdec4d65f17b18df765c8e67afda1200c240fe72c`, inputs `afcf8f280cb56a9a5f9c05b2e1cba2c013f46081630cb8289f5053cdc07f654f`. No image was injected into the composer by this probe: existing saved history retains the active image, while the returned draft remains its exact empty text projection. This is branch navigation evidence, not attachment duplication, image reattachment on a new ordinary turn, model dispatch/quality, clipboard or platform acceptance.

Commands from repository root:

```bash
rtk node .omx/artifacts/phase20-addition-image-back/reversal.mjs
rtk node .omx/artifacts/phase20-addition-image-back/audit.mjs
rtk node .omx/artifacts/phase20-addition-image-back/pty.mjs regular && rtk node .omx/artifacts/phase20-addition-image-back/pty.mjs fullscreen
```

Focused command from the package directory:

```bash
rtk env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 ./node_modules/.bin/vitest run src/cli/interactive/picker/rewind.test.ts src/cli/interactive/picker/rewind/source.test.ts src/cli/interactive/picker/rewind/boundary.test.ts src/cli/interactive/picker/rewind/lifetime.test.ts -t 'back selectors|real image question|ambiguous image question|empty text and empty image|counts empty and image|preserves literal prompts|stops an aborted opening|stops search-index|saved image question|bounds saved back|consumes closed|reuses the current|keeps multiline|uses the original|gives numeric|keeps the opening'
```

Archived logs trim trailing whitespace and blank end lines for Git. Baseline failures and the three reversals remain failures; repeated passing runs are not added to the count. No full local suite, concurrent heavy verification, subagent, 20k real PTY, executable build, live provider, independent delegated review or NormProof judge ran. Phase 20 and ADD acceptance remain partial and the goal active.

One delayed CI readback confirmed `89843761` CI 41066606262 and Watch 41066606364 completed/success. Image recovery `138c2c42` Watch 41073636819 completed/success; CI 41073636746 remained in progress. All heads matched. This new batch's commit, push and CI are separate evidence.
