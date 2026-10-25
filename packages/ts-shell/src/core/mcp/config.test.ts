import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMcpConfigs } from "./config.js";
import { mcpConfigPath } from './config/document.js';

describe("project-scoped MCP configuration", () => {
  let tempDir: string;
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-trust-"));
    fs.mkdirSync(path.join(tempDir, "workspace"), { recursive: true });
    // Keep the user-level file out of the picture so the test reads only the
    // project's.
    process.env.HOME = path.join(tempDir, "home");
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
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

  it('prefers the project directory document without merging shadowed legacy servers', () => {
    writeProjectConfig();
    const root = path.join(tempDir, 'workspace');
    const current = path.join(root, '.cheers', 'mcp.json'); fs.mkdirSync(path.dirname(current));
    fs.writeFileSync(current, '{"mcpServers":{"local":{"command":"synthetic-server"}}}');
    expect(mcpConfigPath(root, 'project')).toBe(current);
    expect(loadMcpConfigs(root, true)).toMatchObject({ local: { scope: 'project', sourcePath: current } });
    expect(loadMcpConfigs(root, true).evil).toBeUndefined();
    expect(loadMcpConfigs(root, false).local).toBeUndefined();
  });

  it('rejects a malformed directory document instead of using the legacy file', () => {
    writeProjectConfig();
    const root = path.join(tempDir, 'workspace');
    fs.mkdirSync(path.join(root, '.cheers')); fs.writeFileSync(path.join(root, '.cheers', 'mcp.json'), '{bad');
    expect(() => loadMcpConfigs(root, true)).toThrow('MCP config is invalid');
  });

  it('rejects a dangling directory document instead of treating it as absent', () => {
    writeProjectConfig();
    const root = path.join(tempDir, 'workspace');
    fs.mkdirSync(path.join(root, '.cheers')); fs.symlinkSync(path.join(root, 'missing'), path.join(root, '.cheers', 'mcp.json'));
    expect(() => loadMcpConfigs(root, true)).toThrow('MCP config is invalid');
  });

  it('keeps personal MCP scope when browsing the home directory as a workspace', () => {
    const home = process.env.HOME!; fs.mkdirSync(path.join(home, '.cheers'), { recursive: true });
    const user = path.join(home, '.cheers', 'mcp.json'); fs.writeFileSync(user, '{"mcpServers":{"local":{"command":"server"}}}');
    expect(loadMcpConfigs(home, true).local).toMatchObject({ scope: 'user', sourcePath: user });
    expect(mcpConfigPath(home, 'project')).toBe(path.join(home, '.cheers.mcp.json'));
  });

  it('does not choose the future personal destination while a legacy user MCP document is active', () => {
    const home = process.env.HOME!; fs.mkdirSync(path.join(home, '.cheer'), { recursive: true });
    const user = path.join(home, '.cheer', 'mcp.json'); fs.writeFileSync(user, '{"mcpServers":{"local":{"command":"server"}}}');
    expect(mcpConfigPath(home, 'project')).toBe(path.join(home, '.cheers.mcp.json'));
    expect(loadMcpConfigs(home, true).local).toMatchObject({ scope: 'user', sourcePath: user });
    expect(fs.existsSync(path.join(home, '.cheers', 'mcp.json'))).toBe(false);
  });

  it('rejects a new preferred source appearing during legacy acquisition', () => {
    writeProjectConfig(); const root = path.join(tempDir, 'workspace');
    const inode = fs.statSync(path.join(root, '.cheers.mcp.json')).ino;
    const original = fs.readSync; let changed = false;
    vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
      const count = original(...args);
      if (!changed && fs.fstatSync(args[0]).ino === inode) {
        changed = true; fs.mkdirSync(path.join(root, '.cheers')); fs.writeFileSync(path.join(root, '.cheers', 'mcp.json'), '{"mcpServers":{}}');
      }
      return count;
    });
    expect(() => loadMcpConfigs(root, true)).toThrow('configuration source changed');
    expect(changed).toBe(true);
  });
});
