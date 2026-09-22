import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SessionSocketHost } from "./sessionSocketHost.js";
import { SessionSocketClient } from "./sessionSocketClient.js";
import { TeamConfigManager, TaskStore } from "../workflow/teamStore.js";
import { createListAgentsToolDefinition, createSendMessageToolDefinition } from "../tools/messagingTools.js";

describe("SOTA Cross-Session Messaging & Agent Teams Test Suite", () => {
  let host: SessionSocketHost;
  const sessionId = "test_mesh_session_123";

  beforeEach(async () => {
    host = new SessionSocketHost(sessionId);
    await host.start();
  });

  afterEach(() => {
    host.stop();
  });

  describe("SessionSocketHost & Client IPC Transport", () => {
    it("delivers peer messages over local UDS socket with delivery receipt", async () => {
      const socketPath = host.getSocketPath();
      const sendResult = await SessionSocketClient.sendMessage(socketPath, {
        sender: "peer-agent",
        senderId: "peer_sess_999",
        content: "Schema migration finished; rebasing on main is safe now.",
      });

      expect(sendResult.success).toBe(true);

      const received = host.drainMessages();
      expect(received.length).toBe(1);
      expect(received[0].type).toBe("message");
      if (received[0].type === "message") {
        expect(received[0].sender).toBe("peer-agent");
        expect(received[0].content).toContain("Schema migration finished");
      }
    });

    it("registers notify_when_idle zero-polling subscriptions and notifies on idle", async () => {
      const subscriberHost = new SessionSocketHost("subscriber_session_456");
      await subscriberHost.start();

      try {
        const subResult = await SessionSocketClient.subscribeIdle(host.getSocketPath(), {
          returnSocket: subscriberHost.getSocketPath(),
          subscriberSessionId: "subscriber_session_456",
        });

        expect(subResult.success).toBe(true);
        // Host transitions to idle and notifies subscribers
        await host.notifyIdle("Turn completed successfully");

        const receivedNotices = subscriberHost.drainMessages();
        expect(receivedNotices.length).toBe(1);
        expect(receivedNotices[0].type).toBe("idle_notice");
        if (receivedNotices[0].type === "idle_notice") {
          expect(receivedNotices[0].targetSessionId).toBe(sessionId);
          expect(receivedNotices[0].statusSummary).toBe("Turn completed successfully");
        }
      } finally {
        subscriberHost.stop();
      }
    });
  });

  describe("AgentRegistryScanner & Tools", () => {
    it("scans and lists active local socket sessions and subagents via ListAgents", async () => {
      const tool = createListAgentsToolDefinition();
      const result = await tool.execute({}, { taskId: "task_1", workspaceRoot: process.cwd() });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Reachable Peer Agents & Sessions");
      expect(result.output).toContain("Explore");
      expect(result.output).toContain("code-reviewer");
    });

    it("delivers messages via SendMessage tool", async () => {
      const sendTool = createSendMessageToolDefinition();
      const result = await sendTool.execute(
        {
          to: "Explore",
          message: "Please inspect src/core for potential memory leaks.",
        },
        { taskId: "task_2", workspaceRoot: process.cwd() },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Message delivered to subagent @Explore");
    });
  });

  describe("Agent Teams & Mailbox Mesh", () => {
    it("manages team configuration and delivers mailbox messages", () => {
      const teamMgr = new TeamConfigManager(sessionId);
      const config = teamMgr.initializeTeam("lead-agent");

      expect(config.leadAgentId).toBe("lead-agent");
      expect(config.members.length).toBe(1);

      const posted = teamMgr.postToMailbox({
        id: "msg_1",
        from: "architect",
        to: "lead",
        type: "text",
        payload: { text: "Architecture proposal approved" },
        timestamp: Date.now(),
      });

      expect(posted).toBe(true);

      const messages = teamMgr.readAndDrainMailbox("lead");
      expect(messages.length).toBe(1);
      expect(messages[0].from).toBe("architect");
      expect(messages[0].payload.text).toBe("Architecture proposal approved");
    });

    it("claims tasks atomically and unblocks dependent tasks", () => {
      const teamId = `session-${sessionId.slice(0, 8)}`;
      const taskStore = new TaskStore(teamId);

      const task1 = taskStore.createTask({
        id: "t1",
        title: "Define DB schema",
      });

      const task2 = taskStore.createTask({
        id: "t2",
        title: "Implement API endpoints",
        dependencies: ["t1"],
      });

      expect(task1.status).toBe("pending");
      expect(task2.status).toBe("pending");

      // Claim first task
      const claimed1 = taskStore.claimNextAvailableTask("worker-1");
      expect(claimed1?.id).toBe("t1");
      expect(claimed1?.claimedBy).toBe("worker-1");
      expect(claimed1?.status).toBe("in_progress");

      // Attempt to claim while t1 is not completed -> cannot claim t2
      const claimedBeforeUnblock = taskStore.claimNextAvailableTask("worker-2");
      expect(claimedBeforeUnblock).toBeNull();

      // Complete t1
      claimed1!.status = "completed";
      const t1Path = path.join(os.homedir(), ".private-agents", "tasks", teamId, "t1.json");
      fs.writeFileSync(t1Path, JSON.stringify(claimed1, null, 2), "utf8");

      // Now t2 is unblocked and can be claimed
      const claimed2 = taskStore.claimNextAvailableTask("worker-2");
      expect(claimed2?.id).toBe("t2");
      expect(claimed2?.claimedBy).toBe("worker-2");
      expect(claimed2?.status).toBe("in_progress");
    });
  });
});
