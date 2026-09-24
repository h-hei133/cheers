import { applyTheme, currentTheme } from "../../presentation/theme/theme.js";
import { listThemes, loadTheme, themeSource } from "../../presentation/themes/index.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /theme — choose the palette the surface renders in.
 *
 * The themes that ship are the defaults, not the whole set: a user's own theme
 * directory and the project's are searched as well, so a palette someone wants is
 * one they can write. The listing says which layer a name came from, because
 * "dark" meaning the built-in one and "dark" meaning the one in your home
 * directory are different facts when the colors differ.
 */
export async function runThemeCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const asked = args[0]?.trim().toLowerCase();
  // The paths `--theme` named, so a theme loaded at startup is listed, loadable
  // and switchable here rather than only for the first frame.
  const extraPaths = context.themePaths ?? [];

  if (!asked || asked === "list") {
    const names = listThemes(context.cwd, extraPaths);
    const active = currentTheme();
    const lines = ["### Themes", ""];
    for (const name of names) {
      const config = loadTheme(name, context.cwd, extraPaths);
      const where = themeSource(name, context.cwd, extraPaths) === "built-in" ? "built in" : "from disk";
      const mark = name === active ? " **(in use)**" : "";
      lines.push(`- \`${name}\` — ${config?.description || "no description"} (${where})${mark}`);
    }
    lines.push(
      "",
      "Select one with `/theme <name>`.",
      "Themes are read from `~/.cheers/themes/*.json` and `<project>/.agents/themes/*.json`.",
    );
    return { kind: "local", output: lines.join("\n") };
  }

  try {
    applyTheme(asked, context.cwd, extraPaths);
  } catch {
    // Naming the alternatives is the whole help here: the failure is almost
    // always a typo or a file that was not saved where it was expected.
    return {
      kind: "local",
      output: `No theme named \`${asked}\`. Available: ${listThemes(context.cwd, extraPaths).join(", ")}.`,
    };
  }

  // The palette is the shared instance every surface already renders with, so
  // applying it is enough; the caller redraws.
  return {
    kind: "local",
    output: `Theme set to \`${currentTheme()}\`.`,
  };
}
