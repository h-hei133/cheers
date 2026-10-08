import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../../session/SessionManager.js";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../../../session/store/sessionFileLayout.js";
import * as navigation from "../../../session/query/navigation.js";
import { navigationCatalog } from "./navigation.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-catalog-navigation-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function request(text: string) { return catalogRequest({ text, cursor: text.length, revision: 1 }); }

describe("navigation candidate positions", () => {
  it.each([
    ["/resume ", "session"], ["/session use ", "session"], ["/sessions switch s", "session"],
    ["/delete ", "session"], ["/session delete ", "session"], ["/session rename ", "session"],
    ["/resume fork ", "session"], ["/fork ", "session"], ["/tree ", "tree"],
    ["/entries ", "entry"], ["/entries tree ", "thread"], ["/resume -- s", "session"],
  ])("resolves %s to the correct catalog", (text, kind) => { expect(request(text)?.kind).toBe(kind); });

  it.each(["/resume list ", "/resume current ", "/resume help ", "/tree help ", "/entries help ",
    "/resume switch first extra", "/entries tree first extra", "/resume -- switch extra", "/fork here extra"])("does not query for %s", text => {
    expect(request(text)).toBeUndefined();
  });

  it("retains fixed actions and inserts full IDs when matching a title", () => {
    const req = request("/resume ")!;
    expect(catalogSuggestions(req, []).map(item => item.value)).toContain("switch");
    expect(catalogSuggestions(request("/fork ")!, []).map(item => item.value)).toContain("here");
    const item = catalogSuggestions(request("/resume unique")!, [{ value: "sess_full_stable_identifier", label: "unique title", detail: "session" }])[0]!;
    expect(item.edit?.text).toBe("sess_full_stable_identifier ");
  });
});

describe("navigation catalog read ownership", () => {
  it("uses persisted IDs and leaves session, branch and transcript bytes unchanged", async () => {
    const manager = new SessionManager();
    const session = manager.createNew(root);
    manager.addTurn(session.id, { role: "user", content: "Catalog first question" });
    manager.addTurn(session.id, { role: "assistant", content: "Catalog answer" });
    manager.renameSession(session.id, "Catalog title");
    const context = { session, cwd: root, projectRoot: root } as ShellRuntimeContext;
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
    const files = [layout.metadataPath, layout.statePath, layout.transcriptPath];
    const before = files.map(file => ({ bytes: fs.readFileSync(file), mtime: fs.statSync(file).mtimeMs }));
    expect(await navigationCatalog("session", context, manager)).toContainEqual(expect.objectContaining({ value: session.id, label: "Catalog title" }));
    expect((await navigationCatalog("entry", context, manager)).map(item => item.value)).toEqual(manager.getTranscriptEvents(session.id).flatMap(event => event.id ? [event.id] : []));
    const actual = navigation.readSessionNavigation(session.id, root);
    expect((await navigationCatalog("thread", context, manager)).map(item => item.value)).toEqual(actual.thread.entries.map(entry => entry.id));
    expect((await navigationCatalog("tree", context, manager)).map(item => item.value)).toEqual(actual.points.filter(point => !point.unavailable).map(point => point.entryId));
    files.forEach((file, index) => {
      expect(fs.readFileSync(file)).toEqual(before[index]!.bytes);
      expect(fs.statSync(file).mtimeMs).toBe(before[index]!.mtime);
    });
  });

  it("never offers an unavailable navigation target", async () => {
    vi.spyOn(navigation, "readSessionNavigation").mockReturnValue({ thread: { entries: [] }, points: [
      { entryId: "safe", label: "safe branch", current: false, depth: 0 },
      { entryId: "broken", label: "broken branch", current: false, depth: 0, unavailable: "broken ancestry" },
    ] } as ReturnType<typeof navigation.readSessionNavigation>);
    const context = { session: { id: "fixture" }, cwd: root } as ShellRuntimeContext;
    expect((await navigationCatalog("tree", context, {} as SessionManager)).map(item => item.value)).toEqual(["safe"]);
  });

  it('keeps valid session candidates and a partial notice when another stored record is unreadable', async () => {
    const manager = new SessionManager(); const session = manager.createNew(root);
    manager.addTurn(session.id, { role: 'user', content: 'Known saved conversation' });
    const other = manager.createNew(root + '-other');
    fs.writeFileSync(locateExistingSessionLayout(createSessionStoreLayout(), other.id).metadataPath, 'invalid');
    const context = { session, cwd: root, projectRoot: root } as ShellRuntimeContext;
    const progress = vi.fn();
    const suggestions = await navigationCatalog('session', context, manager, undefined, undefined, progress);
    expect(suggestions.map(item => item.value)).toContain(session.id);
    expect(progress.mock.calls[0]?.[0]).toMatchObject({ status: expect.stringContaining('incomplete') });
    expect(progress.mock.lastCall?.[0]).toMatchObject({ status: expect.stringContaining('1 unreadable') });
  });
});
