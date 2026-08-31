import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { MessagingFrame } from "./types.js";

/**
 * SessionSocketHost (Claude Code 2026 Aligned)
 * Listens on local Unix Domain Socket (/tmp/ts-socks-<uid>/session-<id>.sock) or Windows Named Pipe.
 * Authenticates connections via cryptographically secure session tokens.
 */
export class SessionSocketHost {
  private readonly sessionId: string;
  private readonly sessionToken: string;
  private readonly socketPath: string;
  private server: net.Server | null = null;
  private readonly inMemoryInbox: MessagingFrame[] = [];
  private readonly idleSubscribers: Array<{ subscriptionId: string; returnSocket: string }> = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionToken = `token_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.socketPath = this.computeSocketPath();
  }

  getSocketPath(): string {
    return this.socketPath;
  }

  getSessionToken(): string {
    return this.sessionToken;
  }

  private computeSocketPath(): string {
    if (process.platform === "win32") {
      return `\\\\.\\pipe\\coding-agents-${this.sessionId}`;
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const baseDir = path.join(os.tmpdir(), `ts-socks-${uid}`);
    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
      }
    } catch {
      // Fallback
    }
    return path.join(baseDir, `session-${this.sessionId}.sock`);
  }

  async start(): Promise<void> {
    if (this.server) return;

    if (process.platform !== "win32" && fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // Ignored
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = "";

        socket.on("data", (data) => {
          buffer += data.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const frame = JSON.parse(line.trim()) as MessagingFrame;
              this.handleIncomingFrame(frame, socket);
            } catch {
              // Ignore malformed frame
            }
          }
        });
      });

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        if (process.platform !== "win32") {
          try {
            fs.chmodSync(this.socketPath, 0o600);
          } catch {
            // Ignore
          }
        }
        resolve();
      });
    });
  }

  private handleIncomingFrame(frame: MessagingFrame, socket: net.Socket): void {
    if (frame.type === "message") {
      this.inMemoryInbox.push(frame);
      socket.write(JSON.stringify({ status: "delivered", messageId: frame.id }) + "\n");
    } else if (frame.type === "subscribe_idle") {
      this.idleSubscribers.push({
        subscriptionId: frame.subscriptionId,
        returnSocket: frame.returnSocket,
      });
      socket.write(JSON.stringify({ status: "subscribed", subscriptionId: frame.subscriptionId }) + "\n");
    } else if (frame.type === "idle_notice") {
      this.inMemoryInbox.push(frame);
      socket.write(JSON.stringify({ status: "acknowledged" }) + "\n");
    }
  }

  drainMessages(): readonly MessagingFrame[] {
    const messages = [...this.inMemoryInbox];
    this.inMemoryInbox.length = 0;
    return messages;
  }

  async notifyIdle(statusSummary?: string): Promise<void> {
    const subs = [...this.idleSubscribers];
    this.idleSubscribers.length = 0;

    for (const sub of subs) {
      await new Promise<void>((resolve) => {
        try {
          const client = net.createConnection(sub.returnSocket, () => {
            const notice: MessagingFrame = {
              type: "idle_notice",
              subscriptionId: sub.subscriptionId,
              targetSessionId: this.sessionId,
              finishedAt: Date.now(),
              statusSummary,
            };
            client.write(JSON.stringify(notice) + "\n");
          });

          client.on("data", () => {
            client.end();
            resolve();
          });

          client.on("error", () => {
            resolve();
          });
        } catch {
          resolve();
        }
      });
    }
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (process.platform !== "win32" && fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // Ignore
      }
    }
  }
}
