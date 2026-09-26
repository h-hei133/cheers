import type { RuntimeProvider } from "../../../config/runtimeConfig.js";
import type { BrowserAuthCaptureResult } from "../browserAuthOnboarding.js";

export type ConnectPresetId =
  | "openai"
  | "anthropic"
  | "siliconflow"
  | "google"
  | "google-ai"
  | "vertex"
  | "bedrock"
  | "github-copilot"
  | "antigravity"
  | "claudecode";

export interface ConnectPreset {
  readonly id: ConnectPresetId;
  readonly label: string;
  readonly provider: RuntimeProvider;
  readonly defaultBaseUrl?: string;
  readonly defaultModel?: string;
}

export type BrowserFlowRunner = (options: {
  readonly provider: RuntimeProvider;
  readonly presetLabel: string;
  readonly defaultBaseUrl?: string;
  readonly defaultModel?: string;
}) => Promise<BrowserAuthCaptureResult>;
