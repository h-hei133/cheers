export interface SlashCommandLineRenderer {
  renderLine(line: string): void;
}

export interface SlashCommandSpec {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly group:
    | "session"
    | "workspace"
    | "workflow"
    | "diagnostics";
  readonly summary: string;
}

export const SLASH_COMMANDS = [
  {
    name: "sessions",
    group: "session",
    summary: "inspect active and recent sessions",
  },
  {
    name: "resume",
    group: "session",
    summary: "continue best recoverable context",
  },
  {
    name: "continue",
    aliases: ["c"],
    group: "session",
    summary: "resume context and optionally run an immediate follow-up",
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
    name: "build",
    aliases: ["mode-build"],
    group: "workflow",
    summary: "switch to build mode",
  },
  {
    name: "plan",
    aliases: ["mode-plan"],
    group: "workflow",
    summary: "switch to plan mode",
  },
  {
    name: "mode",
    aliases: ["agent-mode"],
    group: "workflow",
    summary: "inspect or switch agent mode",
  },
  {
    name: "view",
    group: "workflow",
    summary: "switch output verbosity",
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
    "- /sessions            open the session surface (interactive panel in TTY; overview in print/non-TTY).",
  );
  renderer.renderLine("- /sessions current    inspect the active session.");
  renderer.renderLine(
    "- /sessions list       inspect recent sessions for this project.",
  );
  renderer.renderLine(
    "- /sessions switch <id|prefix|title|last> switch active session and project context.",
  );
  renderer.renderLine(
    "- /resume [id|prefix|title|last] resume the best recoverable context.",
  );
  if (includeHelpHint) {
    renderer.renderLine("- /help                show full command guide.");
  }
}

export function renderUserHelp(renderer: SlashCommandLineRenderer): void {
  renderer.renderLine("\nSlash command guide");
  renderer.renderLine("Next actions (start here):");
  renderer.renderLine(
    "- /sessions               inspect active + recent sessions.",
  );
  renderer.renderLine(
    "- /resume                 continue best recoverable context.",
  );
  renderer.renderLine(
    "- /workspace status       confirm project/workdir binding.",
  );
  renderer.renderLine(
    "- /diagnose               get actionable repo next step.",
  );
  renderer.renderLine("");

  renderer.renderLine("Command groups:");
  renderer.renderLine("1) Session & Continuation");
  renderer.renderLine(
    "- /sessions               session surface entrypoint (TTY: panel, non-TTY/print: overview).",
  );
  renderer.renderLine(
    "- /sessions current       active session identity and resume readiness.",
  );
  renderer.renderLine(
    "- /sessions list          recent sessions for current project context.",
  );
  renderer.renderLine(
    "- /sessions switch <id|prefix|title|last>   switch active session + project context.",
  );
  renderer.renderLine(
    "- /resume [id|prefix|title|last] resume recoverable context by reference.",
  );
  renderer.renderLine(
    "- /continue [id] [text]   resume context and optionally run immediate follow-up.",
  );
  renderer.renderLine(
    "- /restore preview --ledger-root <path> --authority-id <id> --all   preview guarded restore eligibility.",
  );
  renderer.renderLine(
    "- /restore execute --ledger-root <path> --authority-id <id> --all --execute   explicitly restore eligible records.",
  );
  renderer.renderLine("");

  renderer.renderLine("2) Workspace & Navigation");
  renderer.renderLine(
    "- /workspace status       show current project/workdir binding.",
  );
  renderer.renderLine(
    "- /workspace attach <path> attach/switch active project target.",
  );
  renderer.renderLine(
    "- /workspace recent       list recently attached project contexts.",
  );
  renderer.renderLine("- /cd <path>              quick attach by path.");
  renderer.renderLine(
    "- /pwd                    print current workspace status.",
  );
  renderer.renderLine("");

  renderer.renderLine("3) Workflow & Runtime");
  renderer.renderLine("- /cancel                 stop only the current run.");
  renderer.renderLine("- /build                  switch to build mode.");
  renderer.renderLine("- /plan                   switch to plan mode.");
  renderer.renderLine(
    "- /mode [status|plan|build] inspect or switch agent mode.",
  );
  renderer.renderLine("- /view user|developer    switch output verbosity.");
  renderer.renderLine("");

  renderer.renderLine("4) Diagnostics & Integrations");
  renderer.renderLine(
    "- /diagnose               repo-aware diagnosis and next action.",
  );
  renderer.renderLine(
    "- /model status|list|use  inspect and switch active model.",
  );
  renderer.renderLine(
    "- /mcp status|tools|doctor|refresh [server] inspect and recover MCP state.",
  );
  renderer.renderLine(
    "- /permissions list|explain|revoke|reset inspect trust policy state.",
  );
  renderer.renderLine(
    "- /connect status|login|use|logout|set ... provider connection management.",
  );
  renderer.renderLine("");

  renderer.renderLine("Discovery tips:");
  renderer.renderLine(
    "- Unknown slash commands now return this guide path with quick actions.",
  );
  renderer.renderLine(
    "- Use /help any time to get back to grouped command navigation.",
  );
  renderer.renderLine("");
}
