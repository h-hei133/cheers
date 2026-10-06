import { rejectArguments } from "./syntax/empty.js";
import { describeConfigChanges } from "../../config/application.js";
import { currentTheme } from "../../presentation/theme/theme.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

/** The publication owner prepares resources and decides whether settings were accepted. */
export async function runReloadCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const invalid = rejectArguments("reload", args);
  if (invalid) return invalid;
  if (!context.refreshRuntimeConfig) return { kind: "local", output: "This session does not expose runtime settings. Restart to load configuration changes." };
  let outcome;
  try { outcome = context.refreshRuntimeConfig(); }
  catch { return { kind: "local", output: "Could not re-read configuration. Application outcome is unverified." }; }
  if (outcome.status !== "applied") {
    const status = outcome.status === "rejected" ? "Configuration reload rejected; accepted settings were retained."
      : outcome.status === "superseded" ? "Configuration reload superseded by a newer operation."
      : "Configuration resource application outcome is unverified.";
    return { kind: "local", output: [status, ...outcome.diagnostics,
      ...(outcome.admissionBlocked ? ["New actions are blocked until a valid configuration is loaded."] : [])].join("\n") };
  }
  const changes = describeConfigChanges(outcome.before, outcome.after);
  return { kind: "local", output: ["Re-read configuration.",
    changes.length ? `Configuration changes:\n${changes.map(line => `  ${line}`).join("\n")}` : "No configuration values changed.",
    `Applied theme \`${currentTheme()}\` to the running surface.`,
    "Request settings, provider selection and tool filters apply to the next operation. Explicit agent mode selection takes precedence over its configured default.",
    "Existing operations keep their settings; configuration safety failures block new actions within them.",
    ...(outcome.restartRequired.length ? [`Restart required: ${outcome.restartRequired.join(', ')}.`] : []),
  ].join("\n\n") };
}
