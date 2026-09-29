import { defaultBrowserSessionManager } from "./browser/sessionManager.js";
// The path an action takes when the caller never opened a page.
const m = defaultBrowserSessionManager as unknown as {
  runAction(t: string, v: string, f: unknown): Promise<{ ok: boolean; reason?: string }>;
  currentPage?: unknown;
};
const started = Date.now();
const r = await m.runAction("e1", "click", async () => {});
console.log(`elapsed=${Date.now() - started}ms ok=${r.ok} reason=${r.reason ?? "-"}`);
