export interface SlashCommandLineRenderer {
  renderLine(line: string): void;
}

export interface SlashCommandSpec {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly group:
    | "session"
    | "context"
    | "workspace"
    | "workflow"
    | "diagnostics";
  readonly summary: string;
  readonly argumentHint?: string;
}

export const SLASH_COMMANDS = [
  {
    name: "resume",
    aliases: ["sessions", "session"],
    group: "session",
    summary: "pick, inspect, switch, or continue a session",
  },
  {
    name: "continue",
    aliases: ["c"],
    group: "session",
    summary: "pick up this session's stopped work, optionally with a follow-up",
  },
  {
    name: "restore",
    group: "session",
    summary: "preview or execute guarded recovery authority restore",
  },
  {
    name: "workspace",
    aliases: ["where", "project"],
    group: "workspace",
    summary: "inspect or switch project/workdir binding",
  },
  {
    name: "cd",
    group: "workspace",
    summary: "quick attach by path",
  },
  {
    name: "pwd",
    group: "workspace",
    summary: "print current workspace status",
  },
  {
    name: "cancel",
    group: "workflow",
    summary: "stop only the current run",
  },
  {
    name: "diagnose",
    aliases: ["repo", "changes"],
    group: "diagnostics",
    summary: "repo-aware diagnosis and next action",
  },
  {
    name: "model",
    aliases: ["models"],
    group: "diagnostics",
    summary: "inspect and switch active model",
    argumentHint: "use <provider/model>",
  },
  {
    name: "mcp",
    group: "diagnostics",
    summary: "inspect and recover MCP state",
  },
  {
    name: "permissions",
    aliases: ["approval-policy"],
    group: "diagnostics",
    summary: "inspect trust policy state",
  },
  {
    name: "connect",
    aliases: ["providers"],
    group: "diagnostics",
    summary: "provider connection management",
  },
  {
    name: "help",
    aliases: ["?"],
    group: "diagnostics",
    summary: "show full command guide",
  },
  {
    name: "exit",
    aliases: ["quit", "q"],
    group: "session",
    summary: "gracefully exit session and restore terminal",
  },
  {
    name: "clear",
    aliases: ["reset", "cls"],
    group: "session",
    summary: "clear conversation context and start fresh",
  },
  {
    name: "statusline",
    aliases: ["status"],
    group: "workspace",
    summary: "choose which facts the status band keeps in view",
    argumentHint: "use <preset|item...>",
  },
  {
    name: "review",
    aliases: ["audit", "check"],
    group: "workflow",
    summary: "review working tree code changes and diffs",
  },
  {
    name: "init",
    aliases: ["setup"],
    group: "workflow",
    summary: "inspect tech stack and initialize AGENTS.md rules",
  },
  {
    name: "cost",
    aliases: ["tokens", "stats"],
    group: "session",
    summary: "display session token usage and estimated cost",
  },
  {
    name: "undo",
    aliases: ["rewind", "revert"],
    group: "session",
    summary: "rewind the last conversational turn or changes",
  },
  {
    name: "export",
    aliases: ["save"],
    group: "session",
    summary: "export session history as markdown or jsonl",
  },
  {
    name: "skill",
    aliases: ["skills"],
    group: "workspace",
    summary: "the written-down ways of working this project and this user have",
  },
  {
    name: "retry",
    group: "session",
    summary: "run the last turn again after it failed or was interrupted",
  },
  {
    name: "hotkey",
    aliases: ["hotkeys", "keys"],
    group: "workspace",
    summary: "every key this surface binds, and which ones this terminal delivers",
  },
  {
    name: "copy",
    aliases: ["cp"],
    group: "session",
    summary: "copy last assistant response to clipboard",
  },
  {
    name: "goal",
    aliases: ["objective", "target"],
    group: "workflow",
    summary: "manage active goal state machine and prevent goal drift",
    argumentHint: "use <goal instruction>",
  },
  {
    name: "loop",
    aliases: ["ralph", "autoloop"],
    group: "workflow",
    summary: "run autonomous edit-and-verify loops until test pass",
  },
  {
    name: "todo",
    aliases: ["tasks", "checklist"],
    group: "workflow",
    summary: "manage structured task checklist and view progress",
  },
  {
    name: "fast",
    aliases: ["turbo", "speed"],
    group: "workflow",
    summary: "toggle low-latency fast model tier on or off",
  },
  {
    name: "compact",
    aliases: ["handoff"],
    group: "context",
    summary: "condense earlier turns into a checkpoint to free context",
  },
  {
    name: "warmup",
    group: "context",
    summary: "prebuild the startup context cache for this project",
  },
  {
    name: "log",
    aliases: ["logs"],
    group: "workspace",
    summary: "tail, locate, export, or clear the structured session log",
  },
  {
    name: "sidebar",
    group: "workspace",
    summary: "the live panel of session state, tools, and checkpoints",
  },
  {
    name: "browser",
    group: "workspace",
    summary: "inspect the guarded browser capability and its receipts",
  },
  {
    name: "context",
    aliases: ["ctx", "tokens-map"],
    group: "diagnostics",
    summary: "visualize context window allocation and token categories",
  },
  {
    name: "btw",
    aliases: ["side", "ask"],
    group: "session",
    summary: "ask a quick side question out of band without history pollution",
  },
  {
    name: "marketplace",
    aliases: ["marketplaces", "market"],
    group: "workflow",
    summary: "manage and discover plugin marketplace sources",
  },
  {
    name: "plugin",
    aliases: ["plugins"],
    group: "workflow",
    summary: "install, list, enable, or disable plugin capabilities",
  },
  {
    name: "memory",
    aliases: ["mem", "recall", "retain"],
    group: "session",
    summary: "inspect, search, retain, or invalidate persistent memory facts",
  },
  {
    name: "workflow",
    aliases: ["wf", "pipeline", "dag"],
    group: "workflow",
    summary: "inspect, run, or cancel multi-stage agentic workflows and DAG tasks",
  },
  {
    name: "deep-research",
    aliases: ["research", "deep"],
    group: "workflow",
    summary: "conduct multi-agent tree search and cross-source consensus research",
  },
  {
    name: "commit",
    group: "workflow",
    summary: "draft a commit message from the staged diff",
    argumentHint: "use [guidance]",
  },
  {
    name: "tools",
    group: "diagnostics",
    summary: "list available tools or inspect one in detail",
    argumentHint: "use [tool-name]",
  },
  {
    name: "thinking",
    aliases: ["effort"],
    group: "diagnostics",
    summary: "inspect or set reasoning effort for the next turn",
    argumentHint: "use [low|medium|high|off]",
  },
  {
    name: "brainstorm",
    aliases: ["explore", "brainstorming"],
    group: "workflow",
    summary: "multi-perspective design exploration and anti-pattern red-teaming",
  },
  {
    name: "shell",
    aliases: ["sh", "platform"],
    group: "workflow",
    summary: "inspect and control cross-platform shell backends and diagnostics",
  },
] as const satisfies readonly SlashCommandSpec[];

