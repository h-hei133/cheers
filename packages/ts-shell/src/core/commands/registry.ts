import { browserSyntax } from "../../browser/command/syntax.js";
import { browserCompletions } from "../../browser/command/completion.js";
import { connectSyntax, connectCompletions } from "./connect/syntax.js";
import { loopSyntax, loopArgumentCompletions } from "./loop/syntax.js";
import { brainstormSyntax } from "./brainstorm/syntax.js";
import { goalCommandAliases, goalSyntax } from "./goal/syntax.js";
import { guidedGoalSyntax, planReviewSyntax, planSyntax, queueSyntax } from './planning/syntax.js';
import { advisorCommandDefinition } from './advisor/registration.js';
import { researchCommandDefinition } from './research/registration.js';
import { gitCommandDefinitions } from './git/registration.js';
import { securityCommandDefinition } from './security/registration.js';
import { agentsCommandDefinition } from './agents/registration.js';
import { collaborationDefinitions } from './collaboration/registration.js';
import { sshCommandDefinition } from './ssh/registration.js';
import { marketplaceSyntax } from "./marketplace/syntax.js";
import { pluginSyntax } from "./plugin/syntax.js";
import { workflowSyntax } from "../workflow/syntax.js";
import { sidebarSyntax } from "../../presentation/sidebar/syntax.js";
import { warmupSyntax } from "../../context/startup/syntax.js";
import { crashSyntax } from "./crash/syntax.js";
import { reportSyntax } from "./report/syntax.js";
import { metricsSyntax } from "./metrics/syntax.js";
import { logSyntax } from "./log/syntax.js";
import { workspaceSyntax, cdSyntax } from "./workspace/syntax.js";
import { mcpSyntax } from "./mcp/syntax.js";
import { permissionsSyntax } from "./permissions/syntax.js";
import { viewSyntax } from "./view/syntax.js";
import { resumeSyntax, forkSyntax, treeSyntax, entriesSyntax, navigationCompletions } from "./navigation/syntax.js";
import { continueSyntax } from "./navigation/continuation.js";
import { shellSyntax } from "./shell/syntax.js";
import { fastSyntax } from "./fast/syntax.js";
import { statuslineSyntax, statuslineCompletions } from "./statusline/syntax.js";
import { settingsSyntax } from "./settings/syntax.js";
import { modelArgumentCompletions } from "./model/completion.js";
import { modelSyntax } from "./model/syntax.js";
import { memorySyntax } from "../../memory/commands/syntax.js";
import { exportSyntax } from "./export/syntax.js";
import { restoreSyntax } from "./restore/syntax.js";
import { syntaxHint, syntaxCompletions } from "./syntax/projection.js";
import { trustSyntax } from "./trust/syntax.js";
import { todoSyntax } from "./todo/syntax.js";
import { thinkingSyntax } from "./thinking/syntax.js";
import { getRuntimeConfig, type RuntimeConfig } from "../../config/runtimeConfig.js";
import { compactCompletions } from "../../context/compact/command/completion.js";
import { compactSyntax } from "../../context/compact/command/syntax.js";
import { runBrowserLocalCommand } from "./browserCommandRuntime.js";
import { runCompactLocalCommand } from "./compactCommandRuntime.js";
import { runConnectCommand } from "./connectCommandRuntime.js";
import { runModelCommand } from "./modelCommandRuntime.js";
import { runRestoreLocalCommand } from "./restoreCommandRuntime.js";
import { runSidebarLocalCommand } from "./sidebarCommandRuntime.js";
import { runWarmupLocalCommand } from "./warmupCommandRuntime.js";
import { runExitCommand } from "./exitCommandRuntime.js";
import { runClearCommand } from "./clearCommandRuntime.js";
import { renameSyntax, deleteSyntax, runSessionManagementCommand } from './navigation/management.js';
import { runReviewCommand, reviewSyntax } from "./reviewCommandRuntime.js";
import { runReloadCommand } from "./reloadCommandRuntime.js";
import { runThemeCommand, themeSyntax } from "./themeCommandRuntime.js";
import { runSettingsCommand } from "./settingsCommandRuntime.js";
import { runStatuslineCommand } from "./statuslineCommandRuntime.js";
import { runTrustCommand } from "./trustCommandRuntime.js";
import { runInitCommand } from "./initCommandRuntime.js";
import { runCostCommand } from "./costCommandRuntime.js";
import { runUndoCommand } from "./undoCommandRuntime.js";
import { undoSyntax } from './undo/syntax.js';
import { runExportCommand } from "./exportCommandRuntime.js";
import { runEntriesCommand } from "./entriesCommandRuntime.js";
import { runTreeCommand } from "./treeCommandRuntime.js";
import { runCopyCommand, copySyntax } from "./copyCommandRuntime.js";
import { runHotkeyCommand } from "./hotkeyCommandRuntime.js";
import { runRetryCommand } from "./retryCommandRuntime.js";
import { runSkillCommand, skillSyntax } from "./skillCommandRuntime.js";
import { runGoalCommand } from "./goalCommandRuntime.js";
import { runLoopCommand } from "./loopCommandRuntime.js";
import { runTodoCommand } from "./todoCommandRuntime.js";
import { runFastCommand } from "./fastCommandRuntime.js";
import { runContextCommand } from "./contextCommandRuntime.js";
import { runBtwCommand, btwSyntax } from "./btwCommandRuntime.js";
import { runMarketplaceCommand } from "./marketplaceCommandRuntime.js";
import { runPluginCommand } from "./pluginCommandRuntime.js";
import { runMemoryCommand, recallSyntax, retainSyntax } from "./memoryCommandRuntime.js";
import { runWorkflowCommand } from "./workflowCommandRuntime.js";
import { runDeepResearchCommand, webResearchSyntax } from "./deepResearchCommandRuntime.js";
import { runBrainstormCommand } from "./brainstormCommandRuntime.js";
import { runCommitCommand, commitSyntax } from "./commitCommandRuntime.js";
import { runThinkingCommand } from "./thinkingCommandRuntime.js";
import { runToolsCommand, toolsSyntax } from "./toolsCommandRuntime.js";
import { runShellCommand } from "./shellCommandRuntime.js";
import { runLogCommand } from "./logCommandRuntime.js";
import { runCrashCommand } from "./crashCommandRuntime.js";
import { runTimingsCommand } from "./timingsCommandRuntime.js";
import { runMetricsCommand } from "./metricsCommandRuntime.js";
import { runReportCommand } from "./reportCommandRuntime.js";
import {
  runDiagnoseCommand,
} from "./localCommandRuntime.js";
import { runContinuePromptCommand } from "./promptCommandRuntime.js";
import { runResumeCommand } from "./resumeCommandRuntime.js";
import {
  runCancelShellAction,
  runCdShellAction,
  runHelpShellAction,
  runMcpShellAction,
  runPermissionsShellAction,
  runPwdShellAction,
  runViewShellAction,
  runWorkspaceShellAction,
} from "./shellActionRuntime.js";
import type { CommandContext, CommandDefinition } from "./types.js";

