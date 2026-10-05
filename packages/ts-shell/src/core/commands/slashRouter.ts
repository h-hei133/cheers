import { commandInvocations, resolveCommandInvocation } from "./invocation.js";
import { createCommandRegistry } from "./registry.js";
import { resolveSkillCatalog } from "../skills/skillCatalog.js";
import { TemplateLoader } from "../prompts/templateLoader.js";
import { expandSkill, expandTemplate } from "../prompts/expansion.js";
import type { CommandContext, CommandExecutionResult, CommandDefinition } from "./types.js";
import { tokenizeCommandArgs } from "./arguments.js";

export async function routeSlashCommand(
  input: string,
  context: CommandContext,
): Promise<CommandExecutionResult | null> {
  if (!input.startsWith("/")) {
    return null;
  }

  const invocation = /^\/\s*(\S+)(?:\s+([\s\S]*))?$/.exec(input);
  const rawName = invocation?.[1];
  const rawCommandArgs = invocation?.[2] ?? "";
  if (!rawName) {
    return {
      kind: "local",
      output: buildSlashDiscoveryMessage(),
    };
  }

  // A skill invocation expands into a prompt. It is not a command and has no entry
  // in the registry, so it has to be recognised before the unknown-command branch
  // below — which treats every unregistered word as a mistake, and is what made
  // `/skill:name` answer "Unknown slash command" while the same name worked through
  // the `/skill` command.
  //
  // Resolved through the same catalog the prompt path uses, so the skills named
  // here are exactly the ones the model was told about: `--skill` loads a file
  // the model can already use, and an untrusted project's skills are absent from
  // both lists rather than only from one.
  const skills = resolveSkillCatalog({
    workspaceRoot: context.cwd,
    ...(context.skillOptions?.skillPaths ? { skillPaths: context.skillOptions.skillPaths } : {}),
    ...(context.skillOptions?.noSkills ? { noSkills: true } : {}),
  }).skills;
  const skill = expandSkill(input, skills);
  if (skill.skill) {
    return {
      kind: "prompt",
      prompt: skill.text,
      notice: `Expanded skill \`${skill.skill}\` into a prompt.`,
    };
  }
  if (skill.unknownSkill) {
    const available = [...skills.keys()].sort();
    return {
      kind: "local",
      output: [
        "Result",
        "- Outcome: blocked",
        "- BlockerKind: command-not-allowlisted",
        `- Reason: Unknown skill: ${skill.unknownSkill}`,
        "- DoNext: Run /skill to see what is available, then retry.",
        "",
        `No skill named \`${skill.unknownSkill}\`.`,
        available.length > 0
          ? `Available: ${available.map((name) => `/skill:${name}`).join(", ")}`
          : "No skills are installed. Put one under `.agents/skills/<name>/SKILL.md`.",
      ].join("\n"),
    };
  }

  const registry = createCommandRegistry(context.cwd);
  const resolved = resolveCommandInvocation([...registry.values()], rawName);
  const command = resolved ? registry.get(resolved.commandName) : undefined;

  if (
    command &&
    command.availability !== "hidden" &&
    command.enabled !== false
  ) {
    if (context.interactive === false && command.supportsNonInteractive !== true) {
      return {
        kind: "local",
        output: [
          "Result",
          "- Outcome: blocked",
          "- BlockerKind: command-not-allowlisted",
          `- Reason: ${command.nonInteractiveReason ?? `/${command.name} does not support non-interactive mode.`}`,
          "- DoNext: Run this command in an interactive session or use /help for supported commands.",
        ].join("\n"),
      };
    }
    let args: string[];
    try {
      args = command.argumentMode === "raw"
        ? (rawCommandArgs ? [rawCommandArgs] : [])
        : tokenizeCommandArgs(rawCommandArgs);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return { kind: "local", output: `Invalid /${rawName} arguments: ${error.message}` };
    }
    return command.execute(args, {
      ...context,
      rawCommandName: resolved!.name,
      rawCommandArgs,
    });
  }

  // Only once nothing in the registry claims the name: a built-in command is a
  // promise the product made, and a file in a prompts directory must not quietly
  // take its name away. The template is looked up with the slash the user typed,
  // which is the form the file is documented in.
  const expanded = expandTemplate(input, new TemplateLoader(context.cwd).load());
  if (expanded.template) {
    return {
      kind: "prompt",
      prompt: expanded.text,
      notice: `Expanded template \`${expanded.template}\` into a prompt.`,
    };
  }

  return {
    kind: "local",
    output: buildUnknownSlashOutput(rawName, registry),
  };
}

function buildUnknownSlashOutput(
  rawName: string,
  registry: ReadonlyMap<string, CommandDefinition>,
): string {
  const uniqueHints = [...registry.values()].flatMap(commandInvocations)
    .filter(invocation => invocation.name.startsWith(rawName.toLowerCase()))
    .map(invocation => invocation.name);
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
