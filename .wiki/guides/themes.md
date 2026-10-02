# Themes

Use `/theme` to list palettes, `/theme light` or `/theme dark` to choose one, and `/theme auto` to follow terminal appearance. A command changes the current session. To keep the choice for future sessions, set `"theme": "auto"` (or a theme name) in your configuration; `/reload` applies an edited setting. `--use-theme <name>` overrides the saved choice at startup.

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
