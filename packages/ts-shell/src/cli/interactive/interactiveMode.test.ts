import type { EscalationPrompt } from '../../core/shell/approval/contract.js';
import type { Pager } from '../../presentation/tui/chrome/pager.js';
import { withConfiguration } from "../../test-utils/configuration.js";
import { completionEdit } from "./completion.js";
import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "./interactiveMode.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { RecordingTerminal } from "../../test-utils/terminalDouble.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import type { OverlayHost, Picker } from "./overlay.js";
import type { PickerHost } from "./picker/registry.js";
import type { InteractiveView } from "../../presentation/tui/surface/contract.js";
import * as fileWalk from "../../runtime/execution/fileWalk.js";
import { currentTheme } from '../../presentation/theme/theme.js';
import { isThemePreviewActive, selectTheme } from '../../presentation/theme/selection.js';

function build(overrides: { observeEvents?: () => () => void; exit?: (code?: number) => void } = {}): {
  mode: InteractiveMode;
  renderer: StreamingRenderer;
  readline: { current: unknown };
  terminal: RecordingTerminal;
} {
  const renderer = new StreamingRenderer();
  const readline: { current: unknown } = { current: null };
  const terminal = new RecordingTerminal();
  const mode = new InteractiveMode({
    runtimeContext: withConfiguration({
      cwd: "/workspace",
      projectRoot: "/workspace",
      session: { id: "sess_1" },
      gitContext: { branch: "main" },
      runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64_000, configDiagnostics: [] },
    } as unknown as ShellRuntimeContext),
    sessionRuntime: {
      observeEvents: overrides.observeEvents ?? (() => () => {}),
      cancelCurrentRun: () => {},
      getAgentMode: () => "build",
      getPermissionScope: () => "ask",
      getCurrentRunController: () => null,
      terminate: () => {},
    } as unknown as ShellSessionRuntime,
    sessionManager: { sessionExists: () => false } as unknown as SessionManager,
    renderer,
    logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy,
    initialMcpGateway: {} as unknown as CliMcpGateway,
    terminal,
    exit: overrides.exit,
    setReadline: (value) => {
      readline.current = value;
    },
  });
  return { mode, renderer, readline, terminal };
}

