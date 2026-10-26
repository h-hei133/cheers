import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import { pathCatalog, pathTargetExists } from "./paths.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import { replaceDraft } from "../../../presentation/tui/editor/replacement.js";
let root: string;
beforeEach(() => {
  fs.mkdirSync("/tmp/cheers-test", { recursive: true });
  root = fs.mkdtempSync("/tmp/cheers-test/path-catalog-");
  fs.mkdirSync(path.join(root, "space dir")); fs.mkdirSync(path.join(root, "space dir", "child"));
  fs.writeFileSync(path.join(root, "file.txt"), "fixture");
  fs.symlinkSync("space dir", path.join(root, "alias"));
  fs.symlinkSync("missing", path.join(root, "broken"));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
function request(text: string, cursor = text.length) { return catalogRequest({ text, cursor, revision: 1 }); }
it.each([["/cd ", "directory"], ["/workspace attach ", "directory"], ["/workspace use sp", "directory"], ["/report ", "file"], ["/report --outside ", "file"], ["/export md ", "file"], ["/export jsonl --outside ", "file"]])("resolves %s", (text, kind) => { expect(request(text)?.kind).toBe(kind); });
it.each(["/workspace status ", "/cd first extra", "/report --unknown ", "/report first extra", "/export ", "/export html first extra"])("ignores %s", text => { expect(request(text)).toBeUndefined(); });
it("lists a single directory, follows directory links, and never creates destinations", async () => {
  const signal = new AbortController().signal;
  expect((await pathCatalog(root, "", true, signal)).map(item => item.value)).toEqual(["alias/", "space dir/"]);
  expect((await pathCatalog(root, "", false, signal)).map(item => item.value)).toEqual(["alias/", "file.txt", "space dir/"]);
  expect((await pathCatalog(root, "space dir/", true, signal)).map(item => item.value)).toEqual(["space dir/child/"]);
  await expect(pathCatalog(root, "absent/", true, signal)).rejects.toThrow();
  expect(fs.existsSync(path.join(root, "absent"))).toBe(false);
  const abort = new AbortController(); abort.abort();
  await expect(pathCatalog(root, "", true, abort.signal)).rejects.toThrow();
});
it("probes one existing target without enumerating and reports missing or broken targets", () => {
  expect(pathTargetExists(root, "file.txt")).toBe(true);
  expect(pathTargetExists(root, "space dir")).toBe(true);
  expect(pathTargetExists(root, "alias")).toBe(true);
  expect(pathTargetExists(root, "missing")).toBe(false);
  expect(pathTargetExists(root, "broken")).toBe(false);
});
it("keeps the caret inside quotes for continued directory completion", async () => {
  const req = request('/cd "sp')!;
  const item = catalogSuggestions(req, await pathCatalog(root, "", true, new AbortController().signal))[0]!;
  const next = replaceDraft(req.snapshot, item.edit!)!;
  expect(next.text).toBe('/cd "space dir/"');
  expect(next.cursor).toBe(next.text.length - 1);
  const nested = catalogRequest(next)!;
  expect(nested.query).toBe("space dir/");
  const child = catalogSuggestions(nested, await pathCatalog(root, nested.query!, true, new AbortController().signal))[0]!;
  expect(replaceDraft(next, child.edit!)?.text).toBe('/cd "space dir/child/"');
});
it("preserves suffix flags and rejects an invalid insertion cursor", () => {
  const req = request('/export md fi --outside', '/export md fi'.length)!;
  const item = catalogSuggestions(req, [{ value: "file.txt", label: "file.txt", detail: "file" }])[0]!;
  expect(replaceDraft(req.snapshot, item.edit!)?.text).toBe('/export md file.txt --outside');
  expect(replaceDraft(req.snapshot, { ...item.edit!, cursorOffset: -1 })).toBeUndefined();
  expect(replaceDraft(req.snapshot, { ...item.edit!, cursorOffset: 999 })).toBeUndefined();
  expect(replaceDraft(req.snapshot, { ...item.edit!, text: "😀", cursorOffset: 1 })).toBeUndefined();
});

it("resolves command destinations against cwd even when the project root differs", async () => {
  const context = { cwd: root, projectRoot: path.join(root, "space dir"), session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext;
  const load = createCatalogLoader(() => context, { snapshot: async () => ({ clients: [], tools: [] }), refresh: async () => ({ clients: [], tools: [] }) }, []);
  expect((await load("file", new AbortController().signal, "")).map(item => item.value)).toContain("file.txt");
});
