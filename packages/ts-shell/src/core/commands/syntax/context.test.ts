import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runWorkflowCommand } from "../workflowCommandRuntime.js";
import { runSidebarLocalCommand } from "../sidebarCommandRuntime.js";
import { parseStartupWarmCommandArgs } from "../../../context/startup/startupWarmCommandContract.js";
import { parseSidebarLivePanelCommandArgs } from "../../../presentation/sidebar/sidebarLivePanelCommandContract.js";
import { parseSidebarPanelCommandArgs } from "../../../presentation/sidebar/sidebarPanelCommandContract.js";
import { createCommandRegistry } from "../registry.js";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "context-args-")); vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it("rejects extra workflow arguments before executing the named definition", async () => {
  const dir = path.join(root, ".agents", "workflows"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "probe.json"), JSON.stringify({ name: "probe", steps: [{ id: "write", run: "echo executed > marker" }] }));
  for (const args of [["run", "probe", "extra"], ["start", "probe", "--unknown"], ["list", "extra"], ["status", "extra"]]) {
    expect((await runWorkflowCommand(args, { cwd: root }, true)).output).toContain("Invalid /workflow arguments");
    expect(fs.existsSync(path.join(root, "marker"))).toBe(false);
  }
  expect((await runWorkflowCommand(["templates"], { cwd: root }, true)).output).toContain("probe");
  expect((await runWorkflowCommand(["start", "probe"], { cwd: root }, true)).output).toContain("bound session runtime and ordinary command approval");
  expect(fs.existsSync(path.join(root, "marker"))).toBe(false);
});

it("uses shared warmup actions and rejects invalid flags", () => {
  expect(parseStartupWarmCommandArgs(["REBUILD"]).mode).toBe("rebuild");
  expect(parseStartupWarmCommandArgs([]).mode).toBe("status");
  for (const args of [["rebuild", "extra"], ["--rebuild"], ["constructor"], [""]]) expect(() => parseStartupWarmCommandArgs(args)).toThrow();
});

it("keeps snapshot aliases single-frame and panel density separate", async () => {
  for (const alias of ["snapshot", "watch", "live", "WATCH"]) expect(parseSidebarLivePanelCommandArgs([alias]).contract).toMatchObject({ mode: "snapshot", frameCount: 1, density: "normal" });
  expect(parseSidebarLivePanelCommandArgs([]).ok).toBe(false);
  expect(parseSidebarPanelCommandArgs(["DETAIL"]).contract).toMatchObject({ mode: "panel", density: "detail" });
  expect(parseSidebarPanelCommandArgs([]).contract).toMatchObject({ mode: "preview" });
  const result = await runSidebarLocalCommand(["WATCH"], { cwd: root });
  expect(result.output).not.toContain("Outcome: blocked");
  for (const args of [["snapshot", "extra"], ["panel", "extra"], ["watch", "--unknown"]]) expect((await runSidebarLocalCommand(args, { cwd: root })).output).toContain("Outcome: blocked");
});

it("derives alias suggestions and truthful snapshot descriptions", () => {
  const registry = createCommandRegistry(root);
  expect(registry.get("workflow")!.getArgumentCompletions?.("sta")?.map(item => item.value)).toEqual(["start", "status"]);
  expect(registry.get("workflow")!.getArgumentCompletions?.("run probe ")).toBeNull();
  expect(registry.get("sidebar")!.getArgumentCompletions?.("wa")).toMatchObject([{ value: "watch", detail: "capture state once; run again to refresh" }]);
  expect(registry.get("warmup")!.getArgumentCompletions?.("re")?.map(item => item.value)).toEqual(["rebuild"]);
});
