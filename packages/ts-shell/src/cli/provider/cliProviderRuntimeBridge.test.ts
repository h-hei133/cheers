import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { describe, expect, it } from "vitest";

import { createCliProviderRuntimeBridge } from "./cliProviderRuntimeBridge.js";

describe("CLI provider runtime bridge", () => {
  it("projects provider env without treating smoke env presence as opt-in", () => {
    const bridge = createCliProviderRuntimeBridge({
      runtimeConfig: () => getRuntimeConfig(process.cwd()),
      options: {},
      env: {
        CHEERS_PROVIDER_MODE: "synthetic",
        CHEERS_REAL_PROVIDER_SMOKE: "true",
      },
    });

    expect(bridge.providerModeEnv()).toBe("synthetic");
    expect(bridge.realProviderSmokeOptIn()).toBe(false);
  });

  it("keeps real-provider smoke opt-in narrow", () => {
    const bridge = createCliProviderRuntimeBridge({
      runtimeConfig: () => getRuntimeConfig(process.cwd()),
      options: {},
      env: {
        CHEERS_REAL_PROVIDER_SMOKE: " 1 ",
      },
    });

    expect(bridge.realProviderSmokeOptIn()).toBe(true);
  });
});
