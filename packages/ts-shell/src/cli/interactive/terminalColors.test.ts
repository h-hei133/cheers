import { expect, it, vi } from 'vitest';
import { InteractiveMode } from './interactiveMode.js';
import { StartupSurface } from './startup.js';
import { Terminal } from '../../presentation/tui/terminal.js';
import { PassThrough } from 'node:stream';
import { RecordingTerminal } from '../../test-utils/terminalDouble.js';
import { withConfiguration } from '../../test-utils/configuration.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { defaultTheme } from '../../presentation/theme/theme.js';
import { beginThemePreview, selectTheme, updateAppearance } from '../../presentation/theme/selection.js';
import type { ColorQueryOptions, TerminalColors } from '../../presentation/tui/input/terminalColors.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { StructuredLogger } from '../../observability/structuredLogger.js';
import type { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import type { CliMcpGateway } from '../../entrypoints/cliMcpModule.js';

function build({ tuiMode, terminal, startup }: {
  tuiMode: 'regular' | 'fullscreen'; terminal: RecordingTerminal; startup?: StartupSurface;
}): { mode: InteractiveMode } {
  return { mode: new InteractiveMode({
    runtimeContext: withConfiguration({ cwd: '/workspace', projectRoot: '/workspace', session: { id: 'palette-session' },
      gitContext: { branch: 'main' }, runtimeConfig: { provider: 'openai', providerCredentials: {}, contextWindow: 64_000,
        configDiagnostics: [], tuiMode } } as unknown as ShellRuntimeContext),
    sessionRuntime: { commands: new ShellCommandRuntime(), observeEvents: () => () => {}, cancelCurrentRun: () => {},
      getAgentMode: () => 'build', getPermissionScope: () => 'ask', getCurrentRunController: () => null,
      terminate: () => {} } as unknown as ShellSessionRuntime,
    sessionManager: { sessionExists: () => false } as unknown as SessionManager,
    renderer: new StreamingRenderer(), logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy, initialMcpGateway: {} as unknown as CliMcpGateway,
    terminal, startup, setInteractiveApprovalPrompt: () => {}, setReadline: () => {},
  }) };
}

it.each(['regular', 'fullscreen'] as const)('applies the queried palette through the actual %s host without overriding explicit themes or previews', async tuiMode => {
  vi.stubEnv('FORCE_COLOR', '3');
  const terminal = new RecordingTerminal();
  let finish: (colors: TerminalColors) => void = () => {};
  const query = vi.fn((_options?: ColorQueryOptions) => new Promise<TerminalColors>(resolve => { finish = resolve; }));
  Object.assign(terminal, { queryTerminalColors: query });
  const start = terminal.start.bind(terminal);
  vi.spyOn(terminal, 'start').mockImplementation((input, resize, disconnect, options) => {
    start(input, resize, disconnect, options); options?.onInputReady?.();
  });
  const { mode } = build({ tuiMode, terminal });
  const palette = Array.from({ length: 16 }, (_, index) => ({ r: index, g: index + 10, b: index + 20 }));
  let preview: ReturnType<typeof beginThemePreview> | undefined;
  mode.start();
  try {
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 100 });
    selectTheme('auto');
    finish({ foreground: { r: 201, g: 202, b: 203 }, background: { r: 10, g: 11, b: 12 }, palette });
    await Promise.resolve();
    expect(defaultTheme.fg('success', 'ok')).toContain('\x1b[38;2;2;12;22m');
    expect(defaultTheme.fg('text', 'text')).toContain('\x1b[38;2;201;202;203m');
    const revision = defaultTheme.colorRevision;
    query.mock.calls[0]?.[0]?.onLateReply?.({ palette });
    expect(defaultTheme.colorRevision).toBe(revision);
    selectTheme('dark'); const explicit = defaultTheme.fg('success', 'ok');
    query.mock.calls[0]?.[0]?.onLateReply?.({ foreground: { r: 211, g: 212, b: 213 } });
    expect(defaultTheme.fg('success', 'ok')).toBe(explicit);
    selectTheme('auto');
    preview = beginThemePreview({ onEnd: () => {} }); preview.show('dark-contrast');
    const previewColor = defaultTheme.fg('text', 'text');
    query.mock.calls[0]?.[0]?.onLateReply?.({ foreground: { r: 221, g: 222, b: 223 } });
    expect(defaultTheme.fg('text', 'text')).toBe(previewColor);
    preview.end(); preview = undefined;
    expect(defaultTheme.fg('text', 'text')).toContain('\x1b[38;2;221;222;223m');
    expect(defaultTheme.fg('success', 'ok')).toContain('\x1b[38;2;2;12;22m');
  } finally { preview?.end(); mode.stop(); selectTheme('dark'); vi.unstubAllEnvs(); vi.restoreAllMocks(); }
});

