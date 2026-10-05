import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserSessionManager, type ObservedPageState } from "./sessionManager.js";
import { getPwRuntimeStatus } from "./playwrightRuntime.js";
import type { BrowserOriginPolicy } from "./originPolicy.js";

/**
 * The browser session against a real Chromium and a real local server.
 *
 * The double-based tests beside the tool cover the shapes of the answers. These
 * cover what a double cannot: that the launch path works where Chromium is
 * installed, and that a navigation which redirects out of the admitted page is
 * caught. The redirect case is the reason the recheck exists — checking only the
 * requested URL passes an address nobody admitted.
 *
 * Skipped rather than failed where no Chromium is available, so a missing
 * browser does not read as a broken checkout.
 */
const runtimeStatus = await getPwRuntimeStatus();
const canLaunch = runtimeStatus.status === "ready";
const privateAddress = Object.values(networkInterfaces()).flat().find((entry) =>
  entry?.family === "IPv4" && !entry.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address),
)?.address;

describe.skipIf(!canLaunch)("browser session against real Chromium", () => {
  let server: Server;
  let origin: string;
  let otherServer: Server;
  let otherOrigin: string;
  let privateOrigin: string;
  let otherRequests = 0;
  let workerRequests = 0;
  let effectRequests = 0;
  let requestSeen: (() => void) | undefined;
  let connectionClosed: (() => void) | undefined;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/stalled" || req.url === "/effect") {
        if (req.url === "/effect") effectRequests++;
        res.once("close", () => connectionClosed?.());
        requestSeen?.();
        return;
      }
      if (req.url === "/form") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<form method='post' action='/effect'><button id='submit'>Submit</button></form>");
        return;
      }
      if (req.url === "/") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><head><title>Local Page</title></head><body><h1>Hello</h1><button id='go'>Go</button></body></html>");
        return;
      }
      // A page that answers with a redirect elsewhere. The address it names is
      // reachable, so the navigation succeeds and the recheck is what has to
      // refuse it.
      if (req.url === "/redirect-elsewhere") {
        res.writeHead(302, { location: `${otherOrigin}/` });
        res.end();
        return;
      }
      if (req.url === "/subresource") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<title>asking</title><script>fetch('${privateOrigin}/resource')
          .then(() => document.title='reached').catch(() => document.title='blocked');</script>`);
        return;
      }
      if (req.url === "/popup") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<title>popup</title><script>window.open('${privateOrigin}/popup');</script>`);
        return;
      }
      if (req.url === "/worker") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<title>asking</title><script>navigator.serviceWorker.register('/worker.js')
          .then((registration) => document.title=registration ? 'registered' : 'blocked').catch(() => document.title='blocked');</script>`);
        return;
      }
      if (req.url === "/worker.js") {
        workerRequests++;
        res.writeHead(200, { "content-type": "application/javascript" });
        res.end("self.addEventListener('fetch', () => {});");
        return;
      }
      if (req.url === "/redirect-same-origin") {
        res.writeHead(302, { location: "/" });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    origin = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";

    otherServer = createServer((_req, res) => {
      otherRequests++;
      res.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
      res.end("<html><head><title>Elsewhere</title></head><body><h1>Elsewhere</h1></body></html>");
    });
    await new Promise<void>((resolve) => otherServer.listen(0, "0.0.0.0", resolve));
    const otherAddress = otherServer.address();
    otherOrigin = typeof otherAddress === "object" && otherAddress ? `http://127.0.0.1:${otherAddress.port}` : "";
    privateOrigin = typeof otherAddress === "object" && otherAddress ? `http://${privateAddress}:${otherAddress.port}` : "";
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => otherServer.close(() => resolve()));
  });

  const openPolicy: BrowserOriginPolicy = { allowedOrigins: [], allowPrivateNetwork: false };

  it("navigates a real page and reads its elements", async () => {
    const manager = new BrowserSessionManager();
    try {
      const opened = await manager.openUrl(`${origin}/`, openPolicy);
      expect(opened.ok, opened.ok ? "" : opened.failure?.reason).toBe(true);
      expect(opened.title).toBe("Local Page");

      const state = await manager.observe();
      expect(state.elements.length).toBeGreaterThan(0);
      expect(state.outline).toContain("Hello");
    } finally {
      await manager.closeSession();
    }
  });

  it("cancels an actual stalled navigation and observes connection closure", async () => {
    const manager = new BrowserSessionManager();
    const controller = new AbortController();
    const seen = new Promise<void>((resolve) => { requestSeen = resolve; });
    const closed = new Promise<void>((resolve) => { connectionClosed = resolve; });
    try {
      const pending = manager.run({ signal: controller.signal }, () => manager.openUrl(`${origin}/stalled`, openPolicy));
      await seen;
      controller.abort();
      expect(await pending).toMatchObject({ status: "cancelled", evidence: { effect: "possible", cleanup: "complete" } });
      await closed;
    } finally {
      requestSeen = undefined;
      connectionClosed = undefined;
      await manager.closeSession();
    }
  });

  it("retains a submitted server effect after cancelling the waiting click", async () => {
    const manager = new BrowserSessionManager();
    const controller = new AbortController();
    const seen = new Promise<void>((resolve) => { requestSeen = resolve; });
    const before = effectRequests;
    try {
      expect((await manager.openUrl(`${origin}/form`, openPolicy)).ok).toBe(true);
      const pending = manager.run({ signal: controller.signal }, () => manager.click("#submit"));
      await seen;
      controller.abort();
      const result = await pending;
      expect(result).toMatchObject({ status: "cancelled", evidence: { cleanup: "complete" } });
      // Drivers may acknowledge the dispatched click as the page closes, or
      // reject its navigation wait. Neither outcome erases the server effect.
      expect(["possible", "confirmed"]).toContain(result.evidence.effect);
      expect(effectRequests).toBe(before + 1);
    } finally {
      requestSeen = undefined;
      await manager.closeSession();
    }
  });

  it.skipIf(!privateAddress).each(["subresource", "popup"])("blocks the first %s request before it reaches a reachable disallowed server", async (path) => {
    // Positive control: the denied origin is serving, so zero requests proves
    // interception rather than a failed network connection.
    const control = await fetch(`${privateOrigin}/control`);
    expect(control.status).toBe(200);
    await control.text();
    const before = otherRequests;
    const manager = new BrowserSessionManager();
    try {
      const opened = await manager.openUrl(`${origin}/${path}`, { allowedOrigins: [origin], allowPrivateNetwork: false });
      expect(opened.ok, opened.failure?.reason).toBe(true);
      await waitForPage(manager, (state) => state.outline.includes("A page request was blocked:"));
      expect((await manager.observe()).outline).toContain("private address");
      expect(otherRequests).toBe(before);
    } finally {
      await manager.closeSession();
    }
  });

  it("disables service worker registration before a page can bypass request routing", async () => {
    const before = workerRequests;
    const manager = new BrowserSessionManager();
    try {
      expect((await manager.openUrl(`${origin}/worker`, openPolicy)).ok).toBe(true);
      await waitForPage(manager, (state) => state.title === "blocked");
      expect(workerRequests).toBe(before);
    } finally {
      await manager.closeSession();
    }
  });

  it("refuses a navigation whose redirect lands outside the allowlist", async () => {
    const manager = new BrowserSessionManager();
    // Only the first origin is admitted. The redirect target is reachable and
    // would otherwise be allowed, so the refusal can only come from judging the
    // address the page actually landed on.
    const policy: BrowserOriginPolicy = { allowedOrigins: [origin], allowPrivateNetwork: false };
    try {
      const before = otherRequests;
      const opened = await manager.openUrl(`${origin}/redirect-elsewhere`, policy);

      // The framework follows this hop without invoking the route handler.
      // Landing refusal is observable, but cannot undo that network request.
      expect(otherRequests).toBeGreaterThan(before);
      expect(opened.ok).toBe(false);
      expect(opened.failure?.kind).toBe("url-refused");
      expect(opened.failure?.reason).toContain("not in the configured browser origin allowlist");
      expect(opened.failure?.refusal?.hostname).toBe(new URL(otherOrigin).hostname);

      // Left on `about:blank` rather than kept where it landed: a later observe
      // must not read a page the policy already turned down.
      const after = await manager.observe();
      expect(after.url).toBe("about:blank");
    } finally {
      await manager.closeSession();
    }
  });

  it("refuses a metadata address before any browser starts", async () => {
    const manager = new BrowserSessionManager();
    try {
      const opened = await manager.openUrl("http://169.254.169.254/latest/meta-data/", openPolicy);

      expect(opened.ok).toBe(false);
      expect(opened.failure?.kind).toBe("url-refused");
      expect(opened.failure?.reason).toContain("link-local");
    } finally {
      await manager.closeSession();
    }
  });

  it("allows a redirect that stays on the same origin", async () => {
    const manager = new BrowserSessionManager();
    try {
      const opened = await manager.openUrl(`${origin}/redirect-same-origin`, openPolicy);

      expect(opened.ok, opened.ok ? "" : opened.failure?.reason).toBe(true);
      expect(opened.title).toBe("Local Page");
    } finally {
      await manager.closeSession();
    }
  });
});

async function waitForPage(manager: BrowserSessionManager, ready: (state: ObservedPageState) => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (ready(await manager.observe())) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(ready(await manager.observe())).toBe(true);
}
