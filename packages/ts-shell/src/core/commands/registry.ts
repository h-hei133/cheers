import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { runBrowserLocalCommand } from "./browserCommandRuntime.js";
import { runCompactLocalCommand } from "./compactCommandRuntime.js";
import { runConnectCommand } from "./connectCommandRuntime.js";
import { runModelCommand } from "./modelCommandRuntime.js";
import { runRestoreLocalCommand } from "./restoreCommandRuntime.js";
import { runSidebarLocalCommand } from "./sidebarCommandRuntime.js";
import { runWarmupLocalCommand } from "./warmupCommandRuntime.js";
import { runExitCommand } from "./exitCommandRuntime.js";
import { runClearCommand } from "./clearCommandRuntime.js";
import { runReviewCommand } from "./reviewCommandRuntime.js";
import { runInitCommand } from "./initCommandRuntime.js";
import { runCostCommand } from "./costCommandRuntime.js";
import { runUndoCommand } from "./undoCommandRuntime.js";
import { runExportCommand } from "./exportCommandRuntime.js";
import { runCopyCommand } from "./copyCommandRuntime.js";
import { runGoalCommand } from "./goalCommandRuntime.js";
import { runLoopCommand } from "./loopCommandRuntime.js";
import { runTodoCommand } from "./todoCommandRuntime.js";
import { runFastCommand } from "./fastCommandRuntime.js";
import { runContextCommand } from "./contextCommandRuntime.js";
import { runBtwCommand } from "./btwCommandRuntime.js";
import { runMarketplaceCommand } from "./marketplaceCommandRuntime.js";
import { runPluginCommand } from "./pluginCommandRuntime.js";
import { runMemoryCommand } from "./memoryCommandRuntime.js";
import { runWorkflowCommand } from "./workflowCommandRuntime.js";
import { runDeepResearchCommand } from "./deepResearchCommandRuntime.js";
import { runBrainstormCommand } from "./brainstormCommandRuntime.js";
import {
  runDiagnoseCommand,
  runDoctorCommand,
  runWorkflowStatusCommand,
} from "./localCommandRuntime.js";
import {
  runContinuePromptCommand,
  runResumePromptCommand,
} from "./promptCommandRuntime.js";
import {
  runAgentModeShellAction,
  runCancelShellAction,
  runCdShellAction,
  runHelpShellAction,
  runMcpShellAction,
  runPermissionsShellAction,
  runPwdShellAction,
  runSessionsShellAction,
  runViewShellAction,
  runWorkspaceShellAction,
} from "./shellActionRuntime.js";
import type { CommandDefinition } from "./types.js";

