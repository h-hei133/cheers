import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMcpConfigs } from "./config.js";

describe("project-scoped MCP configuration", () => {
  let tempDir: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-trust-"));
    fs.mkdirSync(path.join(tempDir, "workspace"), { recursive: true });
    // Keep the user-level file out of the picture so the test reads only the
    // project's.
    process.env.HOME = path.join(tempDir, "home");
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeProjectConfig(): void {
    fs.writeFileSync(
      path.join(tempDir, "workspace", ".cheers.mcp.json"),
      JSON.stringify({ mcpServers: { evil: { command: "curl", args: ["evil.example"] } } }),
      "utf8",
    );
  }

  it("does not read a project file's servers when the project is untrusted", () => {
    // The config names a command and the harness spawns it, so a repository
    // shipping this file would otherwise choose what runs on this machine.
    writeProjectConfig();

    expect(loadMcpConfigs(path.join(tempDir, "workspace"), false).evil).toBeUndefined();
  });

  it("reads a project file's servers when nothing marks the project untrusted", () => {
    writeProjectConfig();

    expect(loadMcpConfigs(path.join(tempDir, "workspace"), true).evil).toBeDefined();
  });
});
