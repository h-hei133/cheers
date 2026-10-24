import { describe, expect, it, vi } from "vitest";
import { listSlashInvocations, registerSlashCommand, renderUserHelp, getSlashInvocation } from "../../../entrypoints/slashCommandRegistry.js";
import * as registry from "../../../entrypoints/slashCommandRegistry.js";
import { registerCatalogContribution } from '../../../core/catalog/contributions.js';
import * as configuration from "../../../config/runtimeConfig.js";
import { OptionModel } from "../../../presentation/tui/chrome/options.js";
import { parseKeyEvent } from "../../../presentation/tui/input/keys.js";
import { stripAnsi } from "../../../presentation/tui/text/ansi.js";
import { OverlayHost } from "../overlay.js";
import { helpPicker } from "./help.js";
import { opensPicker, pickerFor, type PickerHost } from "./registry.js";
import { visibleWidth } from '../../../presentation/tui/text/measure.js';

describe("command guide", () => {
  it("projects the shared inventory and matches aliases without duplicate choices", async () => {
    const options = await helpPicker().load();
    expect(options.map(option => option.id)).toEqual(listSlashInvocations().filter(item => item.kind !== "alias").map(item => item.invocation));
    expect(options.find(option => option.id === "/back")?.note).toBe("session · interactive");
    const model = new OptionModel(); model.setOptions(options); model.setFilter("/models");
    expect(model.visible.map(option => option.id)).toEqual(["/model"]);
    expect(await helpPicker().apply(["/model"])).toEqual({ draft: "/model " });
    expect(await helpPicker().apply(["/recall"])).toEqual({ draft: "/recall " });
    expect(await helpPicker().apply(["/exit"])).toEqual({ draft: "/exit " });
    for (const name of ["/help", "/?"]) {
      expect(opensPicker(name)).toBe(true);
      expect(pickerFor(name, {} as PickerHost)?.title).toBe("Slash commands");
    }
    expect(opensPicker("/help extra")).toBe(false);
  });

  it("respects the registry's MCP gate", async () => {
    const current = configuration.getRuntimeConfig();
    const read = vi.spyOn(configuration, "getRuntimeConfig").mockReturnValue({ ...current, enableMcpTools: false });
    try { expect((await helpPicker().load()).some(option => option.id === "/mcp")).toBe(false); }
    finally { read.mockRestore(); }
  });

  it("updates open guides on extension changes and releases subscriptions on close", async () => {
    const changed = vi.fn(); const overlay = new OverlayHost(changed); const picker = helpPicker();
    overlay.open(picker);
    await new Promise(resolve => setTimeout(resolve, 0));
    overlay.handlePaste("/guide-alias");
    expect(stripAnsi(overlay.render(100, 24).join("\n"))).toContain("No matching commands");
    const remove = registerSlashCommand({ name: "guide-fixture", aliases: ["guide-alias"], group: "workflow", summary: "A dynamic command" });
    try {
      expect(stripAnsi(overlay.render(100, 24).join("\n"))).toContain("/guide-fixture");
      const apply = vi.fn(); overlay.handleKey(parseKeyEvent("\r"), apply);
      expect(apply).toHaveBeenCalledWith(picker, ["/guide-fixture"]);
      changed.mockClear(); remove(); expect(changed).not.toHaveBeenCalled();
      expect(await picker.apply(["/guide-fixture"])).toBeUndefined();
    } finally { remove(); overlay.close(); }
  });
});


it('scrubs current guide metadata for picker and direct help without altering raw registry entries', async () => {
  const root = '/guide-workspace';
  const summary = `Guide sk-\x1b[31msynthetic-sensitive-description file://${root}/sk-%C2%9B31msynthetic-sensitive-path`;
  const remove = registerSlashCommand({ name: 'guide-safe', aliases: ['guide-safe-alias'], group: 'workflow', summary,
    argumentHint: 'password=synthetic-sensitive-hint', invocations: [{ name: 'guide-named', summary, argumentHint: 'Bearer synthetic-sensitive-token' }] });
  try {
    const picker = helpPicker({ root });
    const options = (await picker.load()).filter(row => row.id.startsWith('/guide-'));
    expect(options.map(({ label, detail, note, searchText }) => ({ label, detail, note, searchText }))).toHaveLength(2);
    expect(JSON.stringify(options)).not.toContain('synthetic-sensitive');
    expect(options.find(row => row.id === '/guide-safe')?.searchText).toBe('/guide-safe-alias');
    const lines: string[] = []; renderUserHelp({ renderLine: line => lines.push(line) }, { root });
    expect(lines.join('\n')).not.toContain('synthetic-sensitive');
    expect(lines.join('\n')).toContain('/guide-named');
    expect(getSlashInvocation('guide-safe')?.summary).toBe(summary);
    expect(await picker.apply(['/guide-safe'])).toEqual({ draft: '/guide-safe ' });
    expect(await picker.apply(['/guide-named'])).toEqual({ draft: '/guide-named ' });
  } finally { remove(); }
});

it('keeps projected command names visible without inserting raw names into the draft', async () => {
  const name = 'sk-synthetic-sensitive-command';
  const remove = registerSlashCommand({ name, aliases: ['sk-synthetic-sensitive-alias'], group: 'workflow', summary: 'A named command' });
  try {
    const picker = helpPicker(), row = (await picker.load()).find(option => option.id === `/${name}`)!;
    expect(row.label).not.toContain('synthetic-sensitive'); expect(row.disabled).toBe(true);
    expect(row.searchText).not.toContain('synthetic-sensitive');
    expect(await picker.apply([`/${name}`])).toBeUndefined();
    const lines: string[] = []; renderUserHelp({ renderLine: line => lines.push(line) });
    expect(lines.join('\n')).not.toContain(name);
  } finally { remove(); }
});