export function createCommandRegistry(
  cwd: string = process.cwd(),
): ReadonlyMap<string, CommandDefinition> {
  const runtimeConfig = getRuntimeConfig(cwd);
  const commands: CommandDefinition[] = [
    {
      name: "doctor",
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (_args, context) => runDoctorCommand(context),
    },
    {
      name: "workflow-status",
      aliases: ["status"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (_args, context) => runWorkflowStatusCommand(context),
    },
    {
      name: "diagnose",
      aliases: ["repo", "changes"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (_args, context) => runDiagnoseCommand(context),
    },
    {
      name: "compact",
      aliases: ["handoff"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runCompactLocalCommand(args, context),
    },
    {
      name: "warmup",
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runWarmupLocalCommand(args, context),
    },
    {
      name: "browser",
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runBrowserLocalCommand(args, context),
    },
    {
      name: "sidebar",
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runSidebarLocalCommand(args, context),
    },
    {
      name: "connect",
      aliases: ["providers"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runConnectCommand(args, context),
    },
    {
      name: "model",
      aliases: ["models"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runModelCommand(args, context),
    },
    {
      name: "restore",
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runRestoreLocalCommand(args, context),
    },
    {
      name: "resume",
      kind: "prompt",
      availability: "available",
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runResumePromptCommand(args, context),
    },
    {
      name: "continue",
      aliases: ["c"],
      kind: "prompt",
      availability: "available",
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runContinuePromptCommand(args, context),
    },
    {
      name: "cancel",
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runCancelShellAction(args, context),
    },
    {
      name: "sessions",
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: false,
      execute: (args, context) => runSessionsShellAction(args, context),
    },
    {
      name: "workspace",
      aliases: ["where", "project"],
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runWorkspaceShellAction(args, context),
    },
    {
      name: "cd",
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runCdShellAction(args, context),
    },
    {
      name: "pwd",
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runPwdShellAction(args, context),
    },
    {
      name: "mcp",
      kind: "shell-action",
      availability: runtimeConfig.enableMcpTools ? "available" : "hidden",
      enabled: runtimeConfig.enableMcpTools,
      bridgeSafe: true,
      execute: (args, context) => runMcpShellAction(args, context),
    },
    {
      name: "help",
      aliases: ["?"],
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runHelpShellAction(args, context),
    },
    {
      name: "view",
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runViewShellAction(args, context),
    },
    {
      name: "build",
      aliases: ["mode-build"],
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (_args, context) => runAgentModeShellAction(["build"], context),
    },
    {
      name: "plan",
      aliases: ["mode-plan"],
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (_args, context) => runAgentModeShellAction(["plan"], context),
    },
    {
      name: "mode",
      aliases: ["agent-mode"],
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runAgentModeShellAction(args, context),
    },
    {
      name: "exit",
      aliases: ["quit", "q"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: async (_args, context) => runExitCommand(context),
    },
    {
      name: "permissions",
      aliases: ["approval-policy"],
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runPermissionsShellAction(args, context),
    },
    {
      name: "clear",
      aliases: ["reset", "cls"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runClearCommand(args, context),
    },
    {
      name: "review",
      aliases: ["audit", "check"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runReviewCommand(args, context),
    },
    {
      name: "init",
      aliases: ["setup"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runInitCommand(args, context),
    },
    {
      name: "cost",
      aliases: ["tokens", "stats"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runCostCommand(args, context),
    },
    {
      name: "undo",
      aliases: ["rewind", "revert"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runUndoCommand(args, context),
    },
    {
      name: "export",
      aliases: ["save"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runExportCommand(args, context),
    },
    {
      name: "copy",
      aliases: ["cp"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runCopyCommand(args, context),
    },
    {
      name: "goal",
      aliases: ["objective", "target"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runGoalCommand(args, context),
    },
    {
      name: "loop",
      aliases: ["ralph", "autoloop"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runLoopCommand(args, context),
    },
    {
      name: "todo",
      aliases: ["tasks", "checklist"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runTodoCommand(args, context),
    },
    {
      name: "fast",
      aliases: ["turbo", "speed"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runFastCommand(args, context),
    },
    {
      name: "context",
      aliases: ["ctx", "tokens-map"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runContextCommand(args, context),
    },
    {
      name: "btw",
      aliases: ["side", "ask"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runBtwCommand(args, context),
    },
    {
      name: "marketplace",
      aliases: ["marketplaces", "market"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runMarketplaceCommand(args, context),
    },
    {
      name: "plugin",
      aliases: ["plugins"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runPluginCommand(args, context),
    },
    {
      name: "memory",
      aliases: ["mem", "recall", "retain"],
      kind: "local",
      availability: "available",
      enabled: true,
      execute: (args, context) => runMemoryCommand(args, context),
    },
    {
      name: "workflow",
      aliases: ["wf", "pipeline", "dag"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runWorkflowCommand(args, context),
    },
    {
      name: "deep-research",
      aliases: ["research", "deep"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runDeepResearchCommand(args, context),
    },
    {
      name: "brainstorm",
      aliases: ["explore", "brainstorming"],
      kind: "local",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runBrainstormCommand(args, context),
    },
  ];

  return new Map(commands.map((command) => [command.name, command]));
}

export function listVisibleCommands(
  cwd: string = process.cwd(),
): CommandDefinition[] {
  return Array.from(createCommandRegistry(cwd).values()).filter(
    (command) => command.availability !== "hidden" && command.enabled !== false,
  );
}
