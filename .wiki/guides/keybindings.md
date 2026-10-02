# Keyboard shortcuts

Use `/hotkey` (also `/hotkeys` or `/keys`) in the interactive session to see the bindings currently in effect.
It includes your overrides, conflicting bindings that became unbound, and terminal limitations.
The tables below describe the defaults; an overridden key may perform a different action.

## Change a binding

Create `~/.cheers/keybindings.json` under the home used by Cheers (`USERPROFILE` when set, otherwise `HOME`).
Map an action ID to a key or list of keys. A configured value replaces that action's defaults; an empty list disables it.
For example:

<!-- config-example:start -->
```json
{
  "app.retry": "f2",
  "tui.input.newLine": ["ctrl+j", "shift+enter"],
  "app.editor.image": []
}
```
<!-- config-example:end -->

Run `/reload` after saving. `/hotkey` will include these rows:

<!-- example-guide:start -->
| Key | Does |
| :--- | :--- |
| `ctrl+j` / `shift+enter` | Insert a new line instead of sending |
| `f2` | Retry the last prompt |
| *(unbound)* | Attach the image on the clipboard |
<!-- example-guide:end -->

The newline row marks `shift+enter` as `not reported` when the terminal does not report it; `ctrl+j` remains available.
Retry no longer uses `f5`, and the clipboard image action has no key until it is rebound.

Write modifiers with `+`, for example `ctrl+shift+z` or `alt+left`. Supported modifier names are `ctrl`, `alt`, `shift`, and `meta`.
Names are case-insensitive and modifier order is normalized. A literal plus key is `+`; its modified form is `ctrl++`.
Unsupported modifier names are reported. A recognized binding still depends on what the terminal can send.

A user binding wins over another action's default. If two user bindings claim the same key, the later action in the
catalogue below wins; file entry order does not choose the winner. `/hotkey` lists only the winning binding.
Use distinct keys to avoid ambiguity. Malformed JSON falls back to defaults. Unknown action IDs and values that are not
a string or list of strings are reported and ignored. Unusable chords are reported and dropped; if none remain, that
action becomes unbound rather than falling back to its defaults.

## Default actions

<!-- key-actions:start -->
| Action | Default keys | Does |
| :--- | :--- | :--- |
| `tui.editor.cursorLeft` | `left` / `ctrl+b` | Move cursor left |
| `tui.editor.cursorRight` | `right` / `ctrl+f` | Move cursor right |
| `tui.editor.cursorUp` | `up` | Move cursor up, then back through prompts |
| `tui.editor.cursorDown` | `down` | Move cursor down, then forward through prompts |
| `tui.editor.cursorWordLeft` | `alt+left` / `ctrl+left` / `alt+b` | Move cursor one word left |
| `tui.editor.cursorWordRight` | `alt+right` / `ctrl+right` / `alt+f` | Move cursor one word right |
| `tui.editor.cursorLineStart` | `home` / `ctrl+a` | Move to line start |
| `tui.editor.cursorLineEnd` | `end` / `ctrl+e` | Move to line end |
| `tui.editor.pageUp` | `pageup` | Scroll the conversation up a page |
| `tui.editor.pageDown` | `pagedown` | Scroll the conversation down a page |
| `tui.editor.deleteCharBackward` | `backspace` | Delete the character before the cursor |
| `tui.editor.deleteCharForward` | `delete` | Delete the character after the cursor |
| `tui.editor.deleteWordBackward` | `ctrl+w` / `alt+backspace` | Delete the word before the cursor |
| `tui.editor.deleteToLineStart` | `ctrl+u` | Delete to the start of the line |
| `tui.editor.deleteToLineEnd` | `ctrl+k` | Delete to the end of the line |
| `tui.editor.yank` | `ctrl+y` | Paste the most recent cut |
| `tui.editor.yankPop` | `alt+y` | Cycle back through earlier cuts |
| `tui.editor.undo` | `ctrl+z` | Undo the last edit |
| `tui.editor.redo` | `ctrl+shift+z` | Take back the last undo |
| `tui.input.newLine` | `shift+enter` / `alt+enter` / `ctrl+j` | Insert a new line instead of sending |
| `tui.input.submit` | `enter` | Send the prompt |
| `tui.input.tab` | `tab` | Complete the highlighted candidate |
| `tui.altScreen.top` | `ctrl+home` | Go to the oldest rows, or the start of the draft |
| `tui.altScreen.bottom` | `ctrl+end` | Go to the newest rows, or the end of the draft |
| `tui.altScreen.search` | `ctrl+shift+f` | Find text in the transcript |
| `app.interrupt` | `escape` | Dismiss a list, interrupt a run, or go back |
| `app.clear` | `ctrl+c` | Clear the draft, then exit on a second press |
| `app.exit` | `ctrl+d` | Exit when the draft is empty |
| `app.clearScreen` | `ctrl+l` | Clear the screen |
| `app.message.followUp` | `ctrl+q` | Queue a follow-up while a run is active |
| `app.thinking.cycle` | `shift+tab` | Switch between planning and building |
| `app.thinking.toggle` | `ctrl+t` | Collapse or expand thinking blocks |
| `app.tools.expand` | `ctrl+o` | Collapse or expand tool output |
| `app.permission.cycle` | `alt+p` | Cycle the permission scope |
| `app.retry` | `f5` | Retry the last prompt |
| `app.scroll.fastUp` | `shift+up` | Scroll up several rows at once |
| `app.scroll.fastDown` | `shift+down` | Scroll down several rows at once |
| `app.editor.external` | `ctrl+g` | Edit the draft in an external editor |
| `app.editor.image` | `alt+v` | Attach the image on the clipboard |
<!-- key-actions:end -->

Arrow keys move within the draft before recalling history; a new draft is not replaced by an older prompt.
An open completion list consumes its navigation keys first. Enter accepts an actively selected completion;
otherwise it submits. While a turn runs, Enter steers it and `ctrl+q` queues a follow-up.

Escape first dismisses a list or interrupts a run. On an idle, empty prompt, two presses within 600ms open the
back chooser. `ctrl+c` first copies a selection when available, interrupts an active run, or clears a draft;
on an idle, empty prompt, two presses within 600ms exit. `ctrl+d` exits only with an empty draft.

Transcript search requires fullscreen mode. Modified keys such as `shift+enter` and `ctrl+shift+z` depend on terminal
reporting; `/hotkey` marks unavailable variants and shows alternatives. External editing and image attachment also
depend on the available editor and clipboard integration.

## Gestures

The mouse rows apply to fullscreen mode; in regular mode the terminal owns scrolling and selection.
Gestures are not action IDs and cannot be rebound in `keybindings.json`.

<!-- key-gestures:start -->
| Gesture | Does |
| :--- | :--- |
| `paste twice` | show a held paste in full, in the prompt |
| `wheel` | scroll the conversation |
| `drag` | select and copy, without the layout |
| `click` | open or close the block under the pointer |
| `shift+drag` | hand the drag to the terminal instead |
<!-- key-gestures:end -->

The action and gesture tables are checked against the runtime catalogues. Update them together when bindings change.
