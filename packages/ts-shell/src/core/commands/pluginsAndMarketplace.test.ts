import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
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
  // The registry persists, so it is pointed at a scratch file: a test run must
  // not rewrite the registry the user is actually working with.
  const registryDir = fs.mkdtempSync(path.join(os.tmpdir(), "extension-registry-"));
  process.env.CODING_AGENTS_PLUGINS_FILE = path.join(registryDir, "plugins.json");

  beforeEach(() => {
    resetMarketplaceSources();
    resetInstalledPlugins();
  });

  afterAll(() => {
    delete process.env.CODING_AGENTS_PLUGINS_FILE;
    fs.rmSync(registryDir, { recursive: true, force: true });
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
    it("starts with an empty registry rather than inventing entries", async () => {
      const listRes = await runPluginCommand(["list"], { cwd: process.cwd() });
      expect(listRes.kind).toBe("local");
      expect(listRes.output).toContain("None registered.");
      expect(getInstalledPlugins()).toEqual([]);
    });

    it("records a package spec as unresolved and never claims it loaded", async () => {
      const res = await runPluginCommand(["add", "react-tools"], { cwd: process.cwd() });

      expect(res.output).toContain("Resolved: no");
      expect(res.output).toContain("Nothing was downloaded.");
      expect(res.output).not.toMatch(/active in the runtime/i);
      expect(getInstalledPlugins().find((p) => p.name === "react-tools")?.resolved).toBe(false);
    });

    it("reads a manifest when the spec is a path that exists", async () => {
      const res = await runPluginCommand(["add", "."], { cwd: process.cwd() });

      expect(res.output).toContain("Resolved: yes");
      expect(getInstalledPlugins().some((plugin) => plugin.source === "path")).toBe(true);
    });

    it("refuses a path with no manifest instead of registering it", async () => {
      const res = await runPluginCommand(["add", "./definitely-not-here"], { cwd: process.cwd() });

      expect(res.output).toContain("nothing to register");
      expect(getInstalledPlugins()).toEqual([]);
    });

    it("installs, enables, disables, and uninstalls plugins", async () => {
      // 1. Install
      const installRes = await runPluginCommand(["install", "react-tools"], { cwd: process.cwd() });
      expect(installRes.kind).toBe("local");
      expect(installRes.output).toContain("react-tools");
      expect(getInstalledPlugins().some((p) => p.name === "react-tools")).toBe(true);

      // 2. Disable
      const disableRes = await runPluginCommand(["disable", "react-tools"], { cwd: process.cwd() });
      expect(disableRes.output).toContain("marked disabled");
      expect(getInstalledPlugins().find((p) => p.name === "react-tools")?.enabled).toBe(false);

      // 3. Enable
      const enableRes = await runPluginCommand(["enable", "react-tools"], { cwd: process.cwd() });
      expect(enableRes.output).toContain("marked enabled");
      expect(getInstalledPlugins().find((p) => p.name === "react-tools")?.enabled).toBe(true);

      // 4. Uninstall
      const rmRes = await runPluginCommand(["uninstall", "react-tools"], { cwd: process.cwd() });
      expect(rmRes.output).toContain("Removed");
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