it('does not project an expired session catalog when the shared contribution observer notifies', async () => {
  let stale = false;
  const picker = pickerFor('/help', { commandContext: { cwd: '/guide-workspace', sessionId: 'guide-session',
    admission: () => stale ? 'original binding changed' : undefined } } as PickerHost)!;
  await picker.load(); const publish = vi.fn(), unsubscribe = picker.subscribe?.(publish);
  stale = true; publish.mockClear();
  const read = vi.spyOn(configuration, 'getRuntimeConfig');
  const remove = registerCatalogContribution({ root: '/guide-workspace', sessionId: 'guide-session', commands: [], tools: [], skills: () => [] });
  try { await Promise.resolve(); expect(read).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled(); }
  finally { unsubscribe?.(); read.mockRestore(); remove(); }
});

it('uses the explicit workspace for builtin help visibility as well as contributed commands', async () => {
  const root = '/guide-workspace', config = configuration.getRuntimeConfig();
  const read = vi.spyOn(configuration, 'getRuntimeConfig').mockImplementation(cwd => ({ ...config, enableMcpTools: cwd !== root }));
  try {
    expect((await helpPicker({ root }).load()).some(row => row.id === '/mcp')).toBe(false);
    const lines: string[] = []; renderUserHelp({ renderLine: line => lines.push(line) }, { root });
    expect(lines.join('\n')).not.toContain('/mcp'); expect(read).toHaveBeenCalledWith(root);
  } finally { read.mockRestore(); }
});

it.each(['before', 'after'] as const)('retains original help admission %s loading and subscription changes', async phase => {
  let stale = phase === 'before';
  const read = vi.spyOn(registry, 'listSlashCommands');
  const picker = pickerFor('/help', { commandContext: { cwd: '/guide-workspace', sessionId: 'guide-session', admission: () => stale ? 'original binding changed' : undefined } } as PickerHost)!;
  const publish = vi.fn(); let unsubscribe: (() => void) | undefined;
  try {
    if (phase === 'before') { expect(await picker.load()).toEqual([]); expect(read).not.toHaveBeenCalled(); }
    else { await picker.load(); unsubscribe = picker.subscribe?.(publish); read.mockClear(); publish.mockClear(); stale = true; }
    const remove = registerSlashCommand({ name: 'guide-change', group: 'workflow', summary: 'A change' });
    try {
      expect(picker.isCurrent?.()).toBe(false);
      expect(await picker.apply(['/model'])).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    } finally { remove(); }
  } finally { unsubscribe?.(); read.mockRestore(); }
});

it('requires a single current guide selection while retaining draft-only apply without a prior load', async () => {
  expect(await helpPicker().apply(['/model', '/exit'])).toBeUndefined();
  expect(await helpPicker().apply(['/model'])).toEqual({ draft: '/model ' });
});

it.each([32, 128 * 1024])('keeps repeated help draws separate from registry acquisition and released subscriptions (%i summary bytes)', async bytes => {
  const summary = 'x'.repeat(bytes);
  const remove = registerSlashCommand({ name: 'guide-lifetime', aliases: ['guide-lifetime-alias'], group: 'workflow', summary,
    invocations: [{ name: 'guide-lifetime-named', summary: 'Named lifetime guide' }] });
  const read = vi.spyOn(registry, 'listSlashCommands');
  try {
    for (let round = 0; round < 10; round++) {
      const picker = helpPicker(), load = vi.spyOn(picker, 'load'), changed = vi.fn(), host = new OverlayHost(changed);
      const baseline = read.mock.calls.length;
      host.open(picker);
      let update: (() => void) | undefined;
      try {
        await load.mock.results[0]!.value;
        const retained = host as unknown as { baseOptions: readonly { id: string; detail?: string }[]; model: { total: number }; optionRows: ReadonlyMap<number, unknown> };
        await vi.waitFor(() => expect(retained.baseOptions.some(row => row.id === '/guide-lifetime')).toBe(true));
        // The registry subscription deliberately publishes an initial snapshot,
        // so opening acquires once for load and once for subscription.
        expect(read).toHaveBeenCalledTimes(baseline + 2);
        const row = retained.baseOptions.find(row => row.id === '/guide-lifetime')!;
        expect(row.detail!.length).toBeLessThanOrEqual(4096);
        expect(Buffer.byteLength(JSON.stringify(row))).toBeLessThan(5 * 1024);
        host.handlePaste('guide-lifetime-alias');
        for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
          const frame = host.render(width, height);
          expect(frame.length).toBeLessThanOrEqual(height); expect(frame.every(line => visibleWidth(line) <= width)).toBe(true);
        }
        expect(read).toHaveBeenCalledTimes(baseline + 2);
        update = registerSlashCommand({ name: `guide-update-${round}`, group: 'workflow', summary: 'A live registry update' });
        expect(read).toHaveBeenCalledTimes(baseline + 3);
        expect(retained.baseOptions.some(row => row.id === `/guide-update-${round}`)).toBe(true);
        const apply = vi.fn(); host.handleKey(parseKeyEvent('\x1b'), apply);
        expect(apply).not.toHaveBeenCalled(); expect(host.active).toBe(false);
        expect(retained.baseOptions).toEqual([]); expect(retained.model.total).toBe(0); expect(retained.optionRows.size).toBe(0);
        changed.mockClear(); update(); update = undefined;
        expect(read).toHaveBeenCalledTimes(baseline + 3); expect(changed).not.toHaveBeenCalled();
        expect(registry.getSlashInvocation('guide-lifetime')?.summary).toBe(summary);
      } finally { host.close(); update?.(); }
    }
  } finally { read.mockRestore(); remove(); }
});
