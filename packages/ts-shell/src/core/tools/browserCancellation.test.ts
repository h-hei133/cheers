import { afterEach, expect, it, vi } from "vitest";
import { createUnifiedBrowserToolDefinition } from "./browserToolUnified.js";
import { defaultBrowserSessionManager as manager } from "../../browser/sessionManager.js";

const page = vi.hoisted(() => ({
  goto: vi.fn(async () => {}), url: () => "http://localhost/", title: vi.fn(async () => "Local"),
  evaluate: vi.fn(async () => []), close: vi.fn(async () => {}), on: vi.fn(),
  click: vi.fn(async () => {}), fill: vi.fn(async () => {}), selectOption: vi.fn(async () => {}),
  hover: vi.fn(async () => {}), keyboard: { press: vi.fn(async () => {}) },
}));
vi.mock("../../browser/sessionManager.js", async () => {
  const original = await vi.importActual<typeof import("../../browser/sessionManager.js")>("../../browser/sessionManager.js");
  const { admitBrowserUrl } = await import("../../browser/urlAdmission.js");
  return { ...original, defaultBrowserSessionManager: new original.BrowserSessionManager({ admitUrl: admitBrowserUrl, launchPage: async () => ({ ...page }) }) };
});
afterEach(async () => { await manager.closeSession(); vi.clearAllMocks(); });

it.each(["open", "observe", "click", "type", "select", "hover", "press", "close"])("passes pre-cancellation through %s", async (action) => {
  const controller = new AbortController();
  controller.abort();
  const result = await createUnifiedBrowserToolDefinition().execute(
    { action, url: "http://localhost/", selector: "#go", value: "yes", key: "Enter" },
    { taskId: "pre-cancel", workspaceRoot: "/workspace", abortSignal: controller.signal },
  );
  expect(result).toMatchObject({ success: false, metadata: { browserAction: { state: "cancelled", activity: "not-started", effect: "none", cleanup: "not-needed" } } });
  expect(page.goto).not.toHaveBeenCalled();
  expect(page.evaluate).not.toHaveBeenCalled();
  expect(page.close).not.toHaveBeenCalled();
});

it("does not observe after navigation cancels, and preserves confirmed navigation", async () => {
  const controller = new AbortController();
  page.goto.mockImplementationOnce(async () => { controller.abort(); });
  const result = await createUnifiedBrowserToolDefinition().execute(
    { action: "open", url: "http://localhost/" },
    { taskId: "navigate", workspaceRoot: "/workspace", abortSignal: controller.signal },
  );
  expect(result).toMatchObject({ success: false, metadata: { browserAction: { state: "cancelled", effect: "confirmed", cleanup: "complete" } } });
  expect(result.error).toContain("not rolled back");
  expect(page.evaluate).not.toHaveBeenCalled();
  expect(page.close).toHaveBeenCalled();
});

it("reports failed observation from the tool instead of an approved empty list", async () => {
  page.evaluate.mockRejectedValueOnce(new Error("disconnected"));
  const result = await createUnifiedBrowserToolDefinition().execute(
    { action: "observe" }, { taskId: "observe", workspaceRoot: "/workspace" },
  );
  expect(result.success).toBe(false);
  expect(result.error).toContain("could not be observed");
});

it("preserves a failed explicit close in tool evidence", async () => {
  await manager.openUrl("http://localhost/");
  page.close.mockRejectedValueOnce(new Error("still open"));
  const result = await createUnifiedBrowserToolDefinition().execute(
    { action: "close" }, { taskId: "close", workspaceRoot: "/workspace" },
  );
  expect(result).toMatchObject({ success: false, metadata: { browserAction: { cleanup: "failed" } } });
});
