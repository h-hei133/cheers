# Settings and command discovery

Open `/settings` to browse the available preferences. Appearance contains themes, composer shape and status band items; Model and Context contain the registered request and context controls. Categories with no supported settings are omitted. Use the arrows or Tab to move between navigation and rows. Typing searches across categories, including field names and descriptions.

In settings and model lists, the mouse wheel moves focus through the content rows and stops at the first or last candidate. Enter performs the focused operation. Wheeling over the sidebar pans its visible categories without selecting one; click or use the keyboard to change category. Returning keyboard focus to the sidebar reveals the active category. The detail column and input editor retain their own interaction boundaries.

Moving the pointer over a category or content row highlights it separately from the keyboard selection. Hovering does not select a model, preview a setting or save a value. Enter still acts on the keyboard selection. Moving into the detail column or away from the list clears the highlight; closing the picker restores the terminal's ordinary mouse behavior.

Enter a setting to inspect its effective value, stored override, source, save scope and application timing. Values and sources opens a read-only view with wrapped values and origins; use the arrows to scroll and Enter or Esc to return with your staged choice retained. Choose Edit, stage a value and Apply to save; Discard removes the staged change and restores a preview. Saved and applied are separate outcomes: check the returned notice when a startup override, configuration input or validation issue affects the effective value. A restart setting takes effect after restarting.

List and JSON object editors accept Shift+Enter or Ctrl+J to insert a newline at the cursor. Enter stages the complete value; Apply saves it. Esc leaves the editor and retains any value staged before that edit. Small windows keep the cursor's line visible as text wraps and scrolls.

If another edit changes the same field in the same configuration file, the first Apply reports the conflict and retains your staged choice. An explicit second Apply can read that file again and retry, preserving unrelated fields and comments. If the session, workspace, profile or selected configuration source changed, return to the settings list and reopen the field before saving; retrying the old detail does not transfer its choice to the new destination.

Change save scope opens a separate chooser. Esc keeps the original scope and staged choice. Confirming a readable scope discards the staged choice as the chooser indicates; it does not save it. If the chosen configuration is malformed or unreadable, the original scope and staged choice stay available with a failure notice. If a write reached disk but its runtime binding changed before application, the notice reports that it was saved and that application is unconfirmed.

The initial panel saves to user configuration. `/settings set maxTurns 20` explicitly saves a user override; `/settings set maxTurns 20 --project` saves a project override. `/settings maxTurns` describes the field's registered type, scope and application timing; inspect the current value in the panel. Project settings follow the existing trust and field-scope rules; a field that the project may not own is refused. Never paste credentials into a general settings editor; use `/connect` for connections.

Configuration files store explicit overrides. A small or empty file can inherit working defaults, user preferences and startup inputs. Inspect Source and Effective in the panel instead of filling the file with every default. Some values apply only to a compatible provider or to the next request; the description and application timing identify these cases.

`/help` opens the command catalogue. Browse Session, Context, Workspace, Workflow or Diagnostics, or type a name, alias or description to search the entire catalogue. Enter inserts one canonical command into the composer; submit it separately to execute. Removed or unavailable extension commands cannot be inserted from a stale selection. Esc returns to category navigation or closes the guide.

| Entry | Purpose and persistence |
|---|---|
| `/settings` | Main preference browser with staged Apply/Discard and source details |
| `/theme` | Current-session palette chooser; save a lasting choice through settings Appearance |
| `/statusline` | Status band chooser; also available in settings Appearance. Direct `use` saves through its existing configuration owner |
| `/connect`, `/login`, `/logout` | Connection management and its login/logout shortcuts |
| `/model` | Session model choice and supported automatic roles; retains the session model owner |
| `/view` | Inspect or change user/developer output, including diagnostic and permission detail |

The catalogue and settings panel expose supported entries. Their presence does not establish that every provider, desktop terminal or configuration scope has been tested. Current implementation evidence and remaining interaction work are recorded in [Phase 20 additions](../features/phase-20-addition.md#15-实施与验证证据).
