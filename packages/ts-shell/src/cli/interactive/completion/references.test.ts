import { afterEach, expect, it, vi } from "vitest";
import { CatalogController } from "./controller.js";
import { catalogIdentity, createCatalogLoader } from "./catalog.js";
import { catalogRequest } from "./request.js";
import { listWorkspaceFiles } from "../../../runtime/execution/fileWalk.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

vi.mock("../../../runtime/execution/fileWalk.js", () => ({ listWorkspaceFiles: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

function harness() {
  vi.useFakeTimers();
  let context = { cwd: "/workspace/subdir", projectRoot: "/workspace", session: { id: "one" }, runtimeConfig: {} } as ShellRuntimeContext;
  let draft = { text: "look at @mo", cursor: 11, revision: 1 };
  const pending: Array<(files: readonly string[]) => void> = [];
  vi.mocked(listWorkspaceFiles).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const publish = vi.fn();
  const controller = new CatalogController({ identity: () => catalogIdentity(context), draft: () => draft, load, publish });
  return { controller, publish, pending, draft: () => draft,
    change(text: string) { draft = { text, cursor: text.length, revision: draft.revision + 1 }; },
    switch() { context = { ...context, projectRoot: "/other", session: { ...context.session, id: "two" } }; },
  };
}

it('loads references on demand, debounces edits and refreshes the menu without another key', async () => {
  const h = harness();
  expect(listWorkspaceFiles).not.toHaveBeenCalled();
  expect(h.controller.update(h.draft())).toBe(true);
  h.change('look at @mod'); h.controller.update(h.draft());
  await vi.advanceTimersByTimeAsync(75);
  expect(listWorkspaceFiles).toHaveBeenCalledTimes(1);
  expect(listWorkspaceFiles).toHaveBeenCalledWith('/workspace', expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
  h.pending[0]!(['src/core/model.ts']); await vi.advanceTimersByTimeAsync(0);
  expect(h.publish.mock.lastCall?.[0][0]).toMatchObject({ value: '@src/core/model.ts', edit: { from: 8, text: '@src/core/model.ts ' } });
  h.change('look at @model'); h.controller.update(h.draft());
  await vi.advanceTimersByTimeAsync(75);
  expect(listWorkspaceFiles).toHaveBeenCalledTimes(1);
  h.controller.invalidate();
});

it('caches a successful empty reference listing without duplicate scans', async () => {
  const h = harness(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(listWorkspaceFiles).toHaveBeenCalledTimes(1);
  h.pending[0]!([]); await vi.advanceTimersByTimeAsync(0);
  h.change('look at @missing'); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(listWorkspaceFiles).toHaveBeenCalledTimes(1);
  expect(h.publish.mock.lastCall).toEqual([[], 'No matching entries.']);
  h.controller.invalidate();
});

it.each(['cancel', 'invalidate', 'context'])('cancels the underlying reference walk on %s and rejects late names', async mode => {
  const h = harness(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  const signal = vi.mocked(listWorkspaceFiles).mock.calls[0]?.[1]?.abortSignal;
  expect(signal).toBeDefined();
  if (mode === 'cancel') h.controller.cancel();
  else if (mode === 'invalidate') h.controller.invalidate();
  else { h.switch(); h.controller.update(h.draft()); }
  expect(signal?.aborted).toBe(true);
  h.publish.mockClear(); h.pending[0]!(['private-old-name']); await vi.advanceTimersByTimeAsync(0);
  expect(h.publish).not.toHaveBeenCalled();
  h.controller.invalidate();
});

it('aborts a slow reference walk at the menu deadline and ignores its late success', async () => {
  const h = harness(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(1575);
  expect(h.publish.mock.lastCall).toEqual([[], 'File references timed out.']);
  expect(vi.mocked(listWorkspaceFiles).mock.calls[0]?.[1]?.abortSignal?.aborted).toBe(true);
  h.publish.mockClear(); h.pending[0]!(['late']); await vi.advanceTimersByTimeAsync(0);
  expect(h.publish).not.toHaveBeenCalled(); h.controller.invalidate();
});

it('reports reference errors without exposing filesystem diagnostics', async () => {
  const h = harness(); vi.mocked(listWorkspaceFiles).mockRejectedValueOnce(new Error('PRIVATE_DIRECTORY'));
  h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(h.publish.mock.lastCall).toEqual([[], 'File references unavailable.']);
  h.controller.invalidate();
});

it('keeps each surface isolated across workspaces and invalidates for reload', async () => {
  const h = harness(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(listWorkspaceFiles).toHaveBeenCalledTimes(1);
  h.pending[0]!(['model-old']); await vi.advanceTimersByTimeAsync(0);
  h.switch(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(listWorkspaceFiles).toHaveBeenLastCalledWith('/other', expect.anything());
  h.pending[1]!(['model-new']); await vi.advanceTimersByTimeAsync(0);
  expect(h.publish.mock.lastCall?.[0].map((item: { value: string }) => item.value)).toEqual(['@model-new']);
  h.controller.invalidate(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(listWorkspaceFiles).toHaveBeenCalledTimes(3); h.controller.invalidate();
});

it('preserves command-parameter precedence and ignores email addresses', () => {
  for (const [text, kind] of [['/theme @dark', 'theme'], ['/review @src', 'reference'], ['see @src', 'reference'], ['mail a@b', undefined]] as const) {
    expect(catalogRequest({ text, cursor: text.length, revision: 1 })?.kind).toBe(kind);
  }
});

it('keeps independent surfaces cached under their own workspace identity', async () => {
  const first = harness(); first.controller.update(first.draft()); await vi.advanceTimersByTimeAsync(75);
  first.pending[0]!(['model-first']); await vi.advanceTimersByTimeAsync(0);
  const second = harness(); second.switch(); second.controller.update(second.draft()); await vi.advanceTimersByTimeAsync(75);
  second.pending[0]!(['model-second']); await vi.advanceTimersByTimeAsync(0);
  first.change('@model'); first.controller.update(first.draft());
  expect(first.publish.mock.lastCall?.[0][0]?.value).toBe('@model-first');
  expect(second.publish.mock.lastCall?.[0][0]?.value).toBe('@model-second');
  expect(listWorkspaceFiles).toHaveBeenCalledTimes(2);
  first.controller.invalidate(); second.controller.invalidate();
});
