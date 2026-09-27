import type { TurnRequest } from "./kinds.js";
import type { ChatMessage } from "../../turn/prompt.js";

/**
 * Gateway metadata a Copilot turn has to carry, whatever protocol serves it.
 *
 * Copilot fronts several model families and the gateway in front of all of
 * them asks the same questions: which editor is talking, whether this turn is
 * user- or agent-initiated, whether it carries images, and that the request is
 * an edit-style conversation. The questions do not depend on the wire shape,
 * so the answers live here — one declaration — and each endpoint that can
 * reach Copilot points at it.
 */

/** The gateway reads the last speaker to tell an agent turn from a user one. */
function initiatorFor(messages: readonly ChatMessage[]): "user" | "agent" {
  const last = messages[messages.length - 1];
  return last && last.role !== "user" ? "agent" : "user";
}

/** Images ride in message content; the gateway wants to know before routing. */
function hasImages(messages: readonly ChatMessage[]): boolean {
  return messages.some(
    (message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image"),
  );
}

/** The headers a Copilot gateway requires, or nothing for anyone else. */
export function copilotRequestHeaders(input: TurnRequest): Record<string, string> {
  if (input.provider !== "github-copilot") return {};
  return {
    "Editor-Version": "vscode/1.107.0",
    "Editor-Plugin-Version": "copilot-chat/0.35.0",
    "Copilot-Integration-Id": "vscode-chat",
    "User-Agent": "GitHubCopilotChat/0.35.0",
    "X-Initiator": initiatorFor(input.messages),
    "Openai-Intent": "conversation-edits",
    ...(hasImages(input.messages) ? { "Copilot-Vision-Request": "true" } : {}),
  };
}
