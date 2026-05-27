import { describe, expect, it } from "vitest";

import {
  detectVerifyCommand,
  hasExternalVerifyOptOut,
  isVerifyLikeCommand,
} from "./commandIntentPolicy.js";

describe("commandIntentPolicy", () => {
  it("maps verify prompts to the existing safe help commands", () => {
    expect(detectVerifyCommand("please run node --version")).toBe("node --version");
    expect(detectVerifyCommand("run tests")).toBe("npm test -- --help");
    expect(detectVerifyCommand("build check")).toBe("npm run build -- --help");
  });

  it("preserves explicit external verify opt-out", () => {
    expect(hasExternalVerifyOptOut("verify without npm tests")).toBe(true);
    expect(hasExternalVerifyOptOut("verify this file by reading it")).toBe(false);
  });

  it("classifies verify-like commands without allowlisting arbitrary shell", () => {
    expect(isVerifyLikeCommand("npm test -- --help")).toBe(true);
    expect(isVerifyLikeCommand("node --version")).toBe(false);
    expect(isVerifyLikeCommand("rm -rf .")).toBe(false);
  });
});