it.each(['regular', 'fullscreen'] as const)('queries the live palette after adopting the actual %s startup surface', async tuiMode => {
  vi.stubEnv('FORCE_COLOR', '3'); const terminal = new RecordingTerminal();
  const query = vi.fn((_options?: ColorQueryOptions) => Promise.resolve({ foreground: { r: 101, g: 102, b: 103 } }));
  Object.assign(terminal, { queryTerminalColors: query });
  const startup = new StartupSurface(terminal), { mode } = build({ tuiMode, terminal, startup });
  try {
    expect(query).not.toHaveBeenCalled(); mode.start(); selectTheme('auto'); await Promise.resolve();
    expect(query).toHaveBeenCalledOnce(); expect(query.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 100 });
    expect(defaultTheme.fg('text', 'x')).toContain('\x1b[38;2;101;102;103m');
  } finally { mode.stop(); startup.dispose(); selectTheme('dark'); vi.unstubAllEnvs(); }
});

it.each(['regular', 'fullscreen'] as const)('rejects stopped palette answers after a successor actual %s host starts', async tuiMode => {
  vi.stubEnv('FORCE_COLOR', '3');
  const oldTerminal = new RecordingTerminal(), nextTerminal = new RecordingTerminal();
  let oldFinish: (colors: TerminalColors) => void = () => {};
  const oldQuery = vi.fn((_options?: ColorQueryOptions) => new Promise<TerminalColors>(resolve => { oldFinish = resolve; }));
  const nextQuery = vi.fn((_options?: ColorQueryOptions) => Promise.resolve({ foreground: { r: 30, g: 31, b: 32 } }));
  Object.assign(oldTerminal, { queryTerminalColors: oldQuery }); Object.assign(nextTerminal, { queryTerminalColors: nextQuery });
  for (const terminal of [oldTerminal, nextTerminal]) {
    const start = terminal.start.bind(terminal);
    vi.spyOn(terminal, 'start').mockImplementation((input, resize, disconnect, options) => {
      start(input, resize, disconnect, options); options?.onInputReady?.();
    });
  }
  const old = build({ tuiMode, terminal: oldTerminal }).mode;
  let next: InteractiveMode | undefined;
  old.start();
  try {
    expect(oldQuery).toHaveBeenCalledOnce(); old.stop();
    next = build({ tuiMode, terminal: nextTerminal }).mode; next.start(); selectTheme('auto');
    await Promise.resolve();
    expect(nextQuery).toHaveBeenCalledOnce();
    expect(defaultTheme.fg('text', 'text')).toContain('\x1b[38;2;30;31;32m');
    const before = defaultTheme.colorRevision;
    oldFinish({ foreground: { r: 90, g: 91, b: 92 } });
    oldQuery.mock.calls[0]?.[0]?.onLateReply?.({ foreground: { r: 99, g: 98, b: 97 } });
    await Promise.resolve();
    expect(defaultTheme.colorRevision).toBe(before);
    expect(defaultTheme.fg('text', 'text')).toContain('\x1b[38;2;30;31;32m');
  } finally { old.stop(); next?.stop(); selectTheme('dark'); vi.unstubAllEnvs(); vi.restoreAllMocks(); }
});

it.each(['regular', 'fullscreen'] as const)('preserves DEC appearance over cached background during late palette replies in the actual %s host', async tuiMode => {
  const terminal = new RecordingTerminal();
  const query = vi.fn((_options?: ColorQueryOptions) => Promise.resolve({ background: { r: 0, g: 0, b: 0 } }));
  Object.assign(terminal, { queryTerminalColors: query });
  const start = terminal.start.bind(terminal);
  vi.spyOn(terminal, 'start').mockImplementation((input, resize, disconnect, options) => {
    start(input, resize, disconnect, options); options?.onInputReady?.();
  });
  const { mode } = build({ tuiMode, terminal }); mode.start(); selectTheme('auto');
  try {
    terminal.input('\x1b]11;#000000\x07');
    await Promise.resolve(); expect(defaultTheme.name).toBe('dark');
    terminal.input('\x1b[?997;2n'); expect(defaultTheme.name).toBe('light');
    query.mock.calls[0]?.[0]?.onLateReply?.({ foreground: { r: 11, g: 22, b: 33 } });
    expect(defaultTheme.name).toBe('light');
    query.mock.calls[0]?.[0]?.onLateReply?.({ palette: [undefined, undefined, { r: 44, g: 55, b: 66 }] });
    expect(defaultTheme.name).toBe('light');
    query.mock.calls[0]?.[0]?.onLateReply?.({ background: { r: 1, g: 2, b: 3 } });
    terminal.input('\x1b]11;#010203\x07');
    expect(defaultTheme.name).toBe('light');
  } finally { mode.stop(); selectTheme('dark'); updateAppearance('dark'); vi.restoreAllMocks(); }
});

it('keeps a split live appearance report in the same input owner while adopting startup', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
  const terminal = new Terminal();
  vi.spyOn(terminal, 'write').mockImplementation((_text, written) => written?.());
  vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const startup = new StartupSurface(terminal);
  const { mode } = build({ tuiMode: 'fullscreen', terminal: terminal as unknown as RecordingTerminal, startup });
  try {
    input.push('\x1b[?1u'); input.push('\x1b]11;#ff');
    mode.start(); selectTheme('auto');
    input.push('ffff\x07\x1b[?62c'); await Promise.resolve();
    expect(defaultTheme.name).toBe('light');
    expect(startup.state.editor.getText()).toBe('');
  } finally { mode.stop(); startup.dispose(); input.destroy(); selectTheme('dark'); updateAppearance('dark'); vi.restoreAllMocks(); }
});
