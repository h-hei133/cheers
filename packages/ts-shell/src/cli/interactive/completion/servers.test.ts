import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectTrust } from "../../../core/security/projectTrust.js";
import { createCatalogLoader } from "./catalog.js";
import { serverCatalog } from "./servers.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-server-catalog-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
  fs.mkdirSync(path.join(root, ".cheers"));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function request(text: string) { return catalogRequest({ text, cursor: text.length, revision: 1 }); }

describe("MCP server candidate positions", () => {
  it.each(["/mcp tools ", "/mcp doctor f", "/mcp diagnose ", "/mcp refresh ", "/mcp reconnect ", "/mcp tools -- -", "/mcp -- tools "])("accepts %s", text => {
    expect(request(text)?.kind).toBe("mcp");
  });
  it.each(["/mcp ", "/mcp status ", "/mcp unknown ", "/mcp tools first extra", "/mcp tools --bad ", "/mcp tools first "])("does not query for %s", text => {
    expect(request(text)).toBeUndefined();
  });
  it("quotes full names and protects dash-leading targets after an action", () => {
    const items = [{ value: "-full name", label: "fixture" }];
    expect(catalogSuggestions(request("/mcp tools fi")!, items)[0]?.edit?.text).toBe('-- "-full name" ');
    expect(catalogSuggestions(request("/mcp tools -- fi")!, items)[0]?.edit?.text).toBe('"-full name" ');
  });
});

describe("MCP server read ownership", () => {
  it("reads configured names without connecting or exposing endpoint and command data", async () => {
    vi.spyOn(projectTrust, "isProjectUntrusted").mockReturnValue(false);
    const files = [path.join(root, ".cheers", "mcp.json"), path.join(root, ".cheers.mcp.json")];
    fs.writeFileSync(files[0]!, JSON.stringify({ mcpServers: { user: { transport: "http", url: "https://secret.invalid/token" }, duplicate: { enabled: true } } }));
    fs.writeFileSync(files[1]!, JSON.stringify({ mcpServers: { "-full name": { command: "must-never-run", args: ["secret"] }, duplicate: { enabled: false } } }));
    const before = files.map(file => ({ bytes: fs.readFileSync(file), mtime: fs.statSync(file).mtimeMs }));
    const snapshot = vi.fn(async () => { throw new Error("must not connect"); });
    const refresh = vi.fn(async () => { throw new Error("must not refresh"); });
    const context = { cwd: root, projectRoot: root, session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext;
    const load = createCatalogLoader(() => context, { snapshot, refresh }, []);
    const items = await load("mcp", new AbortController().signal);
    expect(items).toEqual([
      { value: "user", label: "user", detail: "user · configured" },
      { value: "duplicate", label: "duplicate", detail: "project · disabled" },
      { value: "-full name", label: "-full name", detail: "project · configured" },
    ]);
    expect(snapshot).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
    files.forEach((file, index) => {
      expect(fs.readFileSync(file)).toEqual(before[index]!.bytes);
      expect(fs.statSync(file).mtimeMs).toBe(before[index]!.mtime);
    });
    vi.mocked(projectTrust.isProjectUntrusted).mockReturnValue(true);
    expect(serverCatalog(root).map(item => item.value)).toEqual(["user", "duplicate"]);
    expect(serverCatalog(root).find(item => item.value === "duplicate")?.detail).toBe("user · configured");
  });
  it("reports unreadable catalogs as failures instead of successful empty data", () => {
    vi.spyOn(projectTrust, "isProjectUntrusted").mockReturnValue(false);
    fs.writeFileSync(path.join(root, ".cheers.mcp.json"), "{invalid");
    expect(() => serverCatalog(root)).toThrow();
  });
});
