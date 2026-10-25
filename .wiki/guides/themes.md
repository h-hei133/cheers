# Themes

Use `/settings`, then Appearance, to choose and save a palette for future sessions. Enter the Theme setting, choose a value, then Apply; Discard restores the preview. The details show the save scope, stored value, effective value and source. An explicit startup override can still supply the effective choice after a save.

`/theme` lists palettes, `/theme light` or `/theme dark` selects one for the current session, and `/theme auto` follows terminal appearance. You can also edit `"theme": "auto"` (or a theme name) in your configuration and run `/reload`. `--use-theme <name>` overrides the saved choice at startup. See [settings and command discovery](settings.md) for other preferences and their persistence rules.

Automatic mode uses the bundled light/dark pair. A terminal that reports its appearance can switch the palette during the session; background-color replies provide an initial fallback. Terminals without these reports use dark. The first frame does not wait for a reply, so a light terminal may briefly display the dark palette. A named choice stays fixed even if terminal appearance changes.

Custom themes are JSON files in `~/.cheers/themes/`, `<project>/.agents/themes/`, or paths supplied with `--theme`. Choose them by name; named files can override bundled names and are watched for edits. Automatic mode deliberately uses bundled palettes, including when a custom file is named `dark` or `light`. `auto` is reserved for automatic selection.

Theme files accept `name`, `description`, `colors`, and optional `vars`. Unknown color tokens, invalid colors and cyclic variables are errors. Omitted tokens inherit the default palette. A failed `/theme` selection or `/reload` theme application keeps the active palette and reports the error; other successfully reloaded configuration settings remain applied.


The bundled choices are `dark`, `light`, `dark-contrast` and `light-contrast`. Use the contrast variants with a black or white terminal background respectively; named themes do not set the terminal's own background. `auto` continues to select the standard pair.

The schema exposes 48 color roles. Code has independent `syntaxText`, `syntaxKeyword`, `syntaxString`, `syntaxNumber`, `syntaxComment`, `syntaxFunction`, `syntaxType`, `syntaxVariable` (attribute names), `syntaxMeta` and `syntaxBuiltin` colors. Markdown adds `mdLinkUrl`, `mdQuoteText`, `mdQuoteBorder`, `mdListBullet`, `mdRule` and `mdCodeBorder`.

Existing files can omit these roles: code inherits the corresponding text, command, title or filename color; Markdown inherits the dim, accent or border color it previously used. Explicit new roles take precedence. For example, this keeps shell command flags blue while coloring code keywords purple:

```json
{
  "name": "custom",
  "colors": {
    "commandFlag": "#2563eb",
    "syntaxKeyword": "#9333ea"
  }
}
```
