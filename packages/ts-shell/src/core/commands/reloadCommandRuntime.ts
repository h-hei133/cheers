import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import { currentTheme } from "../../presentation/theme/theme.js";
import { selectTheme } from "../../presentation/theme/selection.js";
import { createComponentLogger } from "../../observability/structuredLogger.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

const logger = createComponentLogger("reload");

/**
 * /reload — re-read the settings this session started with.
 *
 * Project instructions, skills and declared hooks are already re-read on every
 * turn, so editing those takes effect on its own and this command does not touch
 * them. Configuration is the exception: it is read once when the process starts
 * and then carried for the session's lifetime, which means editing `config.json`
 * partway through a session changes nothing until restart — and says nothing about
 * why. That silence is the reason this exists.
 *
 * The scope is deliberately narrow. Reloading extensions, providers or the
 * workspace binding would each need their own notion of "restart in place", and
 * guessing at that for settings that are already live would be worse than saying
 * what is and is not refreshed.
 */
export async function runReloadCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  if (!context.refreshRuntimeConfig) {
    return {
      kind: "local",
      output:
        "This session does not expose its runtime settings, so there is nothing to re-read. Restart to pick up configuration changes.",
    };
  }

  let outcome: { readonly before: RuntimeConfig; readonly after: RuntimeConfig };
  try {
    outcome = context.refreshRuntimeConfig();
  } catch (error) {
    // A file that no longer parses should not replace settings that still work.
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn(`Configuration could not be re-read, keeping the current settings: ${detail}`);
    return {
      kind: "local",
      output: `Could not re-read configuration: ${detail}\n\nKeeping the settings this session started with.`,
    };
  }

  const changed = describeChanges(outcome.before, outcome.after);
  // Applying the theme is what makes the line above true. Reporting a change the
  // screen does not show is worse than not reporting it: it teaches the reader
  // to distrust the command's output.
  const themeMessage = applyConfiguredTheme(outcome.after.theme, context.cwd, context.themePaths);
  return {
    kind: "local",
    output: [
      "Re-read configuration.",
      "",
      changed.length > 0
        ? `Configuration changes:\n${changed.map((line) => `  ${line}`).join("\n")}`
        : "No configuration values changed.",
      "",
      ...(themeMessage ? [themeMessage] : []),
      "Project instructions, skills and hooks are re-read every turn, so they need no reload.",
      "Provider, workspace binding and tool pool changes still need a restart.",
    ].join("\n"),
  };
}

/**
 * Recolor the running surface to the configured theme, and say which one.
 *
 * An unset theme leaves the selection alone; auto follows terminal appearance.
 * A name that no longer loads is reported as not applied rather than
 * throwing, because a bad theme must not cost the settings that did reload.
 */
function applyConfiguredTheme(theme: string | undefined, workspaceRoot?: string, extraPaths: readonly string[] = []): string | undefined {
  if (!theme) return undefined;
  try {
    selectTheme(theme, workspaceRoot, extraPaths);
    if (theme === "auto") return `Following terminal appearance (currently \`${currentTheme()}\`).`;
    return `Applied theme \`${currentTheme()}\` to the running surface.`;
  } catch (error) {
    const detail = `Theme '${theme}' could not be applied: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(detail);
    return `${detail}\nKeeping active theme \`${currentTheme()}\`. Other configuration settings were re-read.`;
  }
}

/**
 * Which of the settings worth naming actually differ.
 *
 * Only the ones a user is likely to have just edited: comparing the whole object
 * would report churn in derived fields and read as noise. A field that is present
 * on one side only is a change, not a missing value.
 */
function describeChanges(before: RuntimeConfig, after: RuntimeConfig): string[] {
  // Named one by one rather than diffed generically: these are the settings a
  // user edits and would expect to see take effect, and listing derived fields
  // alongside them would read as noise.
  const pairs: readonly [string, unknown, unknown][] = [
    ["maxTurns", before.maxTurns, after.maxTurns],
    ["theme", before.theme, after.theme],
    ["agentMode", before.agentMode, after.agentMode],
    ["reserveTokens", before.reserveTokens, after.reserveTokens],
    ["instructionBudgetBytes", before.instructionBudgetBytes, after.instructionBudgetBytes],
    ["temperature", before.temperature, after.temperature],
    ["topP", before.topP, after.topP],
    ["maxOutputTokens", before.maxOutputTokens, after.maxOutputTokens],
  ];

  const changes: string[] = [];
  for (const [key, from, to] of pairs) {
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push(`${key}: ${format(from)} → ${format(to)}`);
    }
  }
  return changes;
}

/** A value as it reads in a report, with "unset" for absence. */
function format(value: unknown): string {
  return value === undefined ? "unset" : JSON.stringify(value);
}
