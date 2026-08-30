import { describe, it, expect, beforeEach } from "vitest";
import { ShellDetector } from "./shellDetector.js";
import { ShellManager } from "./shellManager.js";
import { runShellCommand } from "../../commands/shellCommandRuntime.js";
import { routeSlashCommand } from "../../commands/slashRouter.js";

describe("Cross-Platform Shell Adaptation Test Suite", () => {
  beforeEach(() => {
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

    it("resets to auto-detection via /shell auto", async () => {
      ShellManager.setBackend("powershell");
      const res = await runShellCommand(["auto"], { cwd: process.cwd() });
      expect(res.kind).toBe("local");
      expect(res.output).toContain("Shell backend reset to automatic detection");

      const env = ShellManager.getActiveEnvironment();
      expect(env.isAutoDetected).toBe(true);
    });

    it("routes /shell through slashRouter", async () => {
      const routed = await routeSlashCommand("/shell status", { cwd: process.cwd() });
      expect(routed?.kind).toBe("local");
      if (routed?.kind === "local") {
        expect(routed.output).toContain("Cross-Platform Shell Environment Diagnostics");
      }
    });
  });
});
