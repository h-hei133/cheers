import * as net from "node:net";
import type { MessagingFrame } from "./types.js";

/**
 * SessionSocketClient
 * Transmits JSON-L framed messages and zero-polling idle notification subscriptions over local UDS / Named Pipes.
 */
export class SessionSocketClient {
  public static async sendMessage(
    targetSocketPath: string,
    message: {
      id?: string;
      sender: string;
      senderId: string;
      content: string;
      replySocket?: string;
    },
    timeoutMs: number = 10_000,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const socket = net.createConnection(targetSocketPath);

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve({ success: false, error: `Socket send timed out after ${timeoutMs}ms` });
        }
      }, timeoutMs);

      socket.on("connect", () => {
        const frame: MessagingFrame = {
          type: "message",
          id: message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          sender: message.sender,
          senderId: message.senderId,
          content: message.content,
          replySocket: message.replySocket,
          timestamp: Date.now(),
        };
        socket.write(JSON.stringify(frame) + "\n");
      });

      socket.on("data", (data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.end();
        try {
          const resp = JSON.parse(data.toString("utf8")) as { status?: string };
          resolve({ success: resp.status === "delivered" });
        } catch {
          resolve({ success: true });
        }
      });

      socket.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ success: false, error: err.message });
      });
    });
  }

  public static async subscribeIdle(
    targetSocketPath: string,
    subscriber: {
      subscriptionId?: string;
      returnSocket: string;
      subscriberSessionId: string;
    },
    timeoutMs: number = 5_000,
  ): Promise<{ success: boolean; subscriptionId: string; error?: string }> {
    const subId = subscriber.subscriptionId || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve) => {
      let settled = false;
      const socket = net.createConnection(targetSocketPath);

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve({ success: false, subscriptionId: subId, error: `Idle subscription timed out after ${timeoutMs}ms` });
        }
      }, timeoutMs);

      socket.on("connect", () => {
        const frame: MessagingFrame = {
          type: "subscribe_idle",
          subscriptionId: subId,
          returnSocket: subscriber.returnSocket,
          subscriberSessionId: subscriber.subscriberSessionId,
        };
        socket.write(JSON.stringify(frame) + "\n");
      });

      socket.on("data", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.end();
        resolve({ success: true, subscriptionId: subId });
      });

      socket.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ success: false, subscriptionId: subId, error: err.message });
      });
    });
  }
}
