import { expect, it } from "vitest";
import { isMcpControl, mcpControl } from "./content.js";

it("uses canonical parser values for busy controls and leaves malformed input to the ordinary error path", () => {
  expect(mcpControl("/mcp -- cancel")).toEqual({ action: "cancel", target: undefined });
  expect(mcpControl("/mcp notifications -- -server")).toEqual({ action: "notifications", target: "-server" });
  expect(mcpControl('/mcp notifications "my server"')).toEqual({ action: "notifications", target: "my server" });
  for (const text of ["/mcp notifications " + String.fromCharCode(92), "/mcp read local uri" + String.fromCharCode(92), "/mcp cancel extra", "/mcp notifications --bad", "/mcp notifications first second"]) {
    expect(isMcpControl(text)).toBe(false);
  }
});
