import { expect, it, vi } from "vitest";
import { BrowserSessionManager } from "../sessionManager.js";
const imported = vi.hoisted(() => vi.fn());
vi.mock("../playwrightRuntime.js", () => ({ importPwRuntime: imported }));

it.each(["import", "launch", "context", "guard", "preload", "page"])("stops after cancelled %s without advancing startup", async (stage) => {
  const controller = new AbortController();
  const order: string[] = [];
  const complete = (name: string) => { order.push(name); if (stage === name) controller.abort(); };
  const page = { close: vi.fn(async () => {}), goto: vi.fn(), on: vi.fn() };
  const context = {
    close: vi.fn(async () => {}), route: async () => complete("guard"),
    addInitScript: async () => complete("preload"),
    newPage: async () => { complete("page"); return page; },
  };
  const browser = {
    close: vi.fn(async () => {}),
    newContext: async () => { complete("context"); return context; },
  };
  imported.mockImplementationOnce(async () => {
    complete("import");
    return { ok: true, module: { chromium: { launch: async () => { complete("launch"); return browser; } } } };
  });
  const manager = new BrowserSessionManager();
  const result = await manager.run({ signal: controller.signal }, () => manager.openUrl("http://localhost/"));
  expect(result).toMatchObject({ status: "cancelled", evidence: { effect: "none", cleanup: "complete" } });
  const stages = ["import", "launch", "context", "guard", "preload", "page"];
  expect(order).toEqual(stages.slice(0, stages.indexOf(stage) + 1));
  expect(page.goto).not.toHaveBeenCalled();
  expect(browser.close).toHaveBeenCalledTimes(stage === "import" ? 0 : 1);
  expect(context.close).toHaveBeenCalledTimes(["import", "launch"].includes(stage) ? 0 : 1);
  expect(page.close).toHaveBeenCalledTimes(stage === "page" ? 1 : 0);
});
