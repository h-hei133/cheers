import { expect, it } from "vitest";
import { readFileSync } from 'node:fs';
import { executeLocally } from "./local.js";

it('delivers literal stdin bytes and closes the stream, including empty input', async () => {
  for (const input of ['', '中文\0quote"\ttab\nline\\end']) {
    const result = await executeLocally({ command: process.execPath,
      args: ['-e', 'process.stdin.pipe(process.stdout)'], cwd: process.cwd(), input, timeoutMs: 1000 });
    expect(result).toMatchObject({ status: 'completed', stdout: input });
  }
});

it('handles a child that exits before consuming its stdin without an unhandled pipe error', async () => {
  const result = await executeLocally({ command: process.execPath,
    args: ['-e', 'process.exit(1)'], cwd: process.cwd(), input: 'x'.repeat(2 * 1024 * 1024), timeoutMs: 1000 });
  expect(result).toMatchObject({ status: 'failed', exitCode: 1 });
});

it.skipIf(process.platform === "win32").each([false, true])(
  "allows graceful TERM exit and escalates an ignoring child (ignores: %s)", async ignores => {
    const controller = new AbortController();
    let pid: number | undefined;
    let output = "";
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const script = [
      `process.on("SIGTERM", () => { process.stdout.write("TERM\\n"); ${ignores ? "" : 'setTimeout(() => { process.stdout.write("flushed\\n"); process.exit(0); }, 150);'} });`,
      'setInterval(() => {}, 1000);',
      'process.stdout.write(`READY:${process.pid}\\n`);',
    ].join("\n");
    try {
      const result = executeLocally({ command: process.execPath, args: ["-e", script], cwd: process.cwd(),
        abortSignal: controller.signal, onOutput: chunk => {
          output += chunk;
          const match = /READY:(\d+)\n/.exec(output);
          if (match && !controller.signal.aborted) { pid = Number(match[1]); controller.abort(); }
        },
      });
      const value = await Promise.race([result, new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error("child cleanup did not finish")), 5000);
      })]);
      expect(value.status).toBe("cancelled");
      expect(value.stdout).toContain("TERM\n");
      if (!ignores) {
        expect(value.stdout).toContain("flushed\n");
        expect(value.exitCode).toBe(0);
      } else expect(value.exitCode).toBeNull();
      expect(() => process.kill(pid!, 0)).toThrow();
    } finally {
      clearTimeout(deadline);
      if (pid) { try { process.kill(-pid, "SIGKILL"); } catch { /* Already reaped. */ } }
    }
  },
);

it.skipIf(process.platform !== 'linux')('cleans a descendant with ignored stdio after its service leader exits normally', async () => {
  const script = [
    `const { spawn } = require('node:child_process');`,
    `const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });`,
    `console.log(child.pid);`,
    `setTimeout(() => process.exit(0), 50);`,
  ].join('\n');
  const result = await executeLocally({ command: process.execPath, args: ['-e', script], cwd: process.cwd(), cleanupTreeOnExit: true, timeoutMs: 3000 });
  const descendant = Number(result.stdout.trim());
  try {
    expect(result.status).toBe('completed'); expect(descendant).toBeGreaterThan(1);
    let running = false;
    try { running = !/^State:\s+[ZX]/m.test(readFileSync(`/proc/${descendant}/status`, 'utf8')); } catch { /* The child has been reaped. */ }
    expect(running).toBe(false);
  } finally { try { process.kill(descendant, 'SIGKILL'); } catch { /* Already gone. */ } }
});
