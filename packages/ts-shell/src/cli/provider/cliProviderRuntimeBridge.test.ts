import { describe, expect, it } from "vitest";

import { createCliProviderRuntimeBridge } from "./cliProviderRuntimeBridge.js";

describe("CLI provider runtime bridge", () => {
  it("projects provider env without treating smoke env presence as opt-in", () => {
    const bridge = createCliProviderRuntimeBridge({
      projectRoot: process.cwd(),
      options: {},
      env: {
        PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
        PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "true",
      },
    });

    expect(bridge.providerModeEnv()).toBe("synthetic");
    expect(bridge.realProviderSmokeOptIn()).toBe(false);
  });

  it("keeps real-provider smoke opt-in narrow", () => {
    const bridge = createCliProviderRuntimeBridge({
      projectRoot: process.cwd(),
      options: {},
      env: {
        PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: " 1 ",
      },
    });

    expect(bridge.realProviderSmokeOptIn()).toBe(true);
  });
});
