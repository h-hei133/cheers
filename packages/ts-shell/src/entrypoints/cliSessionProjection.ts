import type { Session } from "../session/SessionManager.js";

export interface CliSessionSwitchInput {
  readonly previousSessionId: string;
  readonly nextSessionId: string;
  readonly projectRoot: string;
  readonly printMode: boolean;
}

export function formatSessionSwitchUsage(input: {
  readonly printMode: boolean;
}): string {
  return input.printMode
    ? "Usage: /resume switch <id|prefix|title|last>"
    : "\nUsage: /resume switch <id|prefix|title|last>\n";
}

export function formatSessionSwitchSuccessLines(
  input: CliSessionSwitchInput,
): readonly string[] {
  return input.printMode
    ? [
        `Switched session: ${input.previousSessionId} -> ${input.nextSessionId}`,
        `Project context: ${input.projectRoot}`,
      ]
    : [
        `\nSwitched session: ${input.previousSessionId} -> ${input.nextSessionId}\n`,
        `Project context: ${input.projectRoot}`,
      ];
}

export function formatSessionPanelSwitchSuccessLines(input: {
  readonly nextSessionId: string;
  readonly projectRoot: string;
}): readonly string[] {
  return [
    `\nSwitched to session ${input.nextSessionId}.\n`,
    `Project context: ${input.projectRoot}`,
  ];
}

export function formatSessionSwitchFailureLine(input: {
  readonly message: string;
  readonly printMode: boolean;
}): string {
  return input.printMode
    ? `Failed to switch session: ${input.message}`
    : `\nFailed to switch session: ${input.message}\n`;
}

export function formatSessionSwitchNotFoundLine(input: {
  readonly reference: string;
  readonly printMode: boolean;
}): string {
  const line = `Switch target '${input.reference}' was not found.\nHint: run /resume list, then /resume switch <id|prefix|title|last>.`;
  return input.printMode ? line : `\n${line}\n`;
}

export function formatSessionSwitchAmbiguousLine(input: {
  readonly reference: string;
  readonly candidates: readonly (Pick<Session, 'id' | 'title'> & Partial<Pick<Session, 'status'>>)[];
  readonly printMode: boolean;
}): string {
  const lines: string[] = [`Switch target '${input.reference}' is ambiguous.`];
  for (const candidate of input.candidates.slice(0, 3)) {
    const title = candidate.title?.trim() || "(untitled)";
    lines.push(`- ${candidate.id} [${candidate.status ?? 'unknown'}] ${title}`);
  }
  lines.push(
    "Hint: use a longer session id prefix or exact session id from /resume list.",
  );
  return input.printMode ? lines.join("\n") : `\n${lines.join("\n")}\n`;
}
