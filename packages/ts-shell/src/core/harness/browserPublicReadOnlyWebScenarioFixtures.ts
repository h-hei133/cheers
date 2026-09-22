import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BROWSER_CLI_PUBLIC_READONLY_WEB_CONFIRM_ENV,
  BROWSER_CLI_PUBLIC_READONLY_WEB_MANIFEST_ENV,
  createBrowserPublicReadOnlyWebManifest,
  serializeBrowserPublicReadOnlyWebManifest,
  type BrowserPublicReadOnlyWebManifest,
} from "../../browser/publicReadOnlyWebManifest.js";
import type {
  BrowserPublicReadOnlyHttpClient,
  BrowserPublicReadOnlyHttpResponse,
} from "../../browser/publicReadOnlyWebExecutor.js";

export interface BrowserPublicReadOnlyWebScenarioFixture {
  readonly origin: string;
  readonly manifest: BrowserPublicReadOnlyWebManifest;
  readonly env: Readonly<Record<string, string>>;
  readonly httpClient: BrowserPublicReadOnlyHttpClient;
  readonly requests: readonly string[];
  readonly cleanup: () => void;
}

export function createBrowserPublicReadOnlyWebScenarioFixture(input: {
  readonly origin?: string;
  readonly responses?: Readonly<Record<string, BrowserPublicReadOnlyHttpResponse>>;
  readonly confirmed?: boolean;
  readonly responseByteBudget?: number;
  readonly contentTypeAllowlist?: readonly string[];
} = {}): BrowserPublicReadOnlyWebScenarioFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-public-readonly-web-"));
  const origin = input.origin ?? "https://example.test";
  const manifest = createBrowserPublicReadOnlyWebManifest({
    source: "test-only",
    allowedPublicOrigins: [origin],
    responseByteBudget: input.responseByteBudget,
    contentTypeAllowlist: input.contentTypeAllowlist,
  });
  const manifestPath = path.join(root, "public-readonly-web.json");
  fs.writeFileSync(manifestPath, serializeBrowserPublicReadOnlyWebManifest(manifest), "utf8");
  const requests: string[] = [];
  const responses = input.responses ?? {
    "/": {
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<html><head><title>Route 120</title></head><body><main>Public read-only summary</main></body></html>",
      bodyBytes: 98,
    },
    "/head": {
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: "",
      bodyBytes: 0,
    },
  };
  return {
    origin,
    manifest,
    env: {
      [BROWSER_CLI_PUBLIC_READONLY_WEB_MANIFEST_ENV]: manifestPath,
      ...(input.confirmed ? { [BROWSER_CLI_PUBLIC_READONLY_WEB_CONFIRM_ENV]: "confirmed" } : {}),
    },
    httpClient: async ({ url }) => {
      requests.push(`${url.origin}${url.pathname}`);
      return responses[url.pathname] ?? {
        statusCode: 404,
        headers: { "content-type": "text/plain" },
        body: "not found",
        bodyBytes: 9,
      };
    },
    requests,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
