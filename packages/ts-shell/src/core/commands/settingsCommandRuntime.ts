import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * `/settings`
 *
 * The interactive surface answers this with a panel — the picker registry
 * maps the bare command to the settings chooser, the same way `/model` and
 * `/statusline` become pickers. What runs here is the non-interactive story:
 * name the settings that exist, say where they live, and never pretend to
 * flip what a piped session cannot show.
 */

export async function runSettingsCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const which = args[0]?.trim();
  if (which === "attentionOnIdle") {
    return {
      kind: "local",
      output: [
        "### attentionOnIdle",
        "",
        "Bell and a desktop notification when a turn that ran 30s or longer",
        "finishes with nothing queued behind it. Off by default.",
        "",
        'Set it in the user config: `"attentionOnIdle": true`',
      ].join("\n"),
    };
  }
  if (which === "offline") {
    return {
      kind: "local",
      output: [
        "### offline",
        "",
        "Skips requests this session makes on its own initiative — the release",
        "check and catalogue refresh. Prompts and tools are unaffected.",
        "",
        'Set it in the user config: `"offline": true`',
      ].join("\n"),
    };
  }
  return {
    kind: "local",
    output: [
      "### Settings",
      "",
      "Interactive: run `/settings` bare to open the panel.",
      "",
      "| Setting | What it does |",
      "| :--- | :--- |",
      "| attentionOnIdle | bell + notification when a long turn finishes |",
      "| offline | skip self-initiated requests |",
      "",
      "Details: `/settings <name>`. The settings live in the user config file,",
      "where the rest of the configuration already is.",
    ].join("\n"),
  };
}
