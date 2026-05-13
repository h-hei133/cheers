import path from "node:path";

export interface CliInteractiveLoopStateInput {
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly agentMode: "plan" | "build";
}

export interface CliInteractiveLoopState {
  readonly projectLabel: string;
  readonly sessionShortLabel: string;
  readonly agentMode: "plan" | "build";
  readonly prompt: string;
  readonly contextTag: string;
}

export function projectInteractiveLoopState(
  input: CliInteractiveLoopStateInput,
): CliInteractiveLoopState {
  const projectLabel = toProjectLabel(input.projectRoot);
  const sessionShortLabel = toSessionShortLabel(input.sessionId);
  return {
    projectLabel,
    sessionShortLabel,
    agentMode: input.agentMode,
    prompt: `[${projectLabel}|${sessionShortLabel}|${input.agentMode}] > `,
    contextTag: `[${projectLabel}|${sessionShortLabel}]`,
  };
}

export function buildPersistentShellPrompt(
  input: CliInteractiveLoopStateInput,
): string {
  return projectInteractiveLoopState(input).prompt;
}

export function formatCliContextTag(
  input: Omit<CliInteractiveLoopStateInput, "agentMode">,
): string {
  return `[${toProjectLabel(input.projectRoot)}|${toSessionShortLabel(
    input.sessionId,
  )}]`;
}

function toProjectLabel(projectRoot: string): string {
  return path.basename(projectRoot) || projectRoot;
}

function toSessionShortLabel(sessionId: string): string {
  const normalized = sessionId.startsWith("sess_")
    ? sessionId.slice("sess_".length)
    : sessionId;
  return normalized.slice(0, 8);
}
