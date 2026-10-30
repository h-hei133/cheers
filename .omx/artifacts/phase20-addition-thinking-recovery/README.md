# Thinking survives an interrupted turn

A turn that produced reasoning and no answer, then was interrupted, keeps its reasoning on the saved message. Reopening restores a collapsed `thinking` block with that text, and the provider signature is not shown.

## What was measured

One session: a persisted user prompt, an assistant message with empty content and reasoning, saved as interrupted. `restoreConversation` over the loaded turns yields `user`, then `thinking` with the exact text and `collapsed: true`; the serialized blocks contain no signature.

## Boundaries

This is the projection, not a live provider run: the message was written directly rather than produced by a real reasoning model that was then interrupted. Reasoning that was never persisted (the provider withheld it, or the process died before the message was written) cannot be restored and is not claimed here.

Build `059b7423ab15`. No product code changed.
