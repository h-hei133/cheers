import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSessionManager } from "./sessionManager.js";
import type { PwBrowserContext, PwPage, PwRoute } from "./playwrightRuntime.js";

const imported = vi.hoisted(() => vi.fn());
vi.mock("./playwrightRuntime.js", () => ({ importPwRuntime: imported }));

describe("browser context request guard", () => {
  const managers: BrowserSessionManager[] = [];
  afterEach(async () => {
    for (const manager of managers.splice(0)) await manager.closeSession();
  });

  async function setup() {
    const order: string[] = [];
    let handler!: (route: PwRoute) => Promise<void>;
    const page = {
      goto: vi.fn(), url: () => "http://localhost/", title: async () => "Local",
      evaluate: async () => [], on: vi.fn(), close: vi.fn(),
    } as unknown as PwPage;
    const context: PwBrowserContext = {
      route: async (_pattern, callback) => { order.push("route"); handler = callback; },
      newPage: async () => { order.push("page"); return page; },
      close: vi.fn(),
    };
    const newContext = vi.fn(async () => context);
    imported.mockResolvedValue({ ok: true, module: { chromium: {
      launch: async () => ({ newContext, close: vi.fn() }),
    } } });
    const manager = new BrowserSessionManager();
    managers.push(manager);
    expect((await manager.openUrl("http://localhost/", { allowedOrigins: ["http://localhost"], allowPrivateNetwork: false })).ok).toBe(true);
    return { manager, handler, order, newContext };
  }

  it("installs the guard before page creation and disables worker bypass", async () => {
    const { order, newContext } = await setup();
    expect(order).toEqual(["route", "page"]);
    expect(newContext).toHaveBeenCalledWith(expect.objectContaining({ serviceWorkers: "block" }));
  });

  it("awaits the allowed request disposition", async () => {
    const { handler } = await setup();
    let release!: () => void;
    let completed = false;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const route: PwRoute = { request: () => ({ url: () => "http://localhost/" }), continue: () => pending, abort: vi.fn() };
    const handling = handler(route).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await handling;
    expect(completed).toBe(true);
    expect(route.abort).not.toHaveBeenCalled();
  });

  it.each(["http://localhost/", "http://192.168.0.1/"])("reports rejected disposition for %s without claiming a block", async (url) => {
    const { manager, handler } = await setup();
    const fail = vi.fn().mockRejectedValue(new Error("target closed"));
    await expect(handler({ request: () => ({ url: () => url }), continue: fail, abort: fail })).resolves.toBeUndefined();
    expect(fail).toHaveBeenCalledTimes(1);
    const state = await manager.observe();
    expect(state.outline).toContain("Request handling failed: target closed");
    expect(state.outline).not.toContain("was blocked");
  });
});
