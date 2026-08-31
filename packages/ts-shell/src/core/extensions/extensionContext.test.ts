import { describe, it, expect, beforeEach } from "vitest";
import { DefaultExtensionRunner } from "./extensionContext.js";

describe("ExtensionContext and Runner", () => {
  let runner: DefaultExtensionRunner;

  beforeEach(() => {
    runner = new DefaultExtensionRunner();
  });

  it("registers and retrieves custom extension commands", async () => {
    let executed = false;
    runner.createContext("/workspace", "sess_1").registerCommand({
      name: "mycmd",
      description: "Test command",
      async execute(_args, _ctx) {
        executed = true;
      },
    });

    const cmd = runner.getCommand("mycmd");
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe("mycmd");

    const ctx = runner.createContext("/workspace", "sess_1");
    await cmd?.execute("", ctx);
    expect(executed).toBe(true);
  });

  it("registers and lists custom extension tools", () => {
    const ctx = runner.createContext("/workspace", "sess_1");
    ctx.registerTool({
      name: "custom_echo",
      description: "Echoes input",
      parameters: { type: "object" },
      async execute(args, _ctx) {
        return String(args.msg || "");
      },
    });

    const tools = runner.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("custom_echo");
  });
});