describe("session wiring", () => {
  it('ends an active theme preview before stopping its follower', async () => {
    selectTheme('dark'); const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; pickerHost(): PickerHost; theme: { refresh(): void; stop(): void } };
    const refresh = vi.spyOn(host.theme, 'refresh'); const stop = vi.spyOn(host.theme, 'stop');
    const lease = host.pickerHost().themes!.begin();
    host.overlay.open({ title: 'Theme preview', form: 'panel', empty: '', load: async () => [{ id: 'light', label: 'Light' }],
      apply: async () => undefined, previewChange: () => { lease.show('light'); }, previewEnd: lease.end });
    await Promise.resolve(); await Promise.resolve(); expect(currentTheme()).toBe('light');
    mode.stop(); expect(currentTheme()).toBe('dark'); expect(isThemePreviewActive()).toBe(false);
    expect(refresh.mock.invocationCallOrder.at(-1)).toBeLessThan(stop.mock.invocationCallOrder.at(-1)!);
    refresh.mockClear(); selectTheme('light'); expect(lease.show('dark')).toBe(false); lease.end();
    expect(refresh).not.toHaveBeenCalled(); selectTheme('dark');
  });

  it("loads file references only on demand and accepts the async quoted candidate without submission", async () => {
    const walk = vi.spyOn(fileWalk, "listWorkspaceFiles").mockResolvedValue(['my file.ts']);
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      expect(walk).not.toHaveBeenCalled();
      terminal.input('@my');
      await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe('@my file.ts'));
      terminal.input('\t');
      expect(host.view.editor.getText()).toBe('@"my file.ts" ');
      expect(submit).not.toHaveBeenCalled();
      expect(walk).toHaveBeenCalledTimes(1);
    } finally { mode.stop(); walk.mockRestore(); }
  });

  it.each(['escape', 'stop'])('cancels a pending reference walk on actual %s and ignores late results', async action => {
    let resolve!: (files: readonly string[]) => void;
    const walk = vi.spyOn(fileWalk, "listWorkspaceFiles").mockImplementation(() => new Promise(done => { resolve = done; }));
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView };
    mode.start();
    try {
      terminal.input('@late');
      await vi.waitFor(() => expect(walk).toHaveBeenCalledTimes(1));
      const signal = walk.mock.calls[0]?.[1]?.abortSignal;
      if (action === 'stop') mode.stop(); else terminal.input('\x1b');
      // A lone Escape is dispatched after the input buffer's sequence timeout.
      await vi.waitFor(() => expect(signal?.aborted).toBe(true));
      resolve(['late-file']);
      await new Promise(done => setTimeout(done, 0));
      expect(host.view.suggestions.current()?.value).not.toBe('@late-file');
    } finally { mode.stop(); walk.mockRestore(); }
  });

  it.each([["cp", "[text]"], ["recall", "<query>"], ["retain", "<statement>"]])("keeps /%s usage informational and submits the literal body once", (name, hint) => {
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      terminal.input(`/${name} `);
      expect(host.view.suggestionsOpen).toBe(false);
      expect(stripAnsi(host.view.renderFrame({ columns: 100, rows: 24 }).rows.join("\n"))).toContain(`Usage: /${name} ${hint}`);
      terminal.input("\t");
      expect(submit).not.toHaveBeenCalled();
      expect(host.view.editor.getText()).toBe(`/${name} `);
      const body = "  a  'quote'\\path\n\t中文  ";
      terminal.input(`\x1b[200~${body}\x1b[201~`);
      terminal.input("\r");
      expect(submit).toHaveBeenCalledOnce();
      expect(submit.mock.calls[0]?.[0]).toBe(`/${name} ` + body);
      terminal.input("/btw ");
      const next = stripAnsi(host.view.renderFrame({ columns: 100, rows: 24 }).rows.join("\n"));
      expect(next).toContain("Usage: /btw <question>");
      expect(next).not.toContain(`Usage: /${name}`);
    } finally { mode.stop(); }
  });

  it("publishes a loaded theme menu without another key and accepts without submission", async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      terminal.input("/theme dark-c");
      await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe("dark-contrast"));
      terminal.input("\t");
      expect(host.view.editor.getText()).toBe("/theme dark-contrast ");
      expect(submit).not.toHaveBeenCalled();
    } finally { mode.stop(); }
  });

  it.each(["panel", "modal"] as const)("routes actual mouse input to %s rows without applying on click", async (form) => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView };
    const apply = vi.fn(async () => undefined);
    mode.start();
    try {
      host.overlay.open({ title: "Mouse choices", form, empty: "none", apply,
        load: async () => [{ id: "a", label: "alpha-choice" }, { id: "b", label: "beta-choice" }],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const frame = host.view.renderFrame({ columns: 80, rows: 24 });
      const row = frame.rows.findIndex((line) => stripAnsi(line).includes("beta-choice"));
      expect(row).toBeGreaterThan(0);
      terminal.input(`\x1b[<0;6;${row + 1}M\x1b[<0;6;${row + 1}m`);
      expect(apply).not.toHaveBeenCalled();
      terminal.input("\r");
      await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(["b"]));
    } finally { mode.stop(); }
  });

  it("routes a completion click through selection and Enter acceptance without submission", () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      host.view.editor.setText("/m");
      host.view.suggestions.setItems([{ value: "/model", label: "model-choice" }, { value: "/memory", label: "memory-choice" }].map(candidate => completionEdit(candidate, host.view.editor.snapshot(), 0, 2)));
      host.view.setSuggesting(true);
      const frame = host.view.renderFrame({ columns: 80, rows: 24 });
      const row = frame.rows.findIndex((line) => stripAnsi(line).includes("memory-choice"));
      expect(row).toBeGreaterThan(0);
      terminal.input(`\x1b[<0;6;${row + 1}M\x1b[<0;6;${row + 1}m`);
      expect(host.view.editor.getText()).toBe("/m");
      terminal.input("\r");
      expect(host.view.editor.getText()).toBe("/memory ");
      expect(host.view.suggestions.current()?.value).toBe("inspect");
      expect(submit).not.toHaveBeenCalled();
    } finally { mode.stop(); }
  });

  it.each([
    ["navigation", "dismiss"], ["navigation", "confirm"],
    ["command", "dismiss"], ["command", "confirm"],
  ])("opens queued back selectors after %s and resumes the queue after %s", async (operation, action) => {
    const { mode, terminal } = build();
    const host = mode as unknown as {
      busy: boolean;
      queue: string[];
      overlay: OverlayHost;
      pickerHost(): PickerHost;
      applyPicker(picker: Picker, ids: readonly string[]): void;
      run(text: string): Promise<void>;
    };
    let finishNext!: () => void;
    const nextNavigation = new Promise<undefined>((resolve) => { finishNext = () => resolve(undefined); });
    const rewind = vi.fn(() => nextNavigation);
    vi.spyOn(host, "pickerHost").mockReturnValue({
      sessionTurns: () => [
        { id: "first", role: "user", content: "First question" },
        { id: "second", role: "user", content: "Second question" },
      ], rewind,
    } as unknown as PickerHost);
    let finish!: () => void;
    const navigation = new Promise<undefined>((resolve) => { finish = () => resolve(undefined); });
    const run = host.run.bind(host);
    const dispatched = vi.spyOn(host, "run").mockImplementation((text) => text === "/help" ? Promise.resolve() : run(text));
    mode.start();
    try {
      host.applyPicker({ title: "Session tree", form: "modal", empty: "", exclusive: true,
        load: async () => [], apply: async () => {
          await navigation;
          if (operation === "command") await host.run("/resume missing-synthetic-session");
          return undefined;
        },
      }, ["first"]);
      host.queue.push("/back 2", "/help");
      expect(host.busy).toBe(true);
      expect(dispatched).not.toHaveBeenCalled();
      finish();
      await vi.waitFor(() => expect(host.overlay.active).toBe(true));
      expect(stripAnsi(host.overlay.render(100, 30).join("\n"))).toContain("Ask again from");
      expect(dispatched).not.toHaveBeenCalledWith("/help");
      if (action === "confirm") {
        terminal.input("\r");
        await vi.waitFor(() => expect(rewind).toHaveBeenCalledWith(expect.objectContaining({ entryId: "first" })));
        expect(dispatched).not.toHaveBeenCalledWith("/help");
        finishNext();
      } else {
        terminal.input("\x1b");
        expect(rewind).not.toHaveBeenCalled();
      }
      await vi.waitFor(() => expect(dispatched).toHaveBeenCalledWith("/help"));
      expect(host.queue).toEqual([]);
    } finally { mode.stop(); }
  });

  it("does not submit buffered keys after an exit key in the same chunk", async () => {
    const { mode, terminal } = build();
    let finish!: () => void;
    Object.assign(terminal, { drainInput: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const submit = vi.spyOn(mode as unknown as { onSubmit(text: string): void }, "onSubmit").mockImplementation(() => {});
    mode.start();
    terminal.input("\x04should-not-submit\r\x1b[200~pasted\x1b[201~\r");
    expect(submit).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(terminal.stopped).toBe(true));
  });

  it("waits for late input before closing the terminal on user exit", async () => {
    const { mode, terminal } = build();
    let finish!: () => void;
    const drain = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    Object.assign(terminal, { drainInput: drain });
    mode.start();
    terminal.input("\x04");
    terminal.input("\x04");
    expect(drain).toHaveBeenCalledOnce();
    expect(terminal.stopped).toBe(false);
    finish();
    await vi.waitFor(() => expect(terminal.stopped).toBe(true));
  });

  it("installs a readline stand-in that can answer runtime questions", () => {
    // Runtime code asks through readline.question; without a working stand-in the
    // approval flow throws instead of prompting.
    const { readline } = build();
    const stub = readline.current as { question?: unknown; close?: unknown };
    expect(typeof stub.question).toBe("function");
    expect(typeof stub.close).toBe("function");
  });

  it("subscribes to the structured event stream on start", () => {
    const observeEvents = vi.fn(() => () => {});
    const { mode } = build({ observeEvents });
    mode.start();
    expect(observeEvents).toHaveBeenCalledOnce();
    mode.stop();
  });

  it("leaves the renderer writing to stdout while idle", () => {
    const { mode, renderer } = build();
    mode.start();
    expect(renderer.captured).toBe(false);
    mode.stop();
  });
  it("releases the session event subscription on stop", () => {
    let released = 0;
    const { mode } = build({ observeEvents: () => () => {
      released += 1;
    } });
    mode.start();
    mode.stop();
    mode.stop();
    expect(released).toBe(1);
  });
  it("cleans up host resources when the terminal disconnects", () => {
    const exit = vi.fn();
    const { mode, renderer, readline, terminal } = build({ exit });
    mode.start();
    terminal.disconnect();
    expect(exit).toHaveBeenCalledWith(0);
    expect(terminal.stopped).toBe(true);
    expect(renderer.captured).toBe(false);
    const readlineInterface = readline.current;
    expect(readlineInterface && typeof readlineInterface === "object" && "close" in readlineInterface).toBe(true);
    mode.stop();
  });
});

