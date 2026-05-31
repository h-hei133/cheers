import { sanitizeBrowserText } from "../../../browserCapabilityModel.js";
import { normalizeOriginLike, type BrowserRuntimeManifest } from "./manifest.js";

export interface BrowserRuntimeSession {
  readonly runtimeId: string;
  readonly sessionId: string;
  readonly originScope: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly statePersistence: "none";
  readonly cookiesAuth: "disabled";
  readonly currentUrlSummary: string;
  readonly warnings: readonly string[];
  readonly rawContent: "excluded";
}

export function createBrowserRuntimeSession(input: {
  readonly manifest: BrowserRuntimeManifest;
  readonly sessionId?: string;
  readonly currentUrl?: string;
  readonly now?: () => string;
}): BrowserRuntimeSession {
  const createdAt = input.now?.() ?? "2026-05-18T00:00:00.000Z";
  const expiresAt = new Date(Date.parse(createdAt) + input.manifest.timeoutMs).toISOString();
  return {
    runtimeId: input.manifest.manifestId,
    sessionId: sanitizeBrowserText(input.sessionId ?? `${input.manifest.manifestId}:session`, 140),
    originScope: input.manifest.allowedOrigins.map(normalizeOriginLike),
    createdAt,
    expiresAt,
    statePersistence: "none",
    cookiesAuth: "disabled",
    currentUrlSummary: sanitizeBrowserText(input.currentUrl ?? input.manifest.allowedOrigins[0] ?? "none", 180),
    warnings: [
      "browser-runtime-session:memory-only",
      "browser-runtime-session:no-cookie-auth",
      "browser-runtime-session:no-cross-session-state",
    ],
    rawContent: "excluded",
  };
}
