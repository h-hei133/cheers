import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listVisibleCommands } from "./registry.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("slash router (W4)", () => {
  let workspaceRoot = "";

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-command-registry-"),
    );
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("routes local doctor command", async () => {
    const result = await routeSlashCommand("/doctor", { cwd: workspaceRoot });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Private Coding Agents CLI Doctor");
    }
  });

  it("routes local connect command", async () => {
    const result = await routeSlashCommand("/connect status", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Provider connections");
    }
  });

  it("routes local model command", async () => {
    const result = await routeSlashCommand("/model", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Model selection status");
    }
  });

  it("routes prompt resume command", async () => {
    const result = await routeSlashCommand("/resume sess_123", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("shell-action");
    if (result?.kind === "shell-action") {
      expect(result.action).toBe("resume-session");
      expect(result.sessionId).toBe("sess_123");
    }
  });

  it("returns a readable local error for unknown slash commands", async () => {
    const result = await routeSlashCommand("/unknown-cmd", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Unknown slash command");
    }
  });

  it("treats /auth as unknown after migration to /connect", async () => {
    const result = await routeSlashCommand("/auth status", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Unknown slash command: /auth");
    }
  });

  it("routes /cancel, /sessions, /workspace, /mcp, /help, /view, and /permissions as shell actions", async () => {
    for (const [command, action] of [
      ["/cancel", "cancel-run"],
      ["/sessions", "list-sessions"],
      ["/sessions list", "list-sessions"],
      ["/sessions current", "list-sessions"],
      ["/sessions switch sess_abc", "list-sessions"],
      ["/workspace", "show-workspace"],
      ["/workspace status", "show-workspace"],
      ["/workspace recent", "show-workspace"],
      ["/workspace attach ../demo-project", "show-workspace"],
      ["/project use D:/work/my-app", "show-workspace"],
      ["/where", "show-workspace"],
      ["/mcp", "show-mcp"],
      ["/mcp status", "show-mcp"],
      ["/mcp tools", "show-mcp"],
      ["/mcp tools localSdk", "show-mcp"],
      ["/mcp doctor", "show-mcp"],
      ["/mcp reconnect", "show-mcp"],
      ["/mcp refresh localSdk", "show-mcp"],
      ["/help", "show-help"],
      ["/view", "show-view"],
      ["/view status", "show-view"],
      ["/view compact", "set-view"],
      ["/view user", "set-view"],
      ["/view verbose", "set-view"],
      ["/view developer", "set-view"],
      ["/view dev", "set-view"],
      ["/permissions", "manage-permissions"],
      ["/approval-policy list", "manage-permissions"],
      ["/permissions explain", "manage-permissions"],
      ["/permissions revoke 1", "manage-permissions"],
      ["/permissions reset", "manage-permissions"],
      ["/permissions reset all", "manage-permissions"],
    ] as const) {
      const result = await routeSlashCommand(command, { cwd: workspaceRoot });
      expect(result?.kind).toBe("shell-action");
      if (result?.kind === "shell-action") {
        expect(result.action).toBe(action);
        if (command === "/sessions list") {
          expect(result.sessionAction).toBe("list");
        }
        if (command === "/sessions current") {
          expect(result.sessionAction).toBe("current");
        }
        if (command === "/sessions switch sess_abc") {
          expect(result.sessionAction).toBe("switch");
          expect(result.sessionId).toBe("sess_abc");
        }
        if (command === "/permissions explain") {
          expect(result.permissionAction).toBe("explain");
        }
        if (command === "/permissions revoke 1") {
          expect(result.permissionAction).toBe("revoke");
          expect(result.permissionSelector).toBe("1");
        }
        if (command === "/permissions reset all") {
          expect(result.permissionAction).toBe("reset");
          expect(result.permissionSelector).toBe("all");
        }
        if (command === "/workspace" || command === "/workspace status") {
          expect(result.workspaceAction).toBe("status");
        }
        if (command === "/workspace recent") {
          expect(result.workspaceAction).toBe("recent");
        }
        if (command === "/workspace attach ../demo-project") {
          expect(result.workspaceAction).toBe("attach");
          expect(result.workspaceTarget).toBe("../demo-project");
        }
        if (command === "/project use D:/work/my-app") {
          expect(result.workspaceAction).toBe("attach");
          expect(result.workspaceTarget).toBe("D:/work/my-app");
        }
        if (command === "/mcp" || command === "/mcp status") {
          expect(result.mcpAction).toBe("status");
        }
        if (command === "/mcp tools") {
          expect(result.mcpAction).toBe("tools");
          expect(result.mcpTarget).toBeUndefined();
        }
        if (command === "/mcp tools localSdk") {
          expect(result.mcpAction).toBe("tools");
          expect(result.mcpTarget).toBe("localSdk");
        }
        if (command === "/mcp doctor") {
          expect(result.mcpAction).toBe("doctor");
        }
        if (command === "/mcp reconnect") {
          expect(result.mcpAction).toBe("refresh");
        }
        if (command === "/mcp refresh localSdk") {
          expect(result.mcpAction).toBe("refresh");
          expect(result.mcpTarget).toBe("localSdk");
        }
      }
    }
  });

  it("hides /mcp when MCP command exposure is disabled", async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, ".private-agents.json"),
      JSON.stringify({ enableMcpTools: false }),
      "utf8",
    );

    const visible = listVisibleCommands(workspaceRoot).map(
      (command) => command.name,
    );
    expect(visible).not.toContain("mcp");

    const routed = await routeSlashCommand("/mcp", { cwd: workspaceRoot });
    expect(routed?.kind).toBe("local");
    if (routed?.kind === "local") {
      expect(routed.output).toContain("Unknown slash command");
    }
  });
});
