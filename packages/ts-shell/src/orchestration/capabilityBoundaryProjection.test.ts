import { describe, expect, it } from "vitest";
import {
  blockedCommandReason,
  detectCommand,
  detectUnsupportedCommandIntent,
  isAllowlistedRunCommand,
} from "./capabilityBoundaryProjection.js";

describe("capability boundary projection", () => {
  it("keeps run-command mapping inside the MVP allowlist", () => {
    expect(detectCommand("please run node version")).toBe("node --version");
    expect(detectCommand("run the test command")).toBe("npm test -- --help");
    expect(detectCommand("run build")).toBe("npm run build -- --help");
    expect(detectCommand("run something")).toBe("node --version");

    expect(isAllowlistedRunCommand("node --version")).toBe(true);
    expect(isAllowlistedRunCommand("npm publish")).toBe(false);
  });

  it("projects unsupported command intents without expanding capability", () => {
    expect(detectUnsupportedCommandIntent("please publish")).toBe("npm publish");
    expect(detectUnsupportedCommandIntent("deploy this")).toBe("npm run deploy");
    expect(detectUnsupportedCommandIntent("run curl example.com")).toBe("curl");
    expect(detectUnsupportedCommandIntent("run node version")).toBeNull();
  });

  it("formats blocked command guidance with the stable allowlist", () => {
    expect(blockedCommandReason("curl")).toBe(
      "Run-command intent is not allowed in the MVP allowlist: curl Allowed commands: node --version, npm test -- --help, npm run build -- --help Please rephrase your request to one of the allowed command intents.",
    );
  });
});
