import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defaultBrowserSessionManager } from "../../browser/browserSessionManager.js";
import { createUnifiedBrowserToolDefinition } from "./browserToolUnified.js";

describe("Unified Browser Tool & Session Manager", () => {
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

  beforeEach(() => {
    defaultBrowserSessionManager.setMockHtml(sampleHtml, "http://localhost:3000/dashboard");
  });

  afterEach(async () => {
    await defaultBrowserSessionManager.closeSession();
  });

  it("opens URL and observes interactive elements with [ref=eN] markers", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    const result = await tool.execute(
      { action: "open", url: "http://localhost:3000/dashboard" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Navigated to `http://localhost:3000/dashboard`");
    expect(result.output).toContain("[ref=e1]");
    expect(result.output).toContain("Welcome to Dashboard");
    expect(result.output).toContain("Settings");
    expect(result.output).toContain("Log In");
  });

  it("observes current page state using observe action", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    const result = await tool.execute(
      { action: "observe" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Browser Page State (`http://localhost:3000/dashboard`)");
    expect(result.output).toContain("[ref=e");
  });

  it("clicks element by ref or CSS selector", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    // 1. Observe first to generate refs
    await tool.execute({ action: "observe" }, { workspaceRoot: "/workspace", taskId: "task-1" });

    // 2. Click ref
    const clickRes = await tool.execute(
      { action: "click", selector: "e1" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );
    expect(clickRes.success).toBe(true);
    const matched = clickRes.output.includes("Clicked element") || clickRes.output.includes("Simulated click");
    expect(matched).toBe(true);
  });

  it("types text and presses keyboard keys", async () => {
    const tool = createUnifiedBrowserToolDefinition();

    const typeRes = await tool.execute(
      { action: "type", selector: "#user-input", text: "admin" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );
    expect(typeRes.success).toBe(true);

    const pressRes = await tool.execute(
      { action: "press", key: "Enter" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );
    expect(pressRes.success).toBe(true);
  });

  it("closes browser session cleanly", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    const result = await tool.execute(
      { action: "close" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("closed");
  });

  it("rejects unsupported action with helpful guide", async () => {
    const tool = createUnifiedBrowserToolDefinition();
    const result = await tool.execute(
      { action: "unsupported_action" },
      { workspaceRoot: "/workspace", taskId: "task-1" },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported browser action");
  });
});
