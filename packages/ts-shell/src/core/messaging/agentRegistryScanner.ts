import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AgentDescriptor } from "./types.js";
import { SubagentLoader } from "../subagents/subagentLoader.js";

/**
 * AgentRegistryScanner (Claude Code 2026 Aligned)
 * Discovers reachable agents across local UDS sockets, custom subagents, and active agent teams.
 */
export class AgentRegistryScanner {
  private readonly workspaceRoot: string;
  private readonly socketDir: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    this.socketDir = path.join(os.tmpdir(), `ts-socks-${uid}`);
  }

  scanAllReachableAgents(): readonly AgentDescriptor[] {
    const agents: AgentDescriptor[] = [];

    // 1. Scan Local UDS Session Sockets (/tmp/ts-socks-<uid>/session-<id>.sock)
    if (fs.existsSync(this.socketDir)) {
      try {
        const entries = fs.readdirSync(this.socketDir);
        for (const entry of entries) {
          if (entry.startsWith("session-") && entry.endsWith(".sock")) {
            const sessionId = entry.slice("session-".length, -".sock".length);
            agents.push({
              id: sessionId,
              name: `session-${sessionId.slice(0, 8)}`,
              kind: "local_session",
              status: "running",
              socketPath: path.join(this.socketDir, entry),
              workspaceRoot: this.workspaceRoot,
              lastActiveAt: Date.now(),
            });
          }
        }
      } catch {
        // Fallback
      }
    }

    // 2. Discover Custom & Built-in Subagents via SubagentLoader
    const subagentLoader = new SubagentLoader(this.workspaceRoot);
    const subagents = subagentLoader.loadAllSubagents();

    for (const [key, sub] of subagents.entries()) {
      agents.push({
        id: `subagent_${key}`,
        name: sub.name,
        kind: "subagent",
        status: "idle",
        description: sub.description,
        model: sub.model,
        lastActiveAt: Date.now(),
      });
    }

    return agents;
  }
}