export function createCommandRegistry(
  cwd: string = process.cwd(),
  runtimeConfig: RuntimeConfig = getRuntimeConfig(cwd),
): ReadonlyMap<string, CommandDefinition> {
  const commands: CommandDefinition[] = [
    advisorCommandDefinition(),
    {
      name: "diagnose",
      aliases: ["repo", "changes"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "repo-aware diagnosis and next action",
      group: "diagnostics",
      execute: (args, context) => runDiagnoseCommand(context, args),
    },
    {
      name: "compact",
      aliases: ["handoff"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "condense earlier turns into a checkpoint to free context",
      group: "context",
      argumentHint: syntaxHint(compactSyntax),
      getArgumentCompletions: (prefix) => compactCompletions(prefix),
      execute: (args, context) => runCompactLocalCommand(args, context),
    },
    {
      name: "warmup",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "prebuild the startup context cache for this project",
      group: "context",
      argumentHint: syntaxHint(warmupSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(warmupSyntax, prefix),
      execute: (args, context) => runWarmupLocalCommand(args, context),
    },
    {
      name: "browser",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect the guarded browser capability and its receipts",
      group: "workspace",
      argumentHint: syntaxHint(browserSyntax),
      getArgumentCompletions: browserCompletions,
      execute: (args, context) => runBrowserLocalCommand(args, context),
    },
    {
      name: "sidebar",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "a snapshot of session state, tools, and checkpoints; run again to refresh",
      group: "workspace",
      argumentHint: syntaxHint(sidebarSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(sidebarSyntax, prefix),
      execute: (args, context) => runSidebarLocalCommand(args, context),
    },
    {
      name: "connect",
      aliases: ["providers"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "provider connection management",
      group: "diagnostics",
      argumentHint: syntaxHint(connectSyntax),
      getArgumentCompletions: connectCompletions,
      execute: (args, context) => runConnectCommand(args, context),
    },
    {
      name: "model",
      aliases: ["models"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect and switch active model",
      group: "diagnostics",
      argumentHint: syntaxHint(modelSyntax),
      getArgumentCompletions: modelArgumentCompletions,
      execute: (args, context) => runModelCommand(args, context),
    },
    {
      name: "restore",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "preview or execute guarded recovery authority restore",
      group: "session",
      argumentHint: syntaxHint(restoreSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(restoreSyntax, prefix),
      execute: (args, context) => runRestoreLocalCommand(args, context),
    },
    {
      name: "tree",
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "navigate the session tree, including other branches",
      group: "session",
      argumentHint: syntaxHint(treeSyntax),
      getArgumentCompletions: (prefix) => navigationCompletions(treeSyntax, prefix),
      execute: (args) => runTreeCommand(args),
    },
    {
      name: "entries",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "read this session's entries, optionally after a cursor",
      group: "session",
      argumentHint: syntaxHint(entriesSyntax),
      getArgumentCompletions: (prefix) => navigationCompletions(entriesSyntax, prefix),
      execute: (args, context) => runEntriesCommand(args, context),
    },
    {
      name: "resume",
      aliases: ["sessions", "session"],
      kind: "prompt",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "pick, inspect, switch, or continue a session",
      group: "session",
      argumentHint: syntaxHint(resumeSyntax),
      getArgumentCompletions: (prefix) => navigationCompletions(resumeSyntax, prefix),
      execute: (args, context) => runResumeCommand(args, context),
    },
    ...(['rename', 'delete'] as const).map(name => {
      const syntax = name === 'rename' ? renameSyntax : deleteSyntax;
      return { name, kind: 'shell-action' as const, supportsNonInteractive: true, availability: 'available' as const,
        enabled: true, summary: syntax.actions[0]!.summary, group: 'session' as const,
        argumentHint: syntaxHint(syntax), getArgumentCompletions: (prefix: string) => syntaxCompletions(syntax, prefix),
        execute: async (args: string[]) => runSessionManagementCommand(name, args) };
    }),
    {
      name: "fork",
      kind: "prompt",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "continue one session's conversation in a second, new session",
      group: "session",
      argumentHint: syntaxHint(forkSyntax),
      getArgumentCompletions: (prefix) => navigationCompletions(forkSyntax, prefix),
      execute: (args, context) => runResumeCommand(["fork", ...args], context),
    },
    {
      name: "continue",
      aliases: ["c"],
      kind: "prompt",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "pick up this session's stopped work, optionally with a follow-up",
      group: "session",
      argumentMode: "raw",
      argumentHint: syntaxHint(continueSyntax),
      execute: (args, context) => runContinuePromptCommand(args, context),
    },
    {
      name: "cancel",
      kind: "shell-action",
      supportsNonInteractive: false,
      nonInteractiveReason: "Cancellation requires an interactive session with a running turn.",
      availability: "available",
      enabled: true,
      summary: "stop only the current run",
      group: "workflow",
      execute: (args, context) => runCancelShellAction(args, context),
    },
    {
      name: "workspace",
      aliases: ["where", "project"],
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect or switch project/workdir binding",
      group: "workspace",
      argumentHint: syntaxHint(workspaceSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(workspaceSyntax, prefix),
      execute: (args, context) => runWorkspaceShellAction(args, context),
    },
    {
      name: "cd",
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "quick attach by path",
      group: "workspace",
      argumentHint: syntaxHint(cdSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(cdSyntax, prefix),
      execute: (args, context) => runCdShellAction(args, context),
    },
    {
      name: "pwd",
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "print current workspace status",
      group: "workspace",
      execute: (args, context) => runPwdShellAction(args, context),
    },
    {
      name: "mcp",
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: runtimeConfig.enableMcpTools ? "available" : "hidden",
      enabled: runtimeConfig.enableMcpTools,
      summary: "inspect and recover MCP state",
      group: "diagnostics",
      argumentHint: syntaxHint(mcpSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(mcpSyntax, prefix),
      execute: (args, context) => runMcpShellAction(args, context),
    },
    {
      name: "help",
      aliases: ["?"],
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "show full command guide",
      group: "diagnostics",
      execute: (args, context) => runHelpShellAction(args, context),
    },
    {
      name: "exit",
      aliases: ["quit", "q"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "gracefully exit session and restore terminal",
      group: "session",
      execute: async (args, context) => runExitCommand(context, args),
    },
    {
      name: "permissions",
      aliases: ["approval-policy"],
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect trust policy state",
      group: "diagnostics",
      argumentHint: syntaxHint(permissionsSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(permissionsSyntax, prefix),
      execute: (args, context) => runPermissionsShellAction(args, context),
    },
    {
      name: "clear",
      aliases: ["reset", "cls", "new"],
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "clear conversation context and start fresh",
      group: "session",
      execute: async (args, context) => runClearCommand(args, context),
    },
    {
      name: "review",
      aliases: ["audit", "check"],
      kind: "prompt",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "review working tree code changes and diffs",
      group: "workflow",
      argumentMode: "raw",
      argumentHint: syntaxHint(reviewSyntax),
      execute: (args, context) => runReviewCommand(args, context),
    },
    {
      name: "reload",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "re-read the configuration this session started with",
      group: "context",
      execute: (args, context) => runReloadCommand(args, context),
    },
    {
      // The bare form opens the picker; this is the form that works without one.
      // Every other picker here is also a real command for that reason; the
      // band's items were the one exception and it is the one users script.
      name: "statusline",
      aliases: ["status"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "choose which facts the status band keeps in view",
      group: "workspace",
      argumentHint: syntaxHint(statuslineSyntax),
      getArgumentCompletions: statuslineCompletions,
      execute: (args, context) => runStatuslineCommand(args, context),
    },
    {
      // The bare form opens the settings panel; the interactive surface keeps
      // the pickers, so the command's own output is the non-interactive story.
      name: "settings",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "open the settings panel, or name what a setting does",
      group: "workspace",
      argumentHint: syntaxHint(settingsSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(settingsSyntax, prefix),
      execute: (args, context) => runSettingsCommand(args, context),
    },
    {
      name: "view",
      kind: "shell-action",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect or switch between user and developer output",
      argumentHint: syntaxHint(viewSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(viewSyntax, prefix),
      group: "workspace",
      execute: (args, context) => runViewShellAction(args, context),
    },
    {
      name: "theme",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "list the available themes, or switch to one",
      argumentHint: syntaxHint(themeSyntax),
      group: "workspace",
      execute: (args, context) => runThemeCommand(args, context),
    },
    {
      name: "trust",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "show or set what this project is allowed to contribute",
      group: "context",
      argumentHint: syntaxHint(trustSyntax),
      getArgumentCompletions: prefix => syntaxCompletions(trustSyntax, prefix),
      execute: (args, context) => runTrustCommand(args, context),
    },
    {
      name: "init",
      aliases: ["setup"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect tech stack and initialize AGENTS.md rules",
      group: "workflow",
      execute: (args, context) => runInitCommand(args, context),
    },
    {
      name: "cost",
      aliases: ["tokens", "stats"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "display session token usage and estimated cost",
      group: "session",
      execute: (args, context) => runCostCommand(args, context),
    },
    {
      name: "undo",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      // Names the files it reports, not the conversation. `rewind` and `revert`
      // used to be aliases here, which sent anyone asking to go back in the
      // conversation to a report about files. Going back is `/back`.
      summary: "preview, confirm or inspect this session’s recorded file undo",
      group: "session",
      argumentHint: syntaxHint(undoSyntax),
      getArgumentCompletions: prefix => syntaxCompletions(undoSyntax, prefix),
      execute: (args, context) => runUndoCommand(args, context),
    },
    {
      name: "export",
      aliases: ["save"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "export session history as markdown or jsonl",
      group: "session",
      argumentHint: syntaxHint(exportSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(exportSyntax, prefix),
      execute: (args, context) => runExportCommand(args, context),
    },
    {
      name: "skill",
      aliases: ["skills"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "the written-down ways of working this project and this user have",
      group: "workspace",
      argumentHint: syntaxHint(skillSyntax),
      execute: (args, context) => runSkillCommand(args, context),
    },
    {
      name: "retry",
      kind: "shell-action",
      supportsNonInteractive: false,
      nonInteractiveReason: "Retry requires the last failed submission from an interactive session.",
      availability: "available",
      enabled: true,
      summary: "run the last turn again after it failed or was interrupted",
      group: "session",
      execute: (args, context) => runRetryCommand(args, context),
    },
    {
      name: "hotkey",
      aliases: ["hotkeys", "keys"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "every key this surface binds, and which ones this terminal delivers",
      group: "workspace",
      execute: (args, context) => runHotkeyCommand(args, context),
    },
    {
      name: "copy",
      aliases: ["cp"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "copy last assistant response to clipboard",
      group: "session",
      argumentMode: "raw",
      argumentHint: syntaxHint(copySyntax),
      execute: (args, context) => runCopyCommand(args, context),
    },
    {
      name: "goal",
      aliases: goalCommandAliases,
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "manage active goal state machine and prevent goal drift",
      group: "workflow",
      argumentHint: syntaxHint(goalSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(goalSyntax, prefix),
      execute: (args, context) => runGoalCommand(args, context),
    },
    ...([planSyntax, planReviewSyntax, guidedGoalSyntax] as const).map(syntax => ({
      name: syntax.name, kind: 'prompt' as const, supportsNonInteractive: true, availability: 'available' as const,
      enabled: true, summary: syntax.actions[0]!.summary, group: 'workflow' as const,
      argumentHint: syntaxHint(syntax), getArgumentCompletions: (prefix: string) => syntaxCompletions(syntax, prefix),
      execute: (args: string[], context: CommandContext) => context.planningCommand
        ? context.planningCommand(syntax.name as 'plan' | 'plan-review' | 'guided-goal', args, context)
        : Promise.resolve({ kind: 'local' as const, output: 'Planning requires a bound session runtime.' }),
    })),
    {
      name: 'queue', kind: 'prompt', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
      summary: 'inspect and manage actual undelivered input', argumentHint: syntaxHint(queueSyntax),
      getArgumentCompletions: prefix => syntaxCompletions(queueSyntax, prefix),
      execute: (args, context) => context.queueCommand ? context.queueCommand(args, context)
        : Promise.resolve({ kind: 'local', output: 'Pending input is unavailable in this host.' }),
    },
    {
      name: "loop",
      aliases: ["ralph", "autoloop"],
      // A failing gate expands into a repair prompt; a passing one answers locally.
      kind: "prompt",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "run autonomous edit-and-verify loops until test pass",
      group: "workflow",
      argumentHint: syntaxHint(loopSyntax),
      argumentMode: "raw",
      getArgumentCompletions: loopArgumentCompletions,
      execute: (args, context) => runLoopCommand(args, context),
    },
    {
      name: "todo",
      aliases: ["tasks", "checklist"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "manage structured task checklist and view progress",
      group: "workflow",
      argumentHint: syntaxHint(todoSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(todoSyntax, prefix),
      // The checklist belongs to a session, so the session travels with the
      // call. Without it the command answers with a freshly allocated list that
      // nobody reads, and reports success while the session's own list is
      // untouched.
      execute: (args, context) => runTodoCommand(args, context, context.sessionId),
    },
    {
      name: "fast",
      aliases: ["turbo", "speed"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect or change the sampling temperature preference",
      group: "workflow",
      argumentHint: syntaxHint(fastSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(fastSyntax, prefix),
      execute: (args, context) => runFastCommand(args, context),
    },
    {
      name: "context",
      aliases: ["ctx", "tokens-map"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "visualize context window allocation and token categories",
      group: "diagnostics",
      execute: (args, context) => runContextCommand(args, context),
    },
    {
      name: "btw",
      aliases: ["side", "ask"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "ask a quick side question out of band without history pollution",
      group: "session",
      argumentMode: "raw",
      argumentHint: syntaxHint(btwSyntax),
      execute: (args, context) => runBtwCommand(args, context),
    },
    {
      name: "marketplace",
      aliases: ["marketplaces", "market"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "manage and discover plugin marketplace sources",
      group: "workflow",
      argumentHint: syntaxHint(marketplaceSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(marketplaceSyntax, prefix),
      execute: (args, context) => context.extensionCommand ? context.extensionCommand('marketplace', args, context) : runMarketplaceCommand(args, context),
    },
    {
      name: "plugin",
      aliases: ["plugins"],
      invocations: [{ name: 'reload-plugins', summary: 'unload and rebuild extension capabilities', argumentHint: '' }],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "install exact signed extensions and manage separate runtime grants",
      group: "workflow",
      argumentHint: syntaxHint(pluginSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(pluginSyntax, prefix),
      execute: (args, context) => runPluginCommand(context.rawCommandName === 'reload-plugins' ? ['reload', ...args] : args, context),
    },
    {
      name: "memory",
      aliases: ["mem"],
      invocations: [
        { name: "recall", summary: "search retained memory facts", argumentHint: syntaxHint(recallSyntax), argumentMode: "raw" },
        { name: "retain", summary: "retain a memory statement", argumentHint: syntaxHint(retainSyntax), argumentMode: "raw" },
      ],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect, search, retain, or invalidate persistent memory facts",
      group: "session",
      argumentHint: syntaxHint(memorySyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(memorySyntax, prefix),
      execute: (args, context) => runMemoryCommand(args, context),
    },
    {
      name: "workflow",
      aliases: ["wf", "pipeline", "dag"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect, run, or cancel multi-stage agentic workflows and DAG tasks",
      group: "workflow",
      argumentHint: syntaxHint(workflowSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(workflowSyntax, prefix),
      execute: (args, context) => runWorkflowCommand(args, context),
    },
    {
      name: "web-research",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "collect public web source excerpts with fixed search queries",
      group: "workflow",
      argumentMode: "raw",
      argumentHint: syntaxHint(webResearchSyntax),
      execute: (args, context) => runDeepResearchCommand(args, context),
    },
    researchCommandDefinition(),
    ...gitCommandDefinitions(),
    securityCommandDefinition(),
    agentsCommandDefinition(),
    ...collaborationDefinitions(),
    sshCommandDefinition(),
    {
      name: "commit",
      // A staged diff expands into a prompt; an empty index answers locally.
      kind: "prompt",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "draft a commit message from the staged diff",
      group: "workflow",
      argumentMode: "raw",
      argumentHint: syntaxHint(commitSyntax),
      execute: (args, context) => runCommitCommand(args, context),
    },
    {
      name: "tools",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "list available tools or inspect one in detail",
      group: "diagnostics",
      argumentHint: syntaxHint(toolsSyntax),
      execute: (args, context) => runToolsCommand(args, context),
    },
    {
      name: "thinking",
      aliases: ["effort"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect or set reasoning effort for the next turn",
      group: "diagnostics",
      argumentHint: syntaxHint(thinkingSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(thinkingSyntax, prefix),
      execute: (args, context) => runThinkingCommand(args, context),
    },
    {
      name: "brainstorm",
      aliases: ["explore", "brainstorming"],
      // It expands into a prompt: the exploration is the model's work, because
      // trade-offs for a specific problem cannot come from a local template.
      kind: "prompt",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "multi-perspective design exploration and anti-pattern red-teaming",
      group: "workflow",
      argumentHint: syntaxHint(brainstormSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(brainstormSyntax, prefix),
      execute: (args, context) => runBrainstormCommand(args, context),
    },
    {
      name: "shell",
      aliases: ["sh", "platform"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "inspect or switch the shell backend this session runs commands with",
      group: "workspace",
      argumentHint: syntaxHint(shellSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(shellSyntax, prefix),
      execute: (args, context) => runShellCommand(args, context),
    },
    {
      name: "log",
      aliases: ["logs"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "tail, locate, export, or clear the structured session log",
      group: "workspace",
      argumentHint: syntaxHint(logSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(logSyntax, prefix),
      execute: (args, context) => runLogCommand(args, context),
    },
    {
      name: "crash",
      aliases: ["crashes"],
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "list the recent runs that ended by falling over",
      group: "workspace",
      argumentHint: syntaxHint(crashSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(crashSyntax, prefix),
      execute: (args, context) => runCrashCommand(args, context),
    },
    {
      name: "timings",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "how long each phase of startup took, when CHEERS_TIMING=1 was set",
      group: "workspace",
      execute: (args, context) => runTimingsCommand(args, context),
    },
    {
      name: "metrics",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "tool calls, timings, retries and compactions this session recorded",
      group: "workspace",
      argumentHint: syntaxHint(metricsSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(metricsSyntax, prefix),
      execute: (args, context) => runMetricsCommand(args, context),
    },
    {
      name: "report",
      kind: "local",
      supportsNonInteractive: true,
      availability: "available",
      enabled: true,
      summary: "write a scrubbed environment and crash report to attach to a bug report",
      group: "workspace",
      argumentHint: syntaxHint(reportSyntax),
      getArgumentCompletions: (prefix) => syntaxCompletions(reportSyntax, prefix),
      execute: (args, context) => runReportCommand(args, context),
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
