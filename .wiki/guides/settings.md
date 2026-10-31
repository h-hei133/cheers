# Settings and command discovery

Open `/settings` to browse the available preferences. Appearance contains themes, composer shape and status band items; Model and Context contain the registered request and context controls. Categories can also expose read-only owner entry points without pretending to be editable fields. Use Left/Right to change the top category. Tab or Shift+Tab switches between rows and section headings; Up/Down moves within that focus. Enter on a heading enters its first field. Esc returns from headings to rows, then closes the panel. The active category stays visible when the strip is wider than the terminal. Typing searches across categories, including field names and descriptions.

In settings and model lists, the mouse wheel moves focus through the content rows and stops at the first or last candidate. Enter performs the focused operation. The model list retains its sidebar. Wheeling over that sidebar pans its visible categories without selecting one; click or use the keyboard to change category. Returning keyboard focus to the sidebar reveals the active category. The detail column and input editor retain their own interaction boundaries.

In `/model`, Roles and All models lead the sidebar. Providers with usable model choices appear first; each provider group sorts by name, and model choices sort by model ID within the readiness groups. An extra current model outside the catalogue stays first. The Not ready heading cannot be selected; entries below it remain available for inspection and configuration, with the specific connection or compatibility reason shown. Browsing does not verify remote availability.

Moving the pointer over a category or content row highlights it separately from the keyboard selection. Hovering does not select a model, preview a setting or save a value. Enter still acts on the keyboard selection. Moving into the detail column or away from the list clears the highlight; closing the picker restores the terminal's ordinary mouse behavior.

Enter a setting to inspect its effective value, stored override, source, save scope and application timing. Values and sources opens a read-only view with wrapped values and origins; use the arrows to scroll and Enter or Esc to return with your staged choice retained. Choose Edit, stage a value and Apply to save; Discard removes the staged change and restores a preview. Saved and applied are separate outcomes: check the returned notice when a startup override, configuration input or validation issue affects the effective value. A restart setting takes effect after restarting.

List and JSON object editors accept Shift+Enter or Ctrl+J to insert a newline at the cursor. Enter stages the complete value; Apply saves it. Esc leaves the editor and retains any value staged before that edit. Small windows keep the cursor's line visible as text wraps and scrolls.

If another edit changes the same field in the same configuration file, the first Apply reports the conflict and retains your staged choice. An explicit second Apply can read that file again and retry, preserving unrelated fields and comments. If the session, workspace, profile or selected configuration source changed, return to the settings list and reopen the field before saving; retrying the old detail does not transfer its choice to the new destination.

Change save scope opens a separate chooser. Esc keeps the original scope and staged choice. Confirming a readable scope discards the staged choice as the chooser indicates; it does not save it. If the chosen configuration is malformed or unreadable, the original scope and staged choice stay available with a failure notice. If a write reached disk but its runtime binding changed before application, the notice reports that it was saved and that application is unconfirmed.

The initial panel saves to user configuration. `/settings set maxTurns 20` explicitly saves a user override; `/settings set maxTurns 20 --project` saves a project override. `/settings maxTurns` describes the field's registered type, scope and application timing; inspect the current value in the panel. Project settings follow the existing trust and field-scope rules; a field that the project may not own is refused. Never paste credentials into a general settings editor; use `/connect` for connections.

Configuration files store explicit overrides. A small or empty file can inherit working defaults, user preferences and startup inputs. Inspect Source and Effective in the panel instead of filling the file with every default. Some values apply only to a compatible provider or to the next request; the description and application timing identify these cases.

Settings shows the actual save file beside Stored and in Values and sources. The model catalogue has its own file:

| Concern | File and scope | Writer |
|---|---|---|
| Runtime preferences | `config.json` in the selected user profile; project preferences use `.cheers/config.json` | Settings, `/model use --global` for a lasting default |
| Provider identity, connections and credentials | `auth.json` in the selected user profile, written owner-only (`0600` on POSIX) | `/connect` and the existing account/connection commands |
| Custom providers and model metadata | `models.json` in the user profile only | `/model config` creates an example; edit entries inside its existing `providers` object |
| Refreshed provider catalogue | `models-cache.json` in the user profile | `/model refresh`; generated cache |

Model and role choices made in `/model` normally belong to the current session and are saved for resume. Changing the settings save scope does not move them or create a project model catalogue. A connection's address in `auth.json` selects where requests go; a catalogue address identifies provider/model metadata and does not create a connection.

Existing user settings files containing connections or credentials remain readable. The next user configuration save writes and verifies their `auth.json` copy before removing those fields from settings. An existing auth field takes precedence over a legacy settings copy. If a save is interrupted between the files, it reports an unverified write outcome; the files are not one atomic transaction. Project configuration and explicit input files keep their existing scope rules.

An unreadable or malformed model catalogue produces a notice in `/model` and `/model list`; other catalogue layers remain available. Repeated top-level `providers` keys produce a warning: JSON uses the last object, so merge the entries into one object. The application does not rewrite that file. Reopen the model panel after correcting it to refresh the catalogue and its notice together. Command output using an accepted session snapshot retains that snapshot's notice until it is refreshed.

`/help` opens the command catalogue. Browse Session, Context, Workspace, Workflow or Diagnostics, or type a name, alias or description to search the entire catalogue. Enter inserts one canonical command into the composer; submit it separately to execute. Removed or unavailable extension commands cannot be inserted from a stale selection. Esc returns to category navigation or closes the guide.

| Entry | Purpose and persistence |
|---|---|
| `/settings` | Main preference browser with staged Apply/Discard and source details |
| Settings → Memory | Inserts `/memory status`; health, candidates and facts remain owned by the memory command |
| Settings → Shell | Inserts `/shell status`; backend and execution diagnostics remain owned by the shell command |
| `/theme` | Current-session palette chooser; save a lasting choice through settings Appearance |
| `/statusline` | Status band chooser; also available in settings Appearance. Direct `use` saves through its existing configuration owner |
| `/connect`, `/login`, `/logout` | Connection management and its login/logout shortcuts; `/login` completes providers and authentication flags, while `/logout` completes saved connections |
| `/model` | Session model choice and supported automatic roles; retains the session model owner |
| `/view` | Inspect or change user/developer output, including diagnostic and permission detail |

In `/model`, choose an automatic role to assign its model, change its supported thinking effort or use the default model again. Esc cancels a child and returns to its parent; reopen the child to make a new choice. Role changes save to the current session and preserve the default model and other roles. If the captured catalogue or session changed, reopen the model panel before saving.

If a role's saved thinking effort is no longer available, its row stays focused and is marked unavailable. Enter leaves it unchanged. Move to a supported effort to save an explicit replacement.

The catalogue and settings panel expose supported entries. Their presence does not establish that every provider, desktop terminal or configuration scope has been tested. Current implementation evidence and remaining interaction work are recorded in [Phase 20 additions](../features/phase-20-addition.md#15-实施与验证证据).

The login and logout shortcuts reuse the connection command's grammar and credential owner. Their help text and completions are projections, not a second authentication path.
