import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSessionManager } from "./sessionManager.js";
import type { PwBrowserContext, PwPage, PwRoute } from "./playwrightRuntime.js";
import { admitBrowserUrl } from "./urlAdmission.js";

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
    const closePage = vi.fn(async () => {});
    const closeContext = vi.fn(async () => {});
    const closeBrowser = vi.fn(async () => {});
    const page = {
      goto: vi.fn(), url: () => "http://localhost/", title: async () => "Local",
      evaluate: async () => [], on: vi.fn(), close: closePage,
    } as unknown as PwPage;
    const context: PwBrowserContext = {
      route: async (_pattern, callback) => { order.push("route"); handler = callback; },
      newPage: async () => { order.push("page"); return page; },
      close: closeContext,
    };
    const newContext = vi.fn(async () => context);
    imported.mockResolvedValue({ ok: true, module: { chromium: {
      launch: async () => ({ newContext, close: closeBrowser }),
    } } });
    const manager = new BrowserSessionManager();
    managers.push(manager);
    expect((await manager.openUrl("http://localhost/", { allowedOrigins: ["http://localhost"], allowPrivateNetwork: false })).ok).toBe(true);
    return { manager, handler, order, newContext, closePage, closeContext, closeBrowser };
  }

  it.each(["Page", "Context", "Browser"] as const)("reports a failed %s close, preserves the handle, and allows cleanup retry", async (resource) => {
    const setupResult = await setup();
    const close = setupResult[`close${resource}`];
    close.mockRejectedValueOnce(new Error(`${resource} still open`));
    const result = await setupResult.manager.closeSession();
    expect(result).toMatchObject({ ok: false, failure: { kind: "close-failed", reason: expect.stringContaining(resource.toLowerCase()) } });
    expect(setupResult.closePage).toHaveBeenCalledTimes(1);
    expect(setupResult.closeContext).toHaveBeenCalledTimes(1);
    expect(setupResult.closeBrowser).toHaveBeenCalledTimes(1);
    const reopen = await setupResult.manager.openUrl("http://localhost/");
    expect(reopen).toMatchObject({ ok: false, failure: { kind: "close-failed" } });
    expect(setupResult.newContext).toHaveBeenCalledTimes(1);
    expect(await setupResult.manager.closeSession()).toMatchObject({ ok: true });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("collects every close failure while attempting every resource", async () => {
    const result = await setup();
    result.closePage.mockRejectedValueOnce(new Error("page failed"));
    result.closeBrowser.mockRejectedValueOnce(new Error("browser failed"));
    expect(await result.manager.closeSession()).toMatchObject({
      ok: false, failure: { kind: "close-failed", reason: expect.stringMatching(/page.*browser/) },
    });
    expect(result.closeContext).toHaveBeenCalledTimes(1);
  });

  it("shares an in-progress close rather than closing the same handles twice", async () => {
    const result = await setup();
    let finish!: () => void;
    result.closePage.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = result.manager.closeSession();
    const second = result.manager.closeSession();
    await Promise.resolve();
    finish();
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toMatchObject({ ok: true });
    expect(result.closePage).toHaveBeenCalledTimes(1);
    expect(result.closeBrowser).toHaveBeenCalledTimes(1);
  });

  it("waits for an already-started launch before reporting closure", async () => {
    let finish!: (page: PwPage) => void;
    const opening = new Promise<PwPage>((resolve) => { finish = resolve; });
    const manager = new BrowserSessionManager({ admitUrl: admitBrowserUrl, launchPage: () => opening });
    managers.push(manager);
    const started = manager.getOrCreatePage();
    let closed = false;
    const closing = manager.closeSession().then((result) => { closed = true; return result; });
    await Promise.resolve();
    expect(closed).toBe(false);
    const close = vi.fn(async () => {});
    finish({ close } as unknown as PwPage);
    await started;
    expect(await closing).toMatchObject({ ok: true });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("retains a failed cleanup handle when page initialization also fails", async () => {
    const closeBrowser = vi.fn(async () => {}).mockRejectedValueOnce(new Error("browser still running"));
    imported.mockResolvedValue({ ok: true, module: { chromium: {
      launch: async () => ({
        close: closeBrowser,
        newContext: async () => ({
          route: async () => {}, close: async () => {},
          newPage: async () => { throw new Error("page initialization failed"); },
        }),
      }),
    } } });
    const manager = new BrowserSessionManager();
    managers.push(manager);
    expect(await manager.getOrCreatePage()).toBeNull();
    expect(await manager.openUrl("http://localhost/")).toMatchObject({ ok: false, failure: { kind: "close-failed" } });
    expect(closeBrowser).toHaveBeenCalledTimes(1);
    expect(await manager.closeSession()).toMatchObject({ ok: true });
    expect(closeBrowser).toHaveBeenCalledTimes(2);
  });

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
