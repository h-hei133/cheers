import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { runConnectCommand } from "./connectCommandRuntime.js";
import { runModelCommand } from "./modelCommandRuntime.js";
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
      name: "permissions",
      aliases: ["approval-policy"],
      kind: "shell-action",
      availability: "available",
      enabled: true,
      bridgeSafe: true,
      execute: (args, context) => runPermissionsShellAction(args, context),
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
