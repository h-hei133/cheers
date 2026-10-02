# Themes

Use `/theme` to list palettes, `/theme light` or `/theme dark` to choose one, and `/theme auto` to follow terminal appearance. A command changes the current session. To keep the choice for future sessions, set `"theme": "auto"` (or a theme name) in your configuration; `/reload` applies an edited setting. `--use-theme <name>` overrides the saved choice at startup.

Automatic mode uses the bundled light/dark pair. A terminal that reports its appearance can switch the palette during the session; background-color replies provide an initial fallback. Terminals without these reports use dark. The first frame does not wait for a reply, so a light terminal may briefly display the dark palette. A named choice stays fixed even if terminal appearance changes.

Custom themes are JSON files in `~/.cheers/themes/`, `<project>/.agents/themes/`, or paths supplied with `--theme`. Choose them by name; named files can override bundled names and are watched for edits. Automatic mode deliberately uses bundled palettes, including when a custom file is named `dark` or `light`. `auto` is reserved for automatic selection.

Theme files accept `name`, `description`, `colors`, and optional `vars`. Unknown color tokens, invalid colors and cyclic variables are errors. Omitted tokens inherit the default palette. A failed `/theme` selection or `/reload` theme application keeps the active palette and reports the error; other successfully reloaded configuration settings remain applied.
