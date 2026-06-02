import { describe, expect, it } from "vitest";

import { dispatchCliHostCommand } from "./runner.js";

describe("cli host runner", () => {
  it("runs a non-interactive host command as structured json", async () => {
    const output = await dispatchCliHostCommand({
      projectRoot: "/workspace",
      commandJson: JSON.stringify({
        action: "start-turn",
        inputText: "read a safe file through cli host",
        mode: "read-only",
        providerMode: "synthetic",
        correlationId: "cli-host-happy",
      }),
    });

    expect(output).toMatchObject({
      schemaVersion: "host-json-response.v1",
      commandId: "cli-host-happy",
      accepted: true,
      terminalSuccessClaim: false,
      exit: {
        classification: "completed-without-proof",
        code: 0,
      },
    });
    expect(output.events.length).toBeGreaterThan(0);
    expect(output.replayFacts?.terminalSuccessClaim).toBe(false);
  });

  it("blocks live provider mode by default with non-success exit classification", async () => {
    const output = await dispatchCliHostCommand({
      projectRoot: "/workspace",
      commandJson: JSON.stringify({
        action: "start-turn",
        inputText: "live provider should stay blocked",
        mode: "read-only",
        providerMode: "real",
        correlationId: "cli-host-provider-block",
      }),
    });

    expect(output.accepted).toBe(false);
    expect(output.blockers[0]).toMatchObject({
      kind: "provider-blocked",
      code: "host.provider.default-off",
      terminalSuccessClaim: false,
    });
    expect(output.exit.classification).toBe("blocked");
    expect(output.terminalSuccessClaim).toBe(false);
  });

  it("keeps malformed input structured and redacted", async () => {
    const output = await dispatchCliHostCommand({
      projectRoot: "/workspace",
      commandJson: "{ action: /home/wang/.private-agents-real/provider.env }",
    });

    expect(output.schemaVersion).toBe("host-json-response.v1");
    expect(output.exit.classification).toBe("internal-error");
    expect(output.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(output)).not.toContain("/home/wang/.private-agents-real");
  });
});
