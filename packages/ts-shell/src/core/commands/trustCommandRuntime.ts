import path from "node:path";
import { projectTrust, type ProjectTrustLevel } from "../security/projectTrust.js";
import { neutraliseForDisplay } from "../text/safety.js";
import { loadHookDeclarations } from "../hooks/config.js";
import { hookFingerprint } from "../hooks/trust.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /trust — see and decide what this project is allowed to contribute.
 *
 * The decision exists because several things a repository can ship cause code to
 * run: MCP server definitions, hooks, workflow steps. Reading them is safe;
 * honouring them is not, so the choice belongs to whoever opened the repository
 * rather than to the repository.
 *
 * The command reports what is at stake before it offers to change anything. A
 * bare "trusted / not trusted" toggle would ask for a decision without saying
 * what it covers, which is the shape of prompt people learn to dismiss.
 */
export async function runTrustCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const root = path.resolve(context.cwd || process.cwd());
  const action = (args[0] ?? "").trim().toLowerCase();

  if (action === "" || action === "status") {
    return { kind: "local", output: describeTrust(root) };
  }

  const levels: Record<string, ProjectTrustLevel> = {
    on: "trusted",
    off: "untrusted",
    session: "session-only",
  };
  const level = levels[action];
  if (!level) {
    return {
      kind: "local",
      output: [
        `Unknown /trust argument '${action}'.`,
        "",
        "Usage:",
        "  /trust                  show what this project may contribute and the current decision",
        "  /trust on               allow this project's MCP servers, hooks and workflow steps",
        "  /trust off              refuse them (the default)",
        "  /trust session          allow them until this session ends",
      ].join("\n"),
    };
  }

  const before = describeTrust(root);
  projectTrust.setProjectTrust(root, level);
  return {
    kind: "local",
    output: `Recorded '${level}' for ${root}.\n\n${before}\n\nRe-run /mcp refresh all for a change to MCP servers to take effect.`,
  };
}

/**
 * What this project contributes, and whether it is currently allowed to.
 *
 * Commands are listed because they are what will run. They are neutralised
 * before display: a repository controls these strings, and a newline or a control
 * sequence in one would let it write text that looks like the harness speaking,
 * at exactly the moment the user is deciding.
 */
function describeTrust(root: string): string {
  const untrusted = projectTrust.isProjectUntrusted(root);
  const decision = untrusted ? "untrusted (project resources are refused)" : "not refused";
  const lines = [
    `Project: ${root}`,
    `Decision: ${decision}`,
    "",
  ];

  const mcpConfig = path.join(root, ".private-agents.mcp.json");
  lines.push(
    projectTrust.hasSensitiveProjectResources(root)
      ? "This project declares resources that would run on your machine."
      : "No project resources that would run were detected.",
  );

  const { hooks, problems } = loadHookDeclarations(root, { homeDir: path.join(root, "\u0000none") });
  const projectHooks = hooks.filter((hook) => hook.sourcePath.startsWith(root));
  if (projectHooks.length > 0) {
    lines.push("", "Commands this project asks to run:");
    for (const hook of projectHooks) {
      lines.push(`  ${hook.event}${hook.matcher ? ` (${hook.matcher})` : ""}: ${neutraliseForDisplay(hook.command)}`);
      lines.push(`    fingerprint ${hookFingerprint(hook).slice(0, 12)}`);
    }
  }
  for (const problem of problems) {
    lines.push(`  warning: ${neutraliseForDisplay(problem)}`);
  }
  lines.push(`  mcp config: ${mcpConfig}`);

  return lines.join("\n");
}