describe("terminal attention", () => {
  it("sets the window title to the session and project on start", () => {
    const { mode, terminal } = build();
    mode.start();
    // One OSC 0 write naming the session and the project directory, so a
    // tab among many says which conversation it holds.
    const title = terminal.writes.find((write) => write.startsWith("\x1b]0;"));
    expect(title).toBeDefined();
    expect(title).toContain("sess_1");
    expect(title).toContain("workspace");
  });
});

describe("attention on idle", () => {
  it("leaves a session quiet when the flag is off, which is the default", () => {
    const { mode, terminal } = build();
    mode.start();
    // The build helper sets no attentionOnIdle, so the default — off — is
    // what runs. The title write happens once at start and nothing after it
    // may carry a BEL: a bell that fires when nobody asked is the failure.
    const title = terminal.writes.find((write) => write.startsWith("\x1b]0;"));
    const afterTitle = terminal.writes.slice(terminal.writes.indexOf(title!) + 1);
    expect(afterTitle.some((write) => write.includes("\x07"))).toBe(false);
  });
});


it('keeps real wheel and bracketed paste input in the reader and restores the untouched draft', async () => {
  const { mode, terminal } = build();
  const host = mode as unknown as { pager: Pager; view: InteractiveView; onSubmit(text: string): void };
  const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
  mode.start();
  try {
    host.view.editor.setText('untouched draft');
    host.pager.open('/log', Array.from({ length: 60 }, (_, i) => `record-${i}`).join('\n'));
    host.view.renderFrame({ columns: 80, rows: 24 });
    terminal.input('\x1b[<65;6;6M');
    expect(stripAnsi(host.view.renderFrame({ columns: 80, rows: 24 }).rows[2]!)).toContain('record-3');
    terminal.input('\x1b[200~record-42\x1b[201~');
    const filtered = stripAnsi(host.view.renderFrame({ columns: 80, rows: 24 }).rows.join('\n'));
    expect(filtered).toContain('record-42'); expect(filtered).not.toContain('record-3');
    expect(host.view.editor.getText()).toBe('untouched draft'); expect(submit).not.toHaveBeenCalled();
    terminal.input('\x1b'); await vi.waitFor(() => expect(host.pager.active).toBe(false));
    terminal.input('!'); expect(host.view.editor.getText()).toBe('untouched draft!');
    expect(submit).not.toHaveBeenCalled();
  } finally { mode.stop(); }
});


