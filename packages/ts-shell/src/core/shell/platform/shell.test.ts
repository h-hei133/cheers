import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import { ShellDetector } from "./shellDetector.js";
import { ShellManager } from "./shellManager.js";
import { runShellCommand } from "../../commands/shellCommandRuntime.js";
import { routeSlashCommand } from "../../commands/slashRouter.js";

const { locate } = vi.hoisted(() => ({ locate: vi.fn() }));
vi.mock("node:child_process", async () => ({
  ...await vi.importActual<typeof import("node:child_process")>("node:child_process"), execFileSync: locate,
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); locate.mockReset(); });

describe("Cross-Platform Shell Adaptation Test Suite", () => {
  beforeEach(() => {
    vi.spyOn(os, "platform").mockReturnValue("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isFile: () => true } as fs.Stats);
    vi.spyOn(fs, "accessSync").mockImplementation(() => {});
    locate.mockReturnValue("");
    ShellManager.resetToAuto();
  });

  describe("ShellDetector", () => {
    it("detects current host platform and selects active shell", () => {
      const env = ShellDetector.detectEnvironment();

      expect(env.platform).toBeDefined();
      expect(env.arch).toBeDefined();
      expect(env.activeBackend).toBeDefined();
      expect(env.detectedShells.length).toBeGreaterThan(0);
      expect(env.executionPath).toBeDefined();
      expect(typeof env.isPosixCompatible).toBe("boolean");
      expect(env.isAutoDetected).toBe(true);
    });

    it("respects forced backend configuration", () => {
      const env = ShellDetector.detectEnvironment("powershell");
      expect(env.activeBackend).toBe("powershell");
      expect(env.isAutoDetected).toBe(false);
    });
  });

  describe("ShellManager", () => {
    it("manages active backend state and formats status diagnostics", () => {
      const initial = ShellManager.getActiveEnvironment();
      expect(initial.isAutoDetected).toBe(true);

      const switched = ShellManager.setBackend("bash");
      expect(switched.activeBackend).toBe("bash");
      expect(switched.isAutoDetected).toBe(false);

      const report = ShellManager.formatStatusReport();
      expect(report).toContain("Cross-Platform Shell Environment Diagnostics");
      expect(report).toContain("Active Shell Backend");
      expect(report).toContain("Detected Shell Backends");

      const reset = ShellManager.resetToAuto();
      expect(reset.isAutoDetected).toBe(true);
    });
  });

  describe("/shell Slash Command & SlashRouter", () => {
    it("renders diagnostic report on /shell status", async () => {
      const res = await runShellCommand(["status"], { cwd: process.cwd() });
      expect(res.kind).toBe("local");
      expect(res.output).toContain("Cross-Platform Shell Environment Diagnostics");
      expect(res.output).toContain("Commands:");
    });

    it("switches shell backend via /shell use <backend>", async () => {
      const res = await runShellCommand(["use", "powershell"], { cwd: process.cwd() });
      expect(res.kind).toBe("local");
      expect(res.output).toContain("Active shell backend switched to `powershell`");

      const env = ShellManager.getActiveEnvironment();
      expect(env.activeBackend).toBe("powershell");
    });

    it("rejects invalid shell backends cleanly", async () => {
      const res = await runShellCommand(["use", "invalid-shell"], { cwd: process.cwd() });
      expect(res.kind).toBe("local");
      expect(res.output).toContain("Invalid shell backend: 'invalid-shell'");
      expect(res.output).toContain("Supported options:");
    });

    it("handles subcommand aliases (diag, info, reset, set)", async () => {
      const diagRes = await runShellCommand(["diag"], { cwd: process.cwd() });
      expect(diagRes.output).toContain("Cross-Platform Shell Environment Diagnostics");

      const infoRes = await runShellCommand(["info"], { cwd: process.cwd() });
      expect(infoRes.output).toContain("Cross-Platform Shell Environment Diagnostics");

      const setRes = await runShellCommand(["set", "wsl"], { cwd: process.cwd() });
      expect(setRes.output).toContain("Active shell backend switched to `wsl`");

      const resetRes = await runShellCommand(["reset"], { cwd: process.cwd() });
      expect(resetRes.output).toContain("Shell backend reset to automatic detection");
    });

    it("resets to auto-detection via /shell auto", async () => {
      ShellManager.setBackend("powershell");
      const res = await runShellCommand(["auto"], { cwd: process.cwd() });
      expect(res.kind).toBe("local");
      expect(res.output).toContain("Shell backend reset to automatic detection");

      const env = ShellManager.getActiveEnvironment();
      expect(env.isAutoDetected).toBe(true);
    });

    it("routes /shell, /sh, and /platform through slashRouter", async () => {
      const routedShell = await routeSlashCommand("/shell status", { cwd: process.cwd() });
      expect(routedShell?.kind).toBe("local");
      if (routedShell?.kind === "local") {
        expect(routedShell.output).toContain("Cross-Platform Shell Environment Diagnostics");
      }

      const routedSh = await routeSlashCommand("/sh", { cwd: process.cwd() });
      expect(routedSh?.kind).toBe("local");

      const routedPlatform = await routeSlashCommand("/platform", { cwd: process.cwd() });
      expect(routedPlatform?.kind).toBe("local");
    });
  });
});

describe("executable shell selection", () => {
  beforeEach(() => {
    vi.spyOn(os, "platform").mockReturnValue("linux");
    vi.spyOn(fs, "statSync").mockImplementation(candidate => {
      if (candidate === "/bin/bash" || candidate === "/bin/sh") return { isFile: () => true } as fs.Stats;
      throw new Error("not found");
    });
    vi.spyOn(fs, "accessSync").mockImplementation(() => {});
    locate.mockReturnValue("");
    ShellManager.resetToAuto();
  });

  it.each(["/missing/bash", "/usr/bin/fish", "/bin/zsh"])("does not turn login shell %s into the bash backend", login => {
    vi.stubEnv("SHELL", login);
    const env = ShellDetector.detectEnvironment();
    expect(env).toMatchObject({ activeBackend: "bash", executionPath: "/bin/bash", isAvailable: true, isPosixCompatible: true });
  });

  it("falls back to an executable sh when bash is not executable", () => {
    vi.spyOn(fs, "accessSync").mockImplementation(candidate => { if (candidate !== "/bin/sh") throw new Error("not executable"); });
    expect(ShellDetector.detectEnvironment()).toMatchObject({ executionPath: "/bin/sh", isAvailable: true });
  });

  it("does not call a directory an executable and reports absence truthfully", () => {
    vi.spyOn(fs, "statSync").mockReturnValue({ isFile: () => false } as fs.Stats);
    expect(ShellDetector.detectEnvironment()).toMatchObject({ isAvailable: false, isPosixCompatible: false });
    expect(ShellManager.formatStatusReport()).toContain("**Executable Available**: no");
  });

  it("rejects an unavailable forced backend without changing the current selection", async () => {
    const before = ShellManager.getActiveEnvironment();
    const result = await runShellCommand(["use", "wsl"], { cwd: process.cwd() });
    expect(result.output).toContain("unavailable");
    expect(result.output).toContain("Selection was not changed");
    expect(result.output).not.toContain("switched");
    expect(ShellManager.getActiveEnvironment()).toEqual(before);
    expect(ShellManager.formatStatusReport()).toContain("**Selection Scope**: current process");
  });

  it("checks PATH results before selecting a shell", () => {
    vi.spyOn(fs, "statSync").mockImplementation(candidate => {
      if (candidate === "/opt/bin/bash") return { isFile: () => true } as fs.Stats;
      throw new Error("not found");
    });
    locate.mockImplementation((_tool, [name]) => name === "bash" ? "/gone/bash\n/opt/bin/bash\n" : "");
    expect(ShellDetector.detectEnvironment()).toMatchObject({ executionPath: "/opt/bin/bash", isAvailable: true });
    expect(locate).toHaveBeenCalledWith("which", ["bash"], expect.objectContaining({ timeout: 1000 }));
  });

  it("does not assume PowerShell exists on Windows", () => {
    vi.spyOn(os, "platform").mockReturnValue("win32");
    vi.spyOn(fs, "statSync").mockImplementation(() => { throw new Error("not found"); });
    expect(ShellDetector.detectEnvironment()).toMatchObject({ activeBackend: "powershell", isAvailable: false, isPosixCompatible: false });
  });
});
