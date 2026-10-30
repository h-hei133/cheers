# Startup draft adoption and caret placement

The user reported that entering cheers sometimes leaves the caret below many blank lines that cannot be deleted until something is typed. This probe types a three-line draft **during loading**, lets the real runtime adopt the same editor, and then measures what the caret and the draft actually are.

## What was measured

Both screen modes, one isolated home/profile/Git project each, synthetic mode with a rejecting fetch observer, 768 MiB heap, 40-second bound.

| Mode | Draft after adoption | Caret | Five backspaces |
|---|---|---|---|
| regular | `line one\nline two\nline three` (28 chars) | 28 (end) | 23 chars, text is the exact 5-char prefix |
| fullscreen | same | 28 (end) | same |

The fullscreen raw frames show the adopted draft drawn as three rows (`❯ line one`, `  line two`, `  line thre…`) with the cursor placed at row 58, column 12 — the end of the third line. No blank rows appear above or below it.

## What this does and does not establish

- The loading-to-runtime handoff preserves the draft and its caret exactly, and backspace removes real characters. The "phantom blank rows that cannot be deleted" symptom is **not reproducible** on this build with a multi-line draft typed during loading.
- It does not reproduce the user's original terminal, window size, or the exact keystrokes that preceded the observation. The mechanism behind the original report therefore remains unconfirmed rather than disproven.

Two probe failures are retained rather than treated as product findings: an early readiness assertion waited for the composer placeholder, which a non-empty draft correctly suppresses, and an observer called a view method that does not exist (`lastComposerGeometry`), producing a fatal error that ended the process.

Build `5bf1f1e9aa7b6bcbbce651406619195849c98f9a9be8add557fa4467dcb4a473`, inputs `4a1f8e04d9c1e9765729f40c7e6ae6fda84779dd82cef93a457dd7d326ca8806`. No product code changed.

```bash
rtk node .omx/artifacts/phase20-addition-startup-draft/pty.mjs regular
rtk node .omx/artifacts/phase20-addition-startup-draft/pty.mjs fullscreen
```
