import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserSessionManager } from "./sessionManager.js";
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

describe.skipIf(!canLaunch)("browser session against real Chromium", () => {
  let server: Server;
  let origin: string;
  let otherServer: Server;
  let otherOrigin: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
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
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><head><title>Elsewhere</title></head><body><h1>Elsewhere</h1></body></html>");
    });
    await new Promise<void>((resolve) => otherServer.listen(0, "127.0.0.1", resolve));
    const otherAddress = otherServer.address();
    otherOrigin = typeof otherAddress === "object" && otherAddress ? `http://127.0.0.1:${otherAddress.port}` : "";
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

  it("refuses a navigation whose redirect lands outside the allowlist", async () => {
    const manager = new BrowserSessionManager();
    // Only the first origin is admitted. The redirect target is reachable and
    // would otherwise be allowed, so the refusal can only come from judging the
    // address the page actually landed on.
    const policy: BrowserOriginPolicy = { allowedOrigins: [origin], allowPrivateNetwork: false };
    try {
      const opened = await manager.openUrl(`${origin}/redirect-elsewhere`, policy);

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
