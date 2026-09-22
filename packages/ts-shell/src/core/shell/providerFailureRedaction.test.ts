import { describe, expect, it } from "vitest";
import { redactProviderFailureDetail } from "./providerFailureRedaction.js";

/**
 * The user's config path is reachable under every name the state directory has
 * had, because an older directory is still read when the current one has no file.
 * A failure message can therefore name any of them, and the redactor has to mask
 * all of them — a pattern that covers only the current name turns the older
 * directories into a leak.
 */
const DIRECTORY_NAMES = [".cheers", ".cheer", ".private-agents", ".coding-agents"];

describe("provider failure redaction", () => {
  it("masks a POSIX config path under every name the state directory has had", () => {
    for (const name of DIRECTORY_NAMES) {
      const path = `/home/wang/${name}/config.json`;
      const redacted = redactProviderFailureDetail(`Failed to parse ${path}: token=x`);

      expect(redacted, name).not.toContain(path);
      expect(redacted, name).toContain("[CHEERS_CONFIG_PATH]");
    }
  });

  it("masks a Windows config path under every name the state directory has had", () => {
    for (const name of DIRECTORY_NAMES) {
      const path = `C:\\Users\\wang\\${name}\\config.json`;
      const redacted = redactProviderFailureDetail(`Failed to parse ${path}: token=x`);

      expect(redacted, name).not.toContain(path);
      expect(redacted, name).toContain("[CHEERS_CONFIG_PATH]");
    }
  });

  it("masks a config path beneath the real provider home", () => {
    const path = "/home/wang/.private-agents-real/.cheers/config.json";
    const redacted = redactProviderFailureDetail(`Failed to parse ${path}`);

    expect(redacted).not.toContain(".private-agents-real/.cheers/config.json");
  });

  it("still redacts the secrets alongside the path", () => {
    const redacted = redactProviderFailureDetail(
      "Failed to parse /home/wang/.cheers/config.json: refresh_token=refresh-secret Authorization: Bearer sk-live",
    );

    expect(redacted).not.toContain("refresh-secret");
    expect(redacted).not.toContain("sk-live");
  });
});
