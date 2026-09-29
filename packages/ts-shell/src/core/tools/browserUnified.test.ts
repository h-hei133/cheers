import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BrowserSessionManager } from "../../browser/sessionManager.js";
import type { PwPage } from "../../browser/playwrightRuntime.js";
import { createUnifiedBrowserToolDefinition } from "./browserToolUnified.js";

/**
 * A page double, not a simulation inside the tool.
 *
 * The previous version of these tests drove a `setMockHtml` back door on the
 * production class: the class carried a fake DOM parser whose only purpose was
 * to make an unlaunched browser answer `success: true`. That made the production
 * module able to fabricate results, and the tests asserted the fabrication. The
 * double lives here instead, so the class has no path that reports an action it
 * did not take.
 */
function createPageDouble(fixtures: ReadonlyMap<string, string>): PwPage {
  // A freshly launched page is blank and stays blank until something navigates
  // it, which is what makes the post-close assertion meaningful: observing after
  // a close relaunches, and a real relaunch shows nothing.
  const elements: FakeElement[] = [];
  let current = "about:blank";
  let title = "";
  return {
    async goto(target: string) {
      current = target;
      const fixture = fixtures.get(target) ?? "";
      title = /<title>([^<]*)<\/title>/i.exec(fixture)?.[1] ?? "";
      elements.splice(0, elements.length, ...parseElements(fixture));
    },
    url: () => current,
    async title() {
      return title;
    },
    async evaluate<T>(fn: () => T): Promise<T> {
      // The tool's observe callback reads `document`; this supplies just enough
      // of it for the selector walk to run against the fixture.
      const document = {
        querySelectorAll: () => elements,
      };
      const previous = (globalThis as { document?: unknown }).document;
      (globalThis as { document?: unknown }).document = document;
      try {
        return fn();
      } finally {
        (globalThis as { document?: unknown }).document = previous;
      }
    },
    async click() {},
    async fill() {},
    async selectOption() {},
    async hover() {},
    keyboard: { async press() {} },
    on() {},
    async close() {},
  };
}

interface FakeElement {
  tagName: string;
  id: string;
  type: string;
  placeholder: string;
  value: string;
  textContent: string;
  getAttribute: (name: string) => string | null;
}

/** The interactive elements of a fixture, in the shape the observe walk reads. */
function parseElements(html: string): FakeElement[] {
  const found: FakeElement[] = [];
  const pattern = /<(h1|h2|h3|a|button|input)\b([^>]*)>([^<]*)/gi;
  for (const match of html.matchAll(pattern)) {
    const tag = match[1]!.toLowerCase();
    const attrs = match[2] ?? "";
    const text = (match[3] ?? "").trim();
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const type = /\btype="([^"]*)"/.exec(attrs)?.[1] ?? "text";
    const placeholder = /\bplaceholder="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const role = /\brole="([^"]*)"/.exec(attrs)?.[1] ?? null;
    found.push({
      tagName: tag.toUpperCase(),
      id,
      type,
      placeholder,
      value: "",
      textContent: tag === "input" ? "" : text,
      getAttribute: (name) => (name === "role" ? role : null),
    });
  }
  return found;
}

const sampleHtml = `
  <html>
    <head><title>Test App Dashboard</title></head>
    <body>
      <h1>Welcome to Dashboard</h1>
      <a href="/settings">Settings</a>
      <input type="text" placeholder="Username" id="user-input" />
      <button id="login-btn">Log In</button>
    </body>
  </html>
`;

describe("Unified Browser Tool & Session Manager", () => {
  let manager: BrowserSessionManager;

  beforeEach(() => {
    manager = new BrowserSessionManager({
      admitUrl: (url: string) => ({ allowed: true, url, hostname: new URL(url).hostname }),
      launchPage: async () =>
        createPageDouble(new Map([["http://localhost:3000/dashboard", sampleHtml]])),
    });
  });

  afterEach(async () => {
    await manager.closeSession();
  });

  it("opens URL and observes interactive elements with [ref=eN] markers", async () => {
    const opened = await manager.openUrl("http://localhost:3000/dashboard");

    expect(opened.ok).toBe(true);
    expect(opened.url).toBe("http://localhost:3000/dashboard");
    const state = await manager.observe();
    expect(state.outline).toContain("[ref=e1]");
    expect(state.outline).toContain("Welcome to Dashboard");
    expect(state.outline).toContain("Settings");
    expect(state.outline).toContain("Log In");
  });

  it("observes current page state after navigation", async () => {
    await manager.openUrl("http://localhost:3000/dashboard");
    const state = await manager.observe();

    expect(state.url).toBe("http://localhost:3000/dashboard");
    expect(state.elements.length).toBeGreaterThan(0);
    expect(state.outline).toContain("Page URL: http://localhost:3000/dashboard");
  });

  it("clicks an element by ref and reports what it did", async () => {
    await manager.observe();
    const clicked = await manager.click("e1");

    expect(clicked.ok).toBe(true);
    if (clicked.ok) expect(clicked.output).toContain("Clicked element matching 'e1'");
  });

  it("types text and presses a key", async () => {
    // A page first, which is what a caller with a field to type into has. An
    // action used to launch its own browser when none was open, so this passed
    // without one — against a blank page, after waiting out the locator
    // timeout, and reporting success from whatever the double did with it.
    await manager.openUrl("http://localhost:3000/dashboard");

    const typed = await manager.type("#user-input", "admin");
    expect(typed.ok).toBe(true);
    if (typed.ok) expect(typed.output).toContain('Typed "admin"');

    const pressed = await manager.pressKey("Enter");
    expect(pressed.ok).toBe(true);
    if (pressed.ok) expect(pressed.output).toContain("Pressed key 'Enter'");
  });

  it("refuses an action with no page open instead of launching one", async () => {
    // The launch succeeds, the page is blank, and the action then waits out its
    // full element timeout to report a failure that was knowable immediately.
    const started = Date.now();
    const clicked = await manager.click("e1");
    const elapsed = Date.now() - started;

    expect(clicked.ok).toBe(false);
    if (!clicked.ok) expect(clicked.failure.kind).toBe("not-launched");
    // The double launches instantly, so time alone does not prove the browser
    // was not started; the failure reason does. The bound is what a real launch
    // plus a locator timeout would exceed.
    expect(elapsed).toBeLessThan(1000);
  });

  it("closes the session and releases it", async () => {
    await manager.openUrl("http://localhost:3000/dashboard");
    const closed = await manager.closeSession();

    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.output).toContain("closed");
    const after = await manager.observe();
    expect(after.url).toBe("about:blank");
  });
});

describe("Unified Browser Tool", () => {
  it("refuses a URL the policy does not admit, before any browser starts", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    const result = await tool.execute(
      { action: "open", url: "http://169.254.169.254/latest/meta-data/" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );

    expect(result.success).toBe(false);
    // The refusal has to say which rule fired, or the reader cannot tell a
    // policy decision from a network failure.
    expect(result.error).toContain("link-local address");
    expect(result.error).toContain("Refused: blocked-host");
  });

  it("reports success only for actions that really ran", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    const result = await tool.execute(
      { action: "click", selector: "e1" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );

    // No page was opened, so nothing was clicked. The earlier version answered
    // "Simulated click on element 'e1'" with success: true here.
    expect(result.success).toBe(false);
    expect(result.error).not.toContain("Simulated");
    expect(result.error).toMatch(/Error: /);
    expect(result.error).toMatch(/Next: /);
  });

  it("rejects an unsupported action with the supported list", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    const result = await tool.execute(
      { action: "unsupported_action" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported browser action");
  });
});
