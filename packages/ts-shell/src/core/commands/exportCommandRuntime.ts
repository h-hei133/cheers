import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";
import {
  createSessionStoreLayout,
  locateExistingSessionLayout,
} from "../../session/store/sessionFileLayout.js";
import {
  projectTranscriptMessages,
  readTranscriptEvents,
} from "../../session/transcript/sessionTranscript.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";

/**
 * /export — write this session's conversation to a file.
 *
 * It used to write a header and nothing else. The Markdown branch's entire body
 * was the sentence "(Session transcript recorded and preserved in working store)",
 * and the command then reported "Session history successfully exported" — a file
 * that contained no conversation, described as an export of one. Now it reads the
 * transcript the session actually recorded, and an empty transcript is reported as
 * empty rather than written out as a successful export of nothing.
 */

export async function runExportCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const root = context.cwd || process.cwd();
  const sessionId = context.sessionId;
  if (!sessionId) {
    return { kind: "local", output: "No session to export: this command needs a live session." };
  }

  const format = args[0]?.toLowerCase() === "jsonl" ? "jsonl" : "markdown";
  const messages = readConversation(sessionId);
  if (messages.length === 0) {
    return {
      kind: "local",
      output: [
        `Session \`${sessionId}\` has no conversation recorded yet, so there is nothing to export.`,
        "",
        "Nothing was written. Ask something first, or `/resume` a session that has a conversation in it.",
      ].join("\n"),
    };
  }

  const target = resolveTarget(root, args[1], sessionId, format);
  const content = format === "jsonl" ? asJsonl(messages) : asMarkdown(messages, sessionId, root);
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  } catch (error) {
    return {
      kind: "local",
      output: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const shown = path.relative(root, target) || target;
  const counts = tally(messages);
  return {
    kind: "local",
    output: [
      `Exported ${messages.length} messages to \`${shown}\`.`,
      "",
      `- ${counts.user} from you, ${counts.assistant} from the model, ${counts.tool} tool results`,
      `- Format: ${format === "jsonl" ? "JSONL, one message per line" : "Markdown"}`,
    ].join("\n"),
  };
}

/** The conversation this session recorded, in order. */
function readConversation(sessionId: string): readonly SessionMessage[] {
  try {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    return projectTranscriptMessages(readTranscriptEvents(layout.transcriptPath));
  } catch {
    return [];
  }
}

/** Where to write, defaulting to a name that says which session it came from. */
function resolveTarget(root: string, requested: string | undefined, sessionId: string, format: string): string {
  if (requested) return path.resolve(root, requested);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return path.resolve(root, `${sessionId}-${stamp}.${format === "jsonl" ? "jsonl" : "md"}`);
}

/**
 * The conversation as Markdown.
 *
 * Tool results are included but folded into a details block: they are part of what
 * happened, and they are usually longer than everything around them.
 */
function asMarkdown(messages: readonly SessionMessage[], sessionId: string, root: string): string {
  const lines = [
    `# Conversation — ${sessionId}`,
    "",
    `- Exported ${new Date().toISOString()}`,
    `- Workspace \`${root}\``,
    "",
  ];
  for (const message of messages) {
    if (message.role === "tool") {
      lines.push("<details><summary>Tool result</summary>", "", "```text", message.content.trim(), "```", "", "</details>", "");
      continue;
    }
    lines.push(`## ${heading(message.role)}${message.timestamp ? ` · ${message.timestamp}` : ""}`, "", message.content.trim(), "");
    for (const call of message.tool_calls ?? []) {
      lines.push(`> called \`${call.function.name}\` with \`${call.function.arguments}\``, "");
    }
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

/** One JSON object per line, which is what a downstream tool can read back. */
function asJsonl(messages: readonly SessionMessage[]): string {
  return `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
}

function heading(role: SessionMessage["role"]): string {
  if (role === "user") return "You";
  if (role === "assistant") return "Model";
  return role === "system" ? "System" : "Tool";
}

/** How many of each kind, so the report is checkable against the file. */
function tally(messages: readonly SessionMessage[]): {
  readonly user: number;
  readonly assistant: number;
  readonly tool: number;
} {
  let user = 0;
  let assistant = 0;
  let tool = 0;
  for (const message of messages) {
    if (message.role === "user") user++;
    else if (message.role === "assistant") assistant++;
    else if (message.role === "tool") tool++;
  }
  return { user, assistant, tool };
}
