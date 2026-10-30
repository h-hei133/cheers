# Restored conversations keep their pictures

A saved prompt already stored its pictures: `sessionPromptBarrier` writes the text/image union and the transcript keeps it across processes. The gap was the display projection. `restoreConversation` rendered every user turn through `messageToText`, which by design drops images, and then admitted the block only when that text projection was non-blank. Reopening a session therefore showed the words and silently lost the pictures; a prompt that was only a picture produced no block at all.

The existing renderer already draws `Block.images` — the live echo path passes them the same way — so the fix reuses that capability rather than adding a second attachment or replay path.

## What changed

- `model-adapters/multimodal.ts` gains `imagesOf(content)`: the pictures a message carries, in attachment order, using the same union the rest of the tree reads. It joins the existing `messageHasContent` / `messageToText` pair as a projection over one content shape, so no reader has to re-derive what an image block is.
- `cli/interactive/history.ts` uses it in `restoreConversation`. A user turn is admitted when it has text **or** pictures, and the restored block carries the stored images beside its text. Original composed source (`metadata.originalInput`), the bounded 60-block window, earlier copy sources and the editor-history rule are untouched: editor history still receives only word-bearing prompts, because recalling a picture is not what a draft recall does.

## Reference comparison

Read-only inspection of the local `pi` checkout (`packages/coding-agent/src/modes/interactive/interactive-mode.ts`) shows its restore path renders user turns through `getUserMessageText`, which filters to `text` blocks only, and skips the component entirely when that text is empty — the same text-only projection. Its live renderer likewise shows the words, not the picture. It therefore does not solve this defect and was not used as a design source; the target's own renderer capability (`Block.images`, `inlineImageSequence`) was the reuse point. No reference code was copied.

## Validation (main agent, serial)

Focused: `history.test.ts` 27 and `multimodal.test.ts` 26 passed, then with `rewind.test.ts` 84 passed across the three files.

Three independent reversals (`reversal.mjs`, receipts in `reversal.json`), each failing on `AssertionError` and restoring exact source bytes in `finally`:

| Reversal | Failed |
|---|---|
| text-only projection (drop `imagesOf` from `restoreConversation`) | 3 |
| picture requires text (`content.trim()` only) | 1 |
| `imagesOf` returns nothing | 2 |

Static gates, serially: `verify:import-cycles`, `check:config-consumers`, `check:declarations`, `check:node-floor`, `verify:docs-drift:strict` all passed; the 118 pre-existing docs advisories remain counted, not failed. TS build and freshness passed. Owner callable counts (conservative AST, `audit.json`): `history.ts` 5→5, `multimodal.ts` 7→8, both under 20.

## Real CLI evidence

`pty.mjs regular` and `pty.mjs fullscreen`, each one isolated home/profile/Git project, synthetic mode with a rejecting fetch observer, 768 MiB CLI heap, 45-second deadline, 2 MiB output cap. One completed saved session with three user turns — prose, prose + picture, picture only — and a later assistant answer.

Both modes restored all three user blocks with the exact stored pictures (`What is in this picture?` ×1, empty text ×1), drew the picture as a named `image attachment: image/png` row on a terminal without a graphics protocol, kept the composer empty (zero composer images, zero draft), made zero network attempts, left stored messages and the transcript prefix byte-identical, and exited 0 with cooked flags restored. Configuration and project directories unchanged; scratch removed.

Build `9a6624d48f82120506879633d1b9f11bfbf09265b1d032251c63269a53184bf1`, inputs `dabe8d4d43d22f8680b430db8927a1a6f570803b5812e9a398157f33ee9f507d`.

## Boundaries

This is restored-history display, not a new attachment path: no image is injected into the composer and no model request is made. Not covered here: graphics-protocol terminals drawing the restored image inline (the renderer path is unit-tested, the probe terminal is text-only), very large images, compaction/branch projections beyond the transcript prefix check, clipboard capture, and other platforms. Phase 20 and ADD acceptance remain partial.

Commands from repository root:

```bash
rtk node .omx/artifacts/phase20-addition-image-history/reversal.mjs
rtk node .omx/artifacts/phase20-addition-image-history/audit.mjs
rtk node .omx/artifacts/phase20-addition-image-history/pty.mjs regular && rtk node .omx/artifacts/phase20-addition-image-history/pty.mjs fullscreen
```

Focused command from the package directory:

```bash
rtk env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 ./node_modules/.bin/vitest run src/cli/interactive/history.test.ts src/model-adapters/multimodal.test.ts
```
