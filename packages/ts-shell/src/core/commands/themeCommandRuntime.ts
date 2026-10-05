import { entitySyntax } from "./syntax/entity.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import { currentTheme } from "../../presentation/theme/theme.js";
import { selectTheme, selectedTheme } from "../../presentation/theme/selection.js";
import { listThemes, loadTheme, themeSource } from "../../presentation/themes/index.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export const themeSyntax = entitySyntax("theme");

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
  const parsed = parseSyntax(themeSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /theme arguments: ${parsed.reason}\n${syntaxHelp(themeSyntax)}` };
  const asked = parsed.args[0];
  // The paths `--theme` named, so a theme loaded at startup is listed, loadable
  // and switchable here rather than only for the first frame.
  const extraPaths = context.themePaths ?? [];

  if (!asked || asked.toLowerCase() === "list") {
    const names = listThemes(context.cwd, extraPaths).filter((name) => name !== "auto");
    const active = currentTheme();
    const auto = selectedTheme() === "auto";
    const lines = ["### Themes", "", `- \`auto\` — follow terminal appearance${auto ? ` (currently \`${active}\`) **(in use)**` : ""}`];
    for (const name of names) {
      let config;
      try {
        config = loadTheme(name, context.cwd, extraPaths);
      } catch (error) {
        lines.push(`- \`${name}\` — ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const where = themeSource(name, context.cwd, extraPaths) === "built-in" ? "built in" : "from disk";
      const mark = name === active && selectedTheme() !== "auto" ? " **(in use)**" : "";
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
    selectTheme(asked, context.cwd, extraPaths);
  } catch (error) {
    // Naming the alternatives is the whole help here: the failure is almost
    // always a typo or a file that was not saved where it was expected.
    return {
      kind: "local",
      output: listThemes(context.cwd, extraPaths).includes(asked)
        ? (error instanceof Error ? error.message : String(error))
        : `No theme named \`${asked}\`. Available: auto, ${listThemes(context.cwd, extraPaths).join(", ")}.`,
    };
  }

  // The palette is the shared instance every surface already renders with, so
  // applying it is enough; the caller redraws.
  return {
    kind: "local",
    output: selectedTheme() === "auto"
      ? `Theme set to \`auto\` (currently \`${currentTheme()}\`); following terminal appearance.`
      : `Theme set to \`${currentTheme()}\`.`,
  };
}
