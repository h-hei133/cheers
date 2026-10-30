# Tool results keep their pictures

A browser screenshot returns an image alongside its prose. The model received it — `createToolResultMessage` stores the text/image union — but nothing on screen showed it: `TurnProjection` mapped the tool message to a `tool.result` event carrying only `messageToText`, and `renderTool` drew only words. The same message is what replay and the restored conversation read, so the card was the only place the picture was missing.

## What changed

- `core/query/runtime/events.ts`: `tool.result` gains an optional `images` field, documented as display-only.
- `turn/projection.ts`: the tool `message_end` case derives pictures from the same content union (`imagesOf`) and includes them only when present.
- `session/sessionEventCodec.ts`: `createQueryTranscriptEvent` strips the display-only field before the event is written. The encoded payload is already stored on the tool result message; persisting it here too would double it in the transcript. The probe asserts exactly one stored copy.
- `cli/interactive/toolCards.ts` / `turnSink.ts`: `finish` accepts the pictures and attaches them to the card through the transcript's revisioned update path.
- `presentation/tui/transcript/blocks.ts`: `Block.images` is no longer readonly (the card is mutated through the update path, like `text`), and `renderTool` draws the pictures in both folded and expanded states — graphics sequence when the terminal speaks one, a named `image result:` row when it does not.
- `cli/interactive/history.ts`: the restored tool card takes its pictures from the stored tool message, so reopening a session shows what the live card showed.

No second attachment store, event type, or replay path was added.

## Reference comparison

Read-only inspection of the local `pi` checkout (`modes/interactive/components/tool-execution.ts`) shows the same decision: tool result images are read from `this.result.content` filtered to `type === "image"`, rendered through the terminal's image component when capabilities allow, with spacers between them; collapsed and expanded shells both keep them. That is a display decision over the stored message, not a separate durable channel — the same shape used here. No reference code was copied.

## Validation (main agent, serial)

Focused: `projection` 9, `sessionQueryEventPersistence` 3, `toolCards` 14, `blocks` 16, `history` 28, `turnSink` 54, `container` 18, `multimodal` 26 — 168 across the affected files.

Five independent reversals (`reversal.mjs`, `reversal.json`), each failing on `AssertionError` and restoring exact source bytes in `finally`:

| Reversal | Result |
|---|---|
| projection drops images | failed |
| durable copy keeps display-only images | failed |
| cards drop images | failed |
| renderer hides tool images | failed |
| history drops tool images | failed |

Static gates, serially: import cycles, config consumers, declarations, Node floor, strict docs drift all passed; the 118 pre-existing docs advisories remain counted, not failed. TS build and freshness passed. Owner callable counts (`audit.json`, conservative AST): toolCards 13→13, turnSink 19→19, blocks 12→13, history 5→5, projection 7→7, sessionEventCodec 13→14; none over 20.

## Real CLI evidence

`pty.mjs regular` and `pty.mjs fullscreen`, one isolated home/profile/Git project each, synthetic mode with a rejecting fetch observer, 768 MiB heap, 45-second deadline, 2 MiB output cap. One completed saved session with a user question, an assistant message calling `browser`, a tool message carrying text plus a PNG, and a later answer.

Both modes restored the tool card with its exact text and one picture, drew `image result: image/png` on a terminal without a graphics protocol, left the transcript prefix byte-identical with exactly one stored copy of the image payload, made zero network attempts, and exited 0 with cooked flags restored. Configuration and project unchanged; scratch removed.

Build `ddc46156fc822d780417971f073e352002cc6ed628568cbdce2f0ff0fc6d83e6`, inputs `fe5f0a974365a8049320ad2437f1bb53c64a08f26ad84afae6f2f1c0a85acdf5`.

## Boundaries

Restored and live card display of a tool result's pictures. Not covered: a live screenshot arriving mid-turn through a real browser session (the probe restores a saved message), graphics-protocol inline drawing on a real terminal, image-heavy results beyond the existing per-result media budget, clipboard capture, and other platforms. Phase 20 and ADD acceptance remain partial.

Commands from repository root:

```bash
rtk node .omx/artifacts/phase20-addition-tool-images/reversal.mjs
rtk node .omx/artifacts/phase20-addition-tool-images/audit.mjs
rtk node .omx/artifacts/phase20-addition-tool-images/pty.mjs regular && rtk node .omx/artifacts/phase20-addition-tool-images/pty.mjs fullscreen
```

Focused command from the package directory:

```bash
rtk env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 ./node_modules/.bin/vitest run src/turn/projection.test.ts src/session/transcript/sessionQueryEventPersistence.test.ts src/cli/interactive/toolCards.test.ts src/presentation/tui/transcript/blocks.test.ts src/cli/interactive/history.test.ts src/cli/interactive/turnSink.test.ts
```
