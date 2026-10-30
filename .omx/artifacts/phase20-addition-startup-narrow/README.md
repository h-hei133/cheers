# A narrow terminal with a wrapped draft

The user's report described the caret dropping below many blank rows that could not be deleted. The 120-column probe did not reproduce it, so this one narrows the terminal to 40 columns, where a draft wraps across several rows.

## What was measured

A size-configurable PTY relay (40 columns × 40 rows), one isolated home/profile/Git project, synthetic mode, 768 MiB heap. A long line is typed after the runtime has adopted input, then characters are deleted.

| Observation | Result |
|---|---|
| Wrapped draft | `❯ alpha bravo charlie delta echo` / `foxtrot golf hotel india juliet` — continuation row aligns under the first, no blank rows |
| Caret after typing | inside the composer, at the end of the wrapped text |
| Three backspaces on `abcdef` | text becomes `abc` — real characters removed, frame repainted |
| Exit | clean, cooked flags restored |

The narrow layout keeps the draft, its wrap, and the caret inside the composer. No blank rows appear above or below it, and deletion removes real characters.

## Why the first attempt looked like a failure

Two probe mistakes, both kept here rather than reported as product defects:

- Typing `\r` between lines. The loading surface says "Enter adds a line", but once the runtime has adopted input, Enter submits. Five lines became five submitted turns (`Synthetic reply: one`, …), not one five-line draft.
- Asserting on a long wrapped line after ten backspaces. The deletions removed characters at the end of the second visual row, and the repainted frame looked nearly identical, so a crude "did the text change" check read as no change. A short line (`abcdef` → `abc`) shows the behaviour plainly.
- Sending `/exit` while `abc` was still in the draft. A slash command is only a command when it starts the source, so the line became `abc/exit` and was submitted as prose (`Synthetic reply: abc/exit`). Clearing the draft first makes the exit take effect. This is correct behaviour, not a defect.

## Boundaries

Synthetic/offline session, one width, Linux PTY. Not covered: the user's real terminal, its font/IME behaviour, resizing mid-draft, or physical pixel coordinates. The reported symptom remains unreproduced rather than disproven.

Build `c1302abc9ff4873abf20da961b7a991bd7c70319ca181fef499e84f66bfc7268`, inputs `6e696319aff2a2fc9b1fff597b439fccc3b5a07c863b050c2a0e31816939814e`. No product code changed.

```bash
rtk node .omx/artifacts/phase20-addition-startup-narrow/pty.mjs regular 40 && rtk node .omx/artifacts/phase20-addition-startup-narrow/pty.mjs fullscreen 40
```
