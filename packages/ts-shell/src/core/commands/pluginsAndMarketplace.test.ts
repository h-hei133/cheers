import { describe, it, expect, beforeEach } from "vitest";
import {
  runMarketplaceCommand,
  getMarketplaceSources,
  resetMarketplaceSources,
} from "./marketplaceCommandRuntime.js";
import {
  runPluginCommand,
  getInstalledPlugins,
  resetInstalledPlugins,
} from "./pluginCommandRuntime.js";
import { runModelCommand } from "./modelCommandRuntime.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("Model, Marketplace & Plugin Commands", () => {
  beforeEach(() => {
    resetMarketplaceSources();
    resetInstalledPlugins();
  });

  describe("/model command", () => {
    it("handles status and help options", async () => {
      const statusRes = await runModelCommand(["status"], { cwd: process.cwd() });
    expect(statusRes.kind).toBe("local");
    expect(statusRes.output).toContain("Model selection status");

      const helpRes = await runModelCommand(["--help"], { cwd: process.cwd() });
      expect(helpRes.kind).toBe("local");
      expect(helpRes.output).toContain("Model selection commands");
    });
  });

  describe("/marketplace command", () => {
    it("lists default marketplace sources", async () => {
      const listRes = await runMarketplaceCommand(["list"], { cwd: process.cwd() });
      expect(listRes.kind).toBe("local");
      expect(listRes.output).toContain("Plugin Marketplaces");
      expect(listRes.output).toContain("official");
      expect(listRes.output).toContain("community");
    });

    it("adds and removes custom marketplace sources", async () => {
      // 1. Add
      const addRes = await runMarketplaceCommand(
        ["add", "team-internal", "https://github.com/my-org/agent-market"],
        { cwd: process.cwd() },
      );
      expect(addRes.kind).toBe("local");
      expect(addRes.output).toContain("team-internal");
      expect(getMarketplaceSources().some((m) => m.name === "team-internal")).toBe(true);

      // 2. Remove
      const rmRes = await runMarketplaceCommand(["remove", "team-internal"], { cwd: process.cwd() });
      expect(rmRes.kind).toBe("local");
      expect(rmRes.output).toContain("removed");
      expect(getMarketplaceSources().some((m) => m.name === "team-internal")).toBe(false);
    });
  });

  describe("/plugin command", () => {
    it("lists default installed plugins", async () => {
      const listRes = await runPluginCommand(["list"], { cwd: process.cwd() });
      expect(listRes.kind).toBe("local");
      expect(listRes.output).toContain("Installed Plugins");
      expect(listRes.output).toContain("core-developer-suite");
      expect(listRes.output).toContain("security-auditor");
    });

    it("installs, enables, disables, and uninstalls plugins", async () => {
      // 1. Install
      const installRes = await runPluginCommand(["install", "react-tools"], { cwd: process.cwd() });
      expect(installRes.kind).toBe("local");
      expect(installRes.output).toContain("react-tools");
      expect(getInstalledPlugins().some((p) => p.name === "react-tools")).toBe(true);

      // 2. Disable
      const disableRes = await runPluginCommand(["disable", "react-tools"], { cwd: process.cwd() });
      expect(disableRes.output).toContain("DISABLED");
      expect(getInstalledPlugins().find((p) => p.name === "react-tools")?.enabled).toBe(false);

      // 3. Enable
      const enableRes = await runPluginCommand(["enable", "react-tools"], { cwd: process.cwd() });
      expect(enableRes.output).toContain("ENABLED");
      expect(getInstalledPlugins().find((p) => p.name === "react-tools")?.enabled).toBe(true);

      // 4. Uninstall
      const rmRes = await runPluginCommand(["uninstall", "react-tools"], { cwd: process.cwd() });
      expect(rmRes.output).toContain("uninstalled");
      expect(getInstalledPlugins().some((p) => p.name === "react-tools")).toBe(false);
    });
  });

  describe("Slash Router Integration", () => {
    it("routes /marketplace and /plugin commands cleanly", async () => {
      const mRoute = await routeSlashCommand("/marketplace", { cwd: process.cwd() });
      expect(mRoute?.kind).toBe("local");

      const pRoute = await routeSlashCommand("/plugin", { cwd: process.cwd() });
      expect(pRoute?.kind).toBe("local");
    });
  });
});
