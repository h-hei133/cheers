import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface TeamMember {
  readonly agentId: string;
  readonly name: string;
  readonly agentType: string;
  readonly displayMode: "in-process" | "split-pane";
  readonly joinedAt: number;
}

export interface TeamConfig {
  readonly teamId: string;
  readonly leadAgentId: string;
  readonly members: readonly TeamMember[];
  readonly createdAt: number;
}

export interface MailboxMessage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: "text" | "plan_approval_request" | "plan_approval_response" | "shutdown_request" | "shutdown_response";
  readonly payload: Record<string, unknown>;
  readonly timestamp: number;
}

export interface TeamTask {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  claimedBy?: string;
  readonly dependencies?: readonly string[];
  readonly createdAt: number;
  updatedAt: number;
}

/**
 * TeamConfigManager & MailboxMesh
 * Manages team membership (~/.private-agents/teams/{team}/config.json) and point-to-point inboxes.
 */
export class TeamConfigManager {
  private readonly teamId: string;
  private readonly baseDir: string;

  constructor(sessionId: string) {
    this.teamId = `session-${sessionId.slice(0, 8)}`;
    this.baseDir = path.join(os.homedir(), ".private-agents", "teams", this.teamId);
  }

  getTeamId(): string {
    return this.teamId;
  }

  initializeTeam(leadAgentId: string = "lead"): TeamConfig {
    const config: TeamConfig = {
      teamId: this.teamId,
      leadAgentId,
      members: [
        {
          agentId: leadAgentId,
          name: "lead",
          agentType: "team-lead",
          displayMode: "in-process",
          joinedAt: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };

    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(path.join(this.baseDir, "inboxes"), { recursive: true });
      }
      fs.writeFileSync(path.join(this.baseDir, "config.json"), JSON.stringify(config, null, 2), "utf8");
    } catch {
      // Non-blocking
    }

    return config;
  }

  postToMailbox(message: MailboxMessage): boolean {
    const inboxPath = path.join(this.baseDir, "inboxes", `${message.to}.json`);
    try {
      let currentMessages: MailboxMessage[] = [];
      if (fs.existsSync(inboxPath)) {
        currentMessages = JSON.parse(fs.readFileSync(inboxPath, "utf8")) as MailboxMessage[];
      }
      currentMessages.push(message);
      fs.writeFileSync(inboxPath, JSON.stringify(currentMessages, null, 2), "utf8");
      return true;
    } catch {
      return false;
    }
  }

  readAndDrainMailbox(agentName: string): readonly MailboxMessage[] {
    const inboxPath = path.join(this.baseDir, "inboxes", `${agentName}.json`);
    try {
      if (fs.existsSync(inboxPath)) {
        const raw = fs.readFileSync(inboxPath, "utf8");
        fs.writeFileSync(inboxPath, "[]", "utf8");
        return JSON.parse(raw) as MailboxMessage[];
      }
    } catch {
      // Ignore
    }
    return [];
  }
}

/**
 * TaskStore & LockfileClaimer
 * Manages shared task queues with cross-process file-locking atomic claiming.
 */
export class TaskStore {
  private readonly teamId: string;
  private readonly tasksDir: string;

  constructor(teamId: string) {
    this.teamId = teamId;
    this.tasksDir = path.join(os.homedir(), ".private-agents", "tasks", this.teamId);
    try {
      if (!fs.existsSync(this.tasksDir)) {
        fs.mkdirSync(this.tasksDir, { recursive: true });
      }
    } catch {
      // Ignore
    }
  }

  createTask(task: Omit<TeamTask, "status" | "createdAt" | "updatedAt">): TeamTask {
    const fullTask: TeamTask = {
      ...task,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const taskFile = path.join(this.tasksDir, `${fullTask.id}.json`);
    fs.writeFileSync(taskFile, JSON.stringify(fullTask, null, 2), "utf8");
    return fullTask;
  }

  claimNextAvailableTask(agentName: string): TeamTask | null {
    try {
      const files = fs.readdirSync(this.tasksDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const taskFilePath = path.join(this.tasksDir, file);
        const lockFilePath = path.join(this.tasksDir, `${file}.lock`);

        // Atomic lock attempt
        let lockFd: number | null = null;
        try {
          lockFd = fs.openSync(lockFilePath, "wx");
        } catch {
          // Lock held by another teammate
          continue;
        }

        try {
          const taskData = JSON.parse(fs.readFileSync(taskFilePath, "utf8")) as TeamTask;
          if (taskData.status === "pending") {
            // Check dependencies
            const dependenciesCompleted = this.areDependenciesCompleted(taskData.dependencies || []);
            if (dependenciesCompleted) {
              taskData.status = "in_progress";
              taskData.claimedBy = agentName;
              taskData.updatedAt = Date.now();
              fs.writeFileSync(taskFilePath, JSON.stringify(taskData, null, 2), "utf8");
              return taskData;
            }
          }
        } finally {
          if (lockFd !== null) {
            fs.closeSync(lockFd);
            try {
              fs.unlinkSync(lockFilePath);
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch {
      // Ignore
    }

    return null;
  }

  private areDependenciesCompleted(dependencies: readonly string[]): boolean {
    for (const depId of dependencies) {
      const depPath = path.join(this.tasksDir, `${depId}.json`);
      if (!fs.existsSync(depPath)) return false;
      try {
        const depTask = JSON.parse(fs.readFileSync(depPath, "utf8")) as TeamTask;
        if (depTask.status !== "completed") return false;
      } catch {
        return false;
      }
    }
    return true;
  }
}
