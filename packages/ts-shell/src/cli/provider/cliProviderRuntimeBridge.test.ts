import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { describe, expect, it } from "vitest";

import { createCliProviderRuntimeBridge } from "./cliProviderRuntimeBridge.js";
import type { ProviderCredentialResolution } from '../../core/auth/credential.js';

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

  it('uses the live credential resolver after a persisted model selection releases the startup override', () => {
    const config = getRuntimeConfig(process.cwd());
    let startupModel = 'startup-model';
    const selections: string[] = [];
    const bridge = createCliProviderRuntimeBridge({
      runtimeConfig: () => config,
      options: { provider: 'openai', model: 'startup-model', apiKey: 'SYNTHETIC_KEY' },
      env: {},
      sessionId: () => 'session-live-model',
      resolveConfigTarget: (_config, sessionId): ProviderCredentialResolution => {
        selections.push(sessionId ?? 'missing-session');
        return { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY', model: startupModel,
          credential: { provider: 'openai', authMode: 'api-key', apiKey: 'SYNTHETIC_KEY', model: startupModel,
            source: 'cli', envVarName: 'OPENAI_API_KEY' } };
      },
    });

    expect(bridge.resolveCredentialSnapshot().model).toBe('startup-model');
    startupModel = 'selected-model';
    expect(bridge.resolveCredentialSnapshot()).toMatchObject({ model: 'selected-model',
      credential: { model: 'selected-model', apiKey: 'SYNTHETIC_KEY', source: 'cli' } });
    expect(selections).toEqual(['session-live-model', 'session-live-model']);
  });
});
