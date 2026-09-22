/**
 * Reading declared hooks out of a configuration file.
 *
 * Declarative on purpose. A hook is a command with an event and a matcher, which
 * is data: it can be listed, shown and reasoned about without running anything. A
 * configuration that is a code module cannot be inspected without executing it,
 * so it cannot be reviewed before it is trusted, and the review is the whole
 * point of the gate.
 *
 * Reading is deliberately separate from trusting. This module says what a
 * configuration asks for; `hooks/trust.ts` decides whether any of it may run. A
 * reader that also decided would have to be trusted before it could report what
 * it wanted trusted.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookEventName } from "./types.js";

/**
 * The events a configuration may name.
 *
 * Checked rather than passed through, because an unrecognised event would be
 * registered and then never dispatched — a hook that silently never runs is
 * worse than one that is refused, since nothing reports the difference.
 */
const HOOK_EVENTS: readonly HookEventName[] = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "PreModelSwitch",
  "PostModelSwitch",
  "PreCompact",
  "PostCompact",
  "SubagentStart",
  "SubagentStop",
  "WorktreeCreate",
  "WorktreeRemove",
  "Stop",
  "StopFailure",
];

/** One hook a configuration declared, resolved to the fields that matter. */
export interface HookDeclaration {
  readonly event: HookEventName;
  readonly matcher?: string;
  readonly command: string;
  /** The file it came from, so a prompt can name what it is asking about. */
  readonly sourcePath: string;
}

export interface HookConfigLoadResult {
  readonly hooks: readonly HookDeclaration[];
  /** Files that could not be read, and declarations that made no sense. */
  readonly problems: readonly string[];
}

export interface HookConfigLoadOptions {
  readonly homeDir?: string;
}

/**
 * Every hook declared for this workspace, project and user together.
 *
 * Both scopes are read because both can legitimately declare hooks; the caller
 * gates them separately, since only the project's are written by whoever wrote
 * the repository.
 */
export function loadHookDeclarations(
  workspaceRoot: string,
  options?: HookConfigLoadOptions,
): HookConfigLoadResult {
  const homeDir =
    options?.homeDir ?? process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();

  const hooks: HookDeclaration[] = [];
  const problems: string[] = [];

  for (const configPath of [
    path.join(homeDir, ".private-agents", "hooks.json"),
    path.join(workspaceRoot, ".agents", "hooks.json"),
  ]) {
    const result = readOne(configPath);
    hooks.push(...result.hooks);
    problems.push(...result.problems);
  }

  return { hooks, problems };
}

/** The hooks in one file, or the reason it could not be used. */
function readOne(configPath: string): HookConfigLoadResult {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    // Absent is the ordinary case, not a problem worth reporting.
    return { hooks: [], problems: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Reported rather than thrown: one malformed file among several should cost
    // its own hooks, not the run.
    return {
      hooks: [],
      problems: [
        `${configPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  if (typeof parsed !== "object" || parsed === null || !("hooks" in parsed)) {
    return { hooks: [], problems: [] };
  }
  const declared = parsed.hooks;
  if (typeof declared !== "object" || declared === null) {
    return { hooks: [], problems: [] };
  }

  const hooks: HookDeclaration[] = [];
  const problems: string[] = [];

  for (const [eventName, groups] of Object.entries(declared)) {
    if (!isHookEvent(eventName)) {
      problems.push(`${configPath} declares unknown hook event '${eventName}'`);
      continue;
    }
    if (!Array.isArray(groups)) continue;

    for (const group of groups) {
      const matcher =
        typeof group === "object" && group !== null && "matcher" in group
          && typeof group.matcher === "string"
          ? group.matcher
          : undefined;
      const commands = readCommands(group);
      if (commands.length === 0) {
        problems.push(`${configPath} declares a '${eventName}' handler with no command`);
        continue;
      }
      for (const command of commands) {
        hooks.push({ event: eventName, matcher, command, sourcePath: configPath });
      }
    }
  }

  return { hooks, problems };
}

/**
 * The command of every handler in a group.
 *
 * The nested shape (`hooks` inside a group) is kept because it is what the
 * established configuration files use, and a shape people already have is worth
 * matching even when a flatter one would do.
 */
function readCommands(group: unknown): string[] {
  if (typeof group !== "object" || group === null || !("hooks" in group)) return [];
  const handlers = group.hooks;
  if (!Array.isArray(handlers)) return [];

  const commands: string[] = [];
  for (const handler of handlers) {
    if (typeof handler !== "object" || handler === null || !("command" in handler)) continue;
    const command = handler.command;
    if (typeof command === "string" && command.trim() !== "") commands.push(command);
  }
  return commands;
}

/** A type guard, so an unknown key narrows to the union the dispatcher accepts. */
function isHookEvent(value: string): value is HookEventName {
  return (HOOK_EVENTS as readonly string[]).includes(value);
}
