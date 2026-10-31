import { trustSyntax } from "./trust/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import path from "node:path";
import { resolveProjectConfigFile } from '../paths/project.js';
import { projectTrust, TrustWriteError } from "../security/projectTrust.js";
import { neutraliseForDisplay } from "../text/safety.js";
import { loadHookDeclarations } from "../hooks/config.js";
import { hookFingerprint, HookTrustStore } from "../hooks/trust.js";
import { configurationApplicationNotice } from "./configuration.js";
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
  const parsed = parseSyntax(trustSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /trust arguments: ${parsed.reason}\n${syntaxHelp(trustSyntax)}` };
  const root = path.resolve(context.projectRoot ?? context.cwd ?? process.cwd());
  const level = parsed.action.level;
  if (level === undefined) {
    if (parsed.action.name === "forget") return forgetHookApprovals(root);
    return { kind: "local", output: describeTrust(root) };
  }

  try {
    const result = projectTrust.setProjectTrust(root, level);
    if (!result) return { kind: 'local', output: 'Trust write outcome is unverified. Inspect the saved decision and reload.' };
    const application = configurationApplicationNotice(context);
    return { kind: 'local', output: [
      `Recorded '${level}' for ${neutraliseForDisplay(root)}.`,
      result.scope === 'process' ? 'Scope: this process only; a durable trust-store change expires this grant.' : 'Saved decision verified on disk.',
      describeTrust(root), application,
      'Re-run /mcp refresh all for a change to MCP servers to take effect.',
    ].filter(Boolean).join('\n\n') };
  } catch (error) {
    return { kind: 'local', output: error instanceof TrustWriteError ? `${error.message} Inspect the saved decision and reload.` : 'Trust write outcome is unverified. Inspect the saved decision and reload.' };
  }
}

/**
 * Withdraw every remembered approval for this project's hooks.
 *
 * A grant nobody can take back outlives the judgement behind it. The entry
 * points here are the fingerprints `/trust status` prints, so a user can see
 * exactly what is standing before deciding to forget it.
 *
 * Only this project's approvals are withdrawn: the store is keyed by declaring
 * file, so the set to remove is the one whose file lives in this project. The
 * user's own hooks file is deliberately left alone — it is not this project's
 * to revoke.
 */
function forgetHookApprovals(root: string): LocalCommandResult {
  const { hooks } = loadHookDeclarations(root, { homeDir: path.join(root, "\u0000none") });
  const store = new HookTrustStore();
  const withdrawn = hooks.filter((hook) => hook.sourcePath.startsWith(root))
    .map((hook) => ({ hook, fingerprint: hookFingerprint(hook) }))
    .filter(({ fingerprint }) => store.forgetTrust(fingerprint));

  if (withdrawn.length === 0) {
    return { kind: "local", output: `No remembered approvals for ${neutraliseForDisplay(root)}. Nothing was withdrawn.` };
  }
  return { kind: "local", output: [
    `Withdrew ${withdrawn.length} remembered approval${withdrawn.length === 1 ? "" : "s"} for ${neutraliseForDisplay(root)}.`,
    ...withdrawn.map(({ hook }) => `  ${hook.event}: ${neutraliseForDisplay(hook.command)}`),
    "",
    "Each hook will be put to you again the next time it would run.",
  ].join("\n") };
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
  const state = projectTrust.decision(root);
  const decision = state === 'unavailable' ? 'unavailable (project resources are refused until the trust store can be read)'
    : state === 'untrusted' ? 'untrusted (project resources are refused)'
      : state === 'trusted' ? 'trusted' : 'undecided (no trust decision recorded)';
  const lines = [
    `Project: ${neutraliseForDisplay(root)}`,
    `Decision: ${decision}`,
    "",
  ];

  const mcpConfig = resolveProjectConfigFile(root, 'mcp.json');
  lines.push(
    projectTrust.hasSensitiveProjectResources(root)
      ? "This project declares resources that would run on your machine."
      : "No project resources that would run were detected.",
  );

  const { hooks, problems } = loadHookDeclarations(root, { homeDir: path.join(root, "\u0000none") });
  const projectHooks = hooks.filter((hook) => hook.sourcePath.startsWith(root));
  if (projectHooks.length > 0) {
    lines.push("", state === 'untrusted'
      ? "Commands this project asks to run (refused while the project is untrusted):"
      : "Commands this project asks to run:");
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
