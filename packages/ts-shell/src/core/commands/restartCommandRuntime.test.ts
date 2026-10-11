import { describe, expect, it } from 'vitest';
import { runRestartCommand } from './restartCommandRuntime.js';

describe('/restart', () => {
  it('preserves exact startup arguments and reports request separately from replacement', async () => {
    let received: readonly string[] = [];
    const result = await runRestartCommand([], {
      cwd: process.cwd(), sessionId: 'session-1', startupArgs: ['--fullscreen', '--model', 'x'],
      restart: { request: async request => { received = request.argv; return { status: 'requested', request }; } },
    } as never);
    expect(received).toEqual(['--fullscreen', '--model', 'x']);
    expect(result.output).toContain('Restart requested');
    expect(result.output).toContain('recovery remains a separate');
  });
});
