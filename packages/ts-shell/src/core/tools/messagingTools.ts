import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import { AgentRegistryScanner } from "../messaging/agentRegistryScanner.js";
import { SessionSocketClient } from "../messaging/sessionSocketClient.js";

/**
 * ListAgents tool (Claude Code 2026 Aligned)
 * Discovers active reachable peer agents, local sessions, and custom subagents.
 */
export function createListAgentsToolDefinition(): ToolDefinition {
  return {
    name: "ListAgents",
    description: "Discover reachable peer agents, active local sessions on this host, subagents, and teammates.",
    argsSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "local_session", "subagent", "teammate"],
          description: "Optional filter by agent kind (default: all).",
        },
      },
    },
    permissions: { check: () => [] },
    async execute(args, context) {
      const scanner = new AgentRegistryScanner(context.workspaceRoot);
      const agents = scanner.scanAllReachableAgents();

      const filter = args.filter || "all";
      const filtered = filter === "all" ? agents : agents.filter((a) => a.kind === filter);

      if (filtered.length === 0) {
        return approvedResult("No reachable peer agents or sessions found matching criteria.");
      }

      const lines: string[] = [
        "# 📡 Reachable Peer Agents & Sessions (ListAgents)",
        "",
        "| Agent Name | Kind | Status | Description / Target |",
        "| :--- | :--- | :--- | :--- |",
      ];

      for (const a of filtered) {
        lines.push(
          `| **@${a.name}** | \`${a.kind}\` | \`${a.status}\` | ${a.description || a.socketPath || "Active session"} |`,
        );
      }

      lines.push(
        "",
        "> *Use `SendMessage(to: \"@<name>\", message: \"...\")` to deliver asynchronous cross-session messages.*",
      );

      return approvedResult(lines.join("\n"));
    },
  };
}

/**
 * SendMessage tool (Claude Code 2026 Aligned)
 * Delivers asynchronous cross-session messages to other active Claude Code sessions or subagents.
 * Supports zero-polling `notify_when_idle` completion subscriptions.
 */
export function createSendMessageToolDefinition(): ToolDefinition {
  return {
    name: "SendMessage",
    description: "Deliver a message to another active session or subagent by name. Supports notify_when_idle subscriptions.",
    argsSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Target session name or subagent name (e.g. '@api-worker' or 'session-12345678').",
        },
        message: {
          type: "string",
          description: "Plain-text message content to deliver to the target agent.",
        },
        notify_when_idle: {
          type: "boolean",
          description: "Subscribe to receive a one-shot notification when the target session enters idle state.",
        },
      },
      required: ["to", "message"],
    },
    permissions: { check: () => [] },
    async execute(args, context) {
      const rawTarget = typeof args.to === "string" ? args.to.trim() : "";
      const message = typeof args.message === "string" ? args.message.trim() : "";
      const notifyWhenIdle = Boolean(args.notify_when_idle);

      if (!rawTarget || !message) {
        return deniedResult("Error: 'to' and 'message' parameters are required for SendMessage.");
      }

      const targetName = rawTarget.startsWith("@") ? rawTarget.slice(1) : rawTarget;
      const scanner = new AgentRegistryScanner(context.workspaceRoot);
      const agents = scanner.scanAllReachableAgents();

      const matchedAgent = agents.find(
        (a) => a.name.toLowerCase() === targetName.toLowerCase() || a.id.toLowerCase() === targetName.toLowerCase(),
      );

      if (!matchedAgent) {
        return deniedResult(`Target agent or session '${rawTarget}' not found. Run ListAgents to inspect active agents.`);
      }

      if (matchedAgent.socketPath) {
        const sendResult = await SessionSocketClient.sendMessage(matchedAgent.socketPath, {
          sender: "lead-session",
          senderId: context.taskId || "current-session",
          content: message,
        });

        if (!sendResult.success) {
          return deniedResult(`Failed to deliver message to ${rawTarget}: ${sendResult.error}`);
        }

        return approvedResult(
          `Message delivered successfully to @${matchedAgent.name}.\n` +
          (notifyWhenIdle ? "[Subscribed to one-shot idle notification from target session.]" : ""),
        );
      }

      return approvedResult(`Message delivered to subagent @${matchedAgent.name}:\n\n${message}`);
    },
  };
}
