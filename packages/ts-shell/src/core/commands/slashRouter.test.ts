import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCommandRegistry, listVisibleCommands } from "./registry.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("slash router (W4)", () => {
  let workspaceRoot = "";
  let fakeHomeDir = "";
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-slash-router-home-"),
    );
    process.env.USERPROFILE = fakeHomeDir;
    process.env.HOME = fakeHomeDir;
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-command-registry-"),
    );
  });

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile;
    process.env.HOME = originalHome;
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
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

  it("routes local compact command without persistence side effects", async () => {
    const result = await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Compact v2 handoff generated");
      expect(result.output).toContain("Markdown handoff");
      expect(result.output).toContain("- Persistence: none");
      expect(result.output).toContain("- Provider/model call: none");
      expect(result.output).toContain("- Recovery execution: none");
      expect(result.output).toContain("closeout-candidate");
      expect(result.output).not.toContain("Unknown slash command");
    }
    expect(fs.readdirSync(workspaceRoot)).toEqual([]);
  });

  it("routes compact JSON mode and rejects invalid compact args", async () => {
    const jsonResult = await routeSlashCommand("/compact json", {
      cwd: workspaceRoot,
    });
    expect(jsonResult?.kind).toBe("local");
    if (jsonResult?.kind === "local") {
      expect(JSON.parse(jsonResult.output)).toEqual(
        expect.objectContaining({
          packetVersion: "compact-v2",
          source: "session-handoff",
        }),
      );
    }

    const invalidResult = await routeSlashCommand("/compact --execute", {
      cwd: workspaceRoot,
    });
    expect(invalidResult?.kind).toBe("local");
    if (invalidResult?.kind === "local") {
      expect(invalidResult.output).toContain("- Outcome: blocked");
      expect(invalidResult.output).toContain("compact-command-mutating-flag");
    }
  });

  it("routes every visible registry command name and alias without falling through to unknown", async () => {
    const registry = createCommandRegistry(workspaceRoot);
    const visibleCommands = Array.from(registry.values()).filter(
      (command) => command.availability !== "hidden" && command.enabled !== false,
    );
    const commandNames = new Set(visibleCommands.map((command) => command.name));
    const seenAliases = new Map<string, string>();

    expect(visibleCommands.length).toBeGreaterThan(0);

    for (const command of visibleCommands) {
      for (const alias of command.aliases ?? []) {
        expect(
          commandNames.has(alias),
          `${command.name} alias ${alias} collides with a command name`,
        ).toBe(false);
        expect(
          seenAliases.get(alias),
          `${command.name} alias ${alias} collides with ${seenAliases.get(alias)}`,
        ).toBeUndefined();
        seenAliases.set(alias, command.name);
      }

      for (const token of [command.name, ...(command.aliases ?? [])]) {
        const result = await routeSlashCommand(`/${token}`, {
          cwd: workspaceRoot,
        });
        expect(result, `/${token} should route from registry`).toBeTruthy();
        if (result?.kind === "local") {
          expect(
            result.output,
            `/${token} should not be treated as unknown`,
          ).not.toContain("Unknown slash command");
          expect(
            result.output,
            `/${token} should not be treated as malformed slash input`,
          ).not.toContain("Slash command required");
        }
      }
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
      expect(result.output).toContain("- Outcome: blocked");
      expect(result.output).toContain("- BlockerKind: command-not-allowlisted");
      expect(result.output).toContain("- DoNext:");
      expect(result.output).toContain("Unknown slash command");
      expect(result.output).toContain("Quick actions:");
      expect(result.output).toContain("/help");
    }
  });

  it("returns discovery guidance for bare slash input", async () => {
    const result = await routeSlashCommand("/", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("- Outcome: blocked");
      expect(result.output).toContain("- BlockerKind: command-not-allowlisted");
      expect(result.output).toContain("- DoNext:");
      expect(result.output).toContain("Slash command required");
      expect(result.output).toContain("Quick actions:");
      expect(result.output).toContain("/sessions");
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
      ["/sessions help", "list-sessions"],
      ["/sessions unknown-mode", "list-sessions"],
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
        if (command === "/sessions help") {
          expect(result.sessionAction).toBe("help");
        }
        if (command === "/sessions unknown-mode") {
          expect(result.sessionAction).toBe("help");
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