export type SlashCommandName = (typeof SLASH_COMMANDS)[number]["name"];

export function listSlashCommands(): readonly SlashCommandSpec[] {
  return SLASH_COMMANDS;
}

export function getSlashCommand(name: string): SlashCommandSpec | undefined {
  const normalized = name.replace(/^\//, "").trim().toLowerCase();
  return SLASH_COMMANDS.find((command) => {
    const aliases: readonly string[] | undefined =
      "aliases" in command ? command.aliases : undefined;
    return command.name === normalized || aliases?.includes(normalized);
  });
}

export function isKnownSlashCommand(name: string): boolean {
  return getSlashCommand(name) !== undefined;
}

export function renderSessionCommandMap(
  renderer: SlashCommandLineRenderer,
  options?: { compact?: boolean; includeHelpHint?: boolean },
): void {
  const compact = options?.compact === true;
  const includeHelpHint = options?.includeHelpHint !== false;
  renderer.renderLine(
    compact ? "Session command map:" : "\nSession command map",
  );
  renderer.renderLine(
    "- /resume              open the session surface (interactive panel in TTY; overview in print/non-TTY).",
  );
  renderer.renderLine("- /resume current      inspect the active session.");
  renderer.renderLine(
    "- /resume list         inspect recent sessions for this project.",
  );
  renderer.renderLine(
    "- /resume switch <id|prefix|title|last> switch active session and project context.",
  );
  renderer.renderLine(
    "- /resume [id|prefix|title|last] resume the best recoverable context.",
  );
  if (includeHelpHint) {
    renderer.renderLine("- /help                show full command guide.");
  }
}

const GROUP_TITLES: Record<SlashCommandSpec["group"], string> = {
  session: "Session",
  context: "Context",
  workspace: "Workspace",
  workflow: "Workflow",
  diagnostics: "Diagnostics",
};

/**
 * The command guide, generated from the registry.
 *
 * A hand-written guide drifts the moment a command is added or retired — it kept
 * advertising commands the router had already stopped accepting. Generating it
 * means the guide cannot describe a command that does not exist, and cannot omit
 * one that does.
 */
export function renderUserHelp(renderer: SlashCommandLineRenderer): void {
  const width = longestName(SLASH_COMMANDS);
  renderer.renderLine("\nSlash commands");
  for (const group of Object.keys(GROUP_TITLES) as SlashCommandSpec["group"][]) {
    const commands = SLASH_COMMANDS.filter((command) => command.group === group);
    if (commands.length === 0) continue;
    renderer.renderLine(`\n${GROUP_TITLES[group]}`);
    for (const command of commands) {
      renderer.renderLine(`  /${command.name.padEnd(width)}  ${command.summary}`);
    }
  }
  // The keys live in one table that the keymap dispatches on; naming a few of
  // them again here is how a guide ends up advertising a key nothing binds.
  renderer.renderLine("\nKeys");
  renderer.renderLine("  shift+tab   switch between planning and building");
  renderer.renderLine("  alt+p       cycle how much a turn may do without asking");
  renderer.renderLine("  ctrl+j      insert a newline without sending");
  renderer.renderLine("  /hotkey     every key, and which ones this terminal delivers");
  renderer.renderLine("");
}

/** Longest command name, so summaries line up in one column. */
function longestName(commands: readonly SlashCommandSpec[]): number {
  let longest = 0;
  for (const command of commands) longest = Math.max(longest, command.name.length);
  return longest;
}
