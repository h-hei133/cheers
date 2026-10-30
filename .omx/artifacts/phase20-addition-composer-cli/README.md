# Composer and external editor through the original CLI

Addition 20.48 fixes an external-editor CRLF return defect. Removing only final LF left CR behind; the original editor setter then normalized it to LF, adding an empty draft line. The return owner now normalizes CRLF/bare CR before comparing unchanged text and removing one final logical newline. Tabs and extra blank lines remain. Reference editor utilities also removed LF only; their editor setters normalize later, so the comparison did not establish a correct CRLF return boundary to copy.

Five new original subprocess regressions failed on old code and under an independent reversal. Final owner checks passed 21 cases and the affected host filter passed 5 cases; 368 unselected cases are not passes. The filter was `external.editor|external edit|pre-rewrite|draft.*(stash|rewrit)|stashes the draft|swaps the prompt`. Vitest ran from the owning package with `--threads=false` and a 768 MiB heap. Source restoration is recorded in `reversal.json`. Build exited zero with a 1536 MiB heap; independent freshness and unchanged owner callable count 3/3 are in `build.json`.

The final current build passed 17 CLI stages per mode: empty prompt; short CRLF/bare-CR/Tab/Chinese/emoji paste; stash/restore; resize 120x60 to 42x20; move and stash/restore caret; resize back; clear; held nine-line paste expansion; clear; original draft; real Ctrl+G external Python editor writing final CRLF; recover original and edited drafts with Alt+S; clear and Ctrl+D. The actual editor subprocess receives original bytes and a cooked TTY. Its temporary file is cleaned, normal exit restores cooked flags, and model turns remain zero. Both modes use one small saved session, a 768 MiB heap, a 45-second/2-MiB cap and isolated runtime state.

`relay.py` parses actual PTY output using installed pyte. Bounded screen rows are compared with the original application's chrome frame and cursor marker. Private device queries and alternate cursor restoration need the explicit parser adaptation; the first two setup failures are retained. `parser.json` records CUP, CUD clamp, alternate cursor, private query and resize checks. Coordinates are parser results; initial row 28 is a seed. They are not a physical desktop cursor or pixel measurement. Resize uses PTY winsize and SIGWINCH but this parser does not model every desktop's scrollback reflow.

Published failures omit raw display rows; receipts contain counts, statuses and digests. `pre-editor-*` and `pre-trailing-newline-*` are earlier successful probes on the old build with narrower fixtures. The final-CRLF failure preserves the later product failure and must not be replaced by those passes.

Run modes serially from the repository root; Python must already provide pyte:

```sh
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-composer-cli/pty.mjs regular
rtk proxy env NODE_OPTIONS=--max-old-space-size=768 node .omx/artifacts/phase20-addition-composer-cli/pty.mjs fullscreen
```

Current dist is validated via manifest/build ID before loading. Receipts are written to `.tmp/composer-cli/`; runtime state is removed in finally. This evidence does not reproduce the user's startup blank lines, missing real terminal dimensions, Windows console/editor input races, desktop/IME, all editor failures or actual model submission. No full suite, executable stress, 20k history, live provider or independent review.
