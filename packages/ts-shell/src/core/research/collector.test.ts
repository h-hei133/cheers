import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectSources } from "./collector.js";
import { renderCollection } from "./renderer.js";
import { routeSlashCommand } from "../commands/slashRouter.js";
import { approvedResult, deniedResult } from "../tools/toolResultLifecycle.js";
import { formatSearchResults } from "../tools/webSearch.js";

const mocks = vi.hoisted(() => ({ search: vi.fn(), fetch: vi.fn() }));
vi.mock("../tools/webSearch.js", async () => ({
  ...await vi.importActual<typeof import("../tools/webSearch.js")>("../tools/webSearch.js"),
  createWebSearchToolDefinition: () => ({ execute: mocks.search }),
}));
vi.mock("../tools/webFetch.js", () => ({ createWebFetchToolDefinition: () => ({ execute: mocks.fetch }) }));
const context = { taskId: "test", workspaceRoot: "/synthetic/workspace" };
const statement = "This runtime supports local execution with explicit permission checks.";
const searchResults = (...urls: string[]) => approvedResult(formatSearchResults("topic", urls.map((url) => ({ url, title: "Page", snippet: "" }))));

beforeEach(() => {
  mocks.search.mockReset().mockResolvedValue(searchResults());
  mocks.fetch.mockReset().mockResolvedValue(approvedResult(statement));
});

describe("web source collection", () => {
  it("deduplicates canonical URLs before fetch and keeps contradictory excerpts separate", async () => {
    mocks.search.mockResolvedValue(searchResults("https://docs.example/a#one", "https://docs.example/a#two", "https://docs.example/b"));
    mocks.fetch.mockImplementation(async ({ url }) => approvedResult(url.endsWith("/a") ? statement : "This runtime does not support local execution with explicit permission checks."));
    const report = await collectSources("runtime", context);
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledWith({ url: "https://docs.example/a" }, context);
    expect(report.pages.map((page) => page.url)).toEqual(["https://docs.example/a", "https://docs.example/b"]);
    const output = renderCollection(report);
    expect(output).toContain(statement);
    expect(output).toContain("does not support local execution");
    expect(output).toContain("2 pages with excerpts");
    expect(output).not.toMatch(/cross-verified|independent sources|consensus|multi-agent tree search/i);
    expect(report).not.toHaveProperty("verifiedClaims");
  });

  it("does not fetch URLs in query text or result snippets", async () => {
    mocks.search.mockResolvedValue(approvedResult(formatSearchResults("https://query.example/", [{ url: "https://docs.example/a", title: "Page", snippet: "See https://snippet.example/" }])));
    await collectSources("topic", context);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toEqual({ url: "https://docs.example/a" });
  });

  it("excludes failed search output and keeps errors report-safe", async () => {
    mocks.search.mockResolvedValueOnce(deniedResult("- **URL**: https://secret.example/SECRET"))
      .mockRejectedValueOnce(new Error("SECRET response body"));
    const report = await collectSources("topic", context);
    expect(report.queries.map((query) => query.status)).toEqual(["failed", "failed"]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(renderCollection(report)).toContain("0/2 searches completed");
    expect(renderCollection(report)).toContain("No source excerpts collected");
    expect(renderCollection(report)).not.toContain("SECRET");
  });

  it("reports denied, thrown and empty fetches without inventing evidence", async () => {
    mocks.search.mockResolvedValue(searchResults("https://docs.example/a", "https://docs.example/b", "https://docs.example/c"));
    mocks.fetch.mockResolvedValueOnce(deniedResult(statement)).mockRejectedValueOnce(new Error("SECRET"))
      .mockResolvedValueOnce(approvedResult("[Fetched https://docs.example/c successfully, but no readable text was extracted]"));
    const report = await collectSources("topic", context);
    expect(report.pages.map((page) => page.status)).toEqual(["failed", "failed", "empty"]);
    expect(report.pages.every((page) => page.excerpts.length === 0)).toBe(true);
    expect(renderCollection(report)).toContain("0 pages with excerpts; 2 fetches failed; 1 pages without eligible excerpts");
    expect(renderCollection(report)).not.toContain(statement);
  });

  it("bounds queries, pages and excerpts", async () => {
    mocks.search.mockImplementation(async ({ query }) => searchResults(...Array.from({ length: 8 }, (_, i) => `https://docs.example/${query.includes("official") ? "a" : "b"}/${i}`)));
    mocks.fetch.mockResolvedValue(approvedResult(Array.from({ length: 8 }, (_, i) => `${i}: ${statement}`).join("\n")));
    const report = await collectSources("topic", context);
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(report.pages).toHaveLength(6);
    expect(report.pages.every((page) => page.excerpts.length === 5)).toBe(true);
  });

  it.each(["web-research"])("routes /%s to honest help and collection", async (name) => {
    const help = await routeSlashCommand(`/${name}`, { cwd: context.workspaceRoot });
    expect(help?.kind).toBe("local");
    if (help?.kind === "local") expect(help.output).toContain("Web Source Collection (/web-research)");
    expect(mocks.search).not.toHaveBeenCalled();
    const result = await routeSlashCommand(`/${name} topic`, { cwd: context.workspaceRoot });
    if (result?.kind !== "local") throw new Error("Expected local collection");
    expect(result.output).toContain("# Web Source Collection: topic");
    expect(mocks.search.mock.calls[0][1].workspaceRoot).toBe(context.workspaceRoot);
  });

  it.each(["deep-research", "research", "deep"])("requires a bound research runtime for /%s instead of falling back to collection", async name => {
    for (const suffix of ['', ' topic']) {
      const result = await routeSlashCommand(`/${name}${suffix}`, { cwd: context.workspaceRoot });
      expect(result?.kind).toBe('local');
      if (result?.kind === 'local') expect(result.output).toContain('Deep research requires a bound session runtime');
    }
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
