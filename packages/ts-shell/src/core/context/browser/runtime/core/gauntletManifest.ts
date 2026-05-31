export interface BrowserRuntimeGauntletManifest {
  readonly manifestId: string;
  readonly taskCount: number;
  readonly requiredCapabilities: readonly string[];
  readonly publicNetwork: false;
  readonly providerModelCalls: "none";
  readonly rawContent: "excluded";
}

export function createBrowserRuntimeGauntletManifest(taskCount: number): BrowserRuntimeGauntletManifest {
  return {
    manifestId: "browser-runtime-gauntlet:v1",
    taskCount,
    requiredCapabilities: [
      "external-runtime-protocol",
      "snapshot-validation",
      "controlled-click-type",
      "selector-repair-apply",
      "safe-reporting",
    ],
    publicNetwork: false,
    providerModelCalls: "none",
    rawContent: "excluded",
  };
}
