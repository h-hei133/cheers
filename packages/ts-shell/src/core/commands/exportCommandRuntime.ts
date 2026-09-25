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
import type { TranscriptEvent } from "../../session/sessionEventCodec.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import { resolveWriteTarget } from "../security/writeTarget.js";

/**
 * /export — write this session's conversation to a file.
 *
 * It used to write a header and nothing else. The Markdown branch's entire body
 * was the sentence "(Session transcript recorded and preserved in working store)",
 * and the command then reported "Session history successfully exported" — a file
 * that contained no conversation, described as an export of one. Now it reads the
 * transcript the session actually recorded, and an empty transcript is reported as
 * empty rather than written out as a successful export of nothing.
 *
 * The two formats read different things, deliberately. Markdown projects the
 * transcript into messages, because that is what a person wants to read. JSONL
 * writes the transcript's own entries, because re-serializing the projection
 * would drop the entry identity — the compaction and branch-summary entries are
 * exactly what the projection exists to fold away, and an export that cannot show
 * them cannot show what happened.
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

  // `--outside` states an intent to write past the workspace. It is read before
  // the format so that `--outside` in the destination's position cannot be
  // mistaken for a filename.
  const allowOutside = args.includes("--outside");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const format = positional[0]?.toLowerCase() === "jsonl" ? "jsonl" : "markdown";
  const events = readTranscript(sessionId);
  const messages = projectTranscriptMessages(events);
  if (events.length === 0) {
    return {
      kind: "local",
      output: [
        `Session \`${sessionId}\` has no conversation recorded yet, so there is nothing to export.`,
        "",
        "Nothing was written. Ask something first, or `/resume` a session that has a conversation in it.",
      ].join("\n"),
    };
  }

  const requested = positional[1];
  // Judged only when the user named a destination. The command's own default
  // cannot be a typo, and running it through a policy meant for a name someone
  // chose would refuse the ordinary case of exporting with no argument.
  let target: string;
  if (requested !== undefined) {
    const decision = resolveWriteTarget({
      requested,
      root,
      ...(allowOutside ? { allowOutside: true } : {}),
    });
    if (!decision.allowed) {
      // Nothing is written and the reason is stated, so a refused export is not
      // indistinguishable from one that silently did nothing.
      return {
        kind: "local",
        output: [
          `Nothing was exported. ${decision.reason}`,
          "",
          decision.doNext,
        ].join("\n"),
      };
    }
    target = decision.resolvedPath;
  } else {
    target = resolveDefaultTarget(root, sessionId, format);
  }

  const content = format === "jsonl" ? asJsonl(events) : asMarkdown(messages, sessionId, root);
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
  if (format === "jsonl") {
    return {
      kind: "local",
      output: [
        `Exported ${events.length} transcript entries to \`${shown}\`.`,
        "",
        "- One entry per line, in the order they were recorded.",
        "- Entries carry their own `type` and `id`, so a reader can tell messages",
        "  apart from compaction and branch-summary entries.",
      ].join("\n"),
    };
  }

  const counts = tally(messages);
  return {
    kind: "local",
    output: [
      `Exported ${messages.length} messages to \`${shown}\`.`,
      "",
      `- ${counts.user} from you, ${counts.assistant} from the model, ${counts.tool} tool results`,
      "- Format: Markdown",
    ].join("\n"),
  };
}

/** The transcript entries this session recorded, in order. */
function readTranscript(sessionId: string): readonly TranscriptEvent[] {
  try {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    return readTranscriptEvents(layout.transcriptPath);
  } catch {
    return [];
  }
}

/**
 * Where an export lands when the user named no destination.
 *
 * Always inside the workspace, and it needs no judgement: a name this command
 * chose cannot be an escape, so it does not go through the policy that exists
 * to judge a name the user chose.
 */
function resolveDefaultTarget(root: string, sessionId: string, format: string): string {
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

/**
 * One transcript entry per line.
 *
 * These are the entries the session recorded, not a projection of them: the
 * projection folds compaction and branch-summary entries into ordinary messages,
 * so exporting it would lose the record of what was compacted and what was
 * stepped back past.
 */
function asJsonl(events: readonly TranscriptEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
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