it('yields a reader to runtime questions, permission prompts and queued pickers', async () => {
  const { mode, terminal } = build();
  const host = mode as unknown as { pager: Pager; view: InteractiveView; onQuestion(text: string): void;
    promptApproval(prompt: EscalationPrompt): Promise<unknown>; run(text: string): Promise<void>; openPicker(text: string, wait: boolean): void };
  const open = () => host.pager.open('/log', 'read only');
  mode.start();
  try {
    open(); host.onQuestion('Need an answer'); expect(host.pager.active).toBe(false);
    expect(host.view.editor.placeholder).toContain('Answer above');
    open();
    const decision = host.promptApproval({ id: 'reader-approval', title: 'Write', message: 'Confirm action',
      context: { toolName: 'edit', operation: 'write', target: 'file.ts' }, options: [], defaultOption: 'deny',
      recommendedAction: 'deny', severity: 'medium' });
    expect(host.pager.active).toBe(false);
    await Promise.resolve(); await Promise.resolve();
    expect(stripAnsi(host.view.renderFrame({ columns: 80, rows: 24 }).rows.join('\n'))).toContain('Permission: edit');
    terminal.input('\x1b');
    await expect(decision).resolves.toEqual({ decision: 'deny' });
    open(); const picker = vi.spyOn(host, 'openPicker').mockImplementation(() => {});
    await host.run('/settings');
    expect(host.pager.active).toBe(false); expect(picker).toHaveBeenCalledWith('/settings', true);
    open(); mode.stop(); expect(host.pager.active).toBe(false);
  } finally { mode.stop(); }
});
