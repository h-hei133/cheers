import { describe, expect, it } from "vitest";
import { runAgentCliProcess } from "./process.js";

describe("CLI harness process deadlines", () => {
  it("escalates an ignored termination and reports a timeout rather than a successful command", async () => {
    const result = await runAgentCliProcess({ command: process.execPath,
      args: ["-e", "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 6000)"],
      cwd: process.cwd(), env: {}, timeoutMs: 3000, promptSummary: "timeout fixture" });
    expect(result.output.stdout).toBe("ready");
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    if (process.platform !== "win32") expect(result.signal).toBe("SIGKILL");
    expect(result.durationMs).toBeLessThan(7000);
    expect(result.warnings).toContain("agent-cli-process:timeout");
  }, 10000);

  it("keeps ordinary successful execution distinct from a timeout", async () => {
    const result = await runAgentCliProcess({ command: process.execPath,
      args: ["-e", "process.stdout.write('done')"], cwd: process.cwd(), env: {}, timeoutMs: 3000, promptSummary: "success fixture" });
    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(result.output.stdout).toBe("done");
    expect(result.evidence).toContain("agent-cli-process:direct-command");
  });
});
