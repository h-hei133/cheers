import { createCommandRegistry } from "./registry.js";
import { SkillLoader } from "../skills/skillLoader.js";
import { TemplateLoader } from "../prompts/templateLoader.js";
import { expandSubmission } from "../prompts/expansion.js";
import type { CommandContext, CommandExecutionResult } from "./types.js";

export async function routeSlashCommand(
  input: string,
  context: CommandContext,
): Promise<CommandExecutionResult | null> {
  if (!input.startsWith("/")) {
    return null;
  }

  const [rawName, ...args] = input.slice(1).split(/\s+/).filter(Boolean);
  if (!rawName) {
    return {
      kind: "local",
      output: buildSlashDiscoveryMessage(),
    };
  }

  // A skill or template invocation expands into a prompt, which is not a command
  // and has no entry in the registry. This has to happen before the unknown-command
  // branch below, because that branch treats every unregistered word as a mistake —
  // which is what made `/skill:name` answer "Unknown slash command" while the same
  // name worked through the `/skill` command.
  const expansion = expandSubmission({
    text: input,
    skills: new SkillLoader(context.cwd).load(),
    templates: new TemplateLoader(context.cwd).load(),
  });
  if (expansion.expanded) {
    return {
      kind: "prompt",
      prompt: expansion.text,
      notice: `Expanded ${expansion.expanded.kind} \`${expansion.expanded.name}\` into a prompt.`,
    };
  }
  if (expansion.unknown?.kind === "skill") {
    const available = [...new SkillLoader(context.cwd).load().keys()].sort();
    return {
      kind: "local",
      output: [
        "Result",
        "- Outcome: blocked",
        "- BlockerKind: command-not-allowlisted",
        `- Reason: Unknown skill: ${expansion.unknown.name}`,
        "- DoNext: Run /skill to see what is available, then retry.",
        "",
        `No skill named \`${expansion.unknown.name}\`.`,
        available.length > 0
          ? `Available: ${available.map((name) => `/skill:${name}`).join(", ")}`
          : "No skills are installed. Put one under `.agents/skills/<name>/SKILL.md`.",
      ].join("\n"),
    };
  }

  const registry = createCommandRegistry(context.cwd);
  const command =
    registry.get(rawName) ??
    Array.from(registry.values()).find((entry) =>
      entry.aliases?.includes(rawName),
    );

  if (
    !command ||
    command.availability === "hidden" ||
    command.enabled === false
  ) {
    return {
      kind: "local",
      output: buildUnknownSlashOutput(rawName, registry),
    };
  }

  return command.execute(args, {
    ...context,
    rawCommandName: rawName,
  });
}

function buildUnknownSlashOutput(
  rawName: string,
  registry: ReadonlyMap<string, { aliases?: readonly string[] }>,
): string {
  const knownCommands = Array.from(registry.keys()).sort();
  const maybeMatches = knownCommands.filter((name) =>
    name.startsWith(rawName.toLowerCase()),
  );
  const aliasMatches = Array.from(registry.entries())
    .filter(([, entry]) =>
      (entry.aliases ?? []).some((alias) =>
        alias.startsWith(rawName.toLowerCase()),
      ),
    )
    .map(([name]) => name);

  const uniqueHints = Array.from(new Set([...maybeMatches, ...aliasMatches]));
  const hintLine =
    uniqueHints.length > 0
      ? `Did you mean: ${uniqueHints
          .slice(0, 3)
          .map((name) => `/${name}`)
          .join(", ")}?`
      : `Try /help to view grouped commands.`;

  return [
    "Result",
    "- Outcome: blocked",
    "- BlockerKind: command-not-allowlisted",
    `- Reason: Unknown slash command: /${rawName}`,
    "- DoNext: Use /help to view available commands and retry with a supported slash command.",
    "",
    `Unknown slash command: /${rawName}`,
    hintLine,
    "",
    ...buildSlashDiscoveryLines(),
  ].join("\n");
}

function buildSlashDiscoveryMessage(): string {
  return [
    "Result",
    "- Outcome: blocked",
    "- BlockerKind: command-not-allowlisted",
    `- Reason: Slash command required after '/'.`,
    "- DoNext: Enter a valid slash command such as /help or /resume.",
    "",
    `Slash command required after '/'.`,
    `Try /help to view grouped commands.`,
    "",
    ...buildSlashDiscoveryLines(),
  ].join("\n");
}

function buildSlashDiscoveryLines(): string[] {
  return [
    "Quick actions:",
    "- /resume                view sessions, or continue recoverable work",
    "- /workspace status      confirm current project/workdir binding",
    "- /diagnose              inspect repo status and suggested next step",
  ];
}
