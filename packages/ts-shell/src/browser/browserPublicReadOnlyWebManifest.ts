import fs from "node:fs";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import {
  createBrowserNetworkAllowlist,
  normalizeBrowserAllowedOrigin,
  parseBrowserNetworkTarget,
} from "./browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserExecutionActionKind } from "./browserExecutionContract.js";

export const BROWSER_CLI_PUBLIC_READONLY_WEB_MANIFEST_ENV =
  "PRIVATE_AGENTS_BROWSER_PUBLIC_READONLY_WEB_MANIFEST";
export const BROWSER_CLI_PUBLIC_READONLY_WEB_CONFIRM_ENV =
  "PRIVATE_AGENTS_BROWSER_PUBLIC_READONLY_WEB_CONFIRM";
export const BROWSER_PUBLIC_READONLY_WEB_MANIFEST_VERSION =
  "browser-public-readonly-web-manifest/v1" as const;

export type BrowserPublicReadOnlyWebManifestSource =
  | "cli-harness"
  | "explicit-local-config"
  | "test-only";
export type BrowserPublicReadOnlyWebMethod = "GET" | "HEAD";
export type BrowserPublicReadOnlyWebActionKind = Extract<
  BrowserExecutionActionKind,
  "navigate" | "observe" | "extract"
>;

export interface BrowserPublicReadOnlyWebManifest {
  readonly manifestVersion: typeof BROWSER_PUBLIC_READONLY_WEB_MANIFEST_VERSION;
  readonly source: BrowserPublicReadOnlyWebManifestSource;
  readonly allowedPublicOrigins: readonly string[];
  readonly allowedMethods: readonly BrowserPublicReadOnlyWebMethod[];
  readonly allowedActionKinds: readonly BrowserPublicReadOnlyWebActionKind[];
  readonly maxRedirects: number;
  readonly timeoutMs: number;
  readonly responseByteBudget: number;
  readonly contentTypeAllowlist: readonly string[];
  readonly confirmationRequirement: "required";
  readonly evidencePolicy: "safe-summary-only";
  readonly publicNetworkAllowed: true;
  readonly browserLaunchAllowed: false;
  readonly javascriptAllowed: false;
  readonly cookiesAllowed: false;
  readonly warnings: readonly string[];
}

export type BrowserPublicReadOnlyWebManifestLoadResult =
  | {
      readonly status: "missing";
      readonly manifest?: undefined;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly status: "valid";
      readonly manifest: BrowserPublicReadOnlyWebManifest;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly status: "invalid";
      readonly manifest?: undefined;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

export interface BrowserPublicReadOnlyWebHarnessContext {
  readonly browserSandboxAuthority?: ReturnType<typeof createBrowserSandboxAuthority>;
  readonly browserNetworkAllowlist?: ReturnType<typeof createBrowserNetworkAllowlist>;
  readonly browserExecutionConfirmations?: readonly BrowserExecutionConfirmationRecord[];
}

const READ_ONLY_ACTIONS = new Set(["navigate", "observe", "extract"]);
const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);
const DEFAULT_CONTENT_TYPES = ["text/html", "text/plain", "application/json"] as const;
const SENSITIVE_ACTIONS = ["auth", "payment", "destructive", "upload", "download", "screenshot", "ocr"] as const;

export function createBrowserPublicReadOnlyWebManifest(input: {
  readonly source?: BrowserPublicReadOnlyWebManifestSource;
  readonly allowedPublicOrigins?: readonly string[];
  readonly allowedMethods?: readonly BrowserPublicReadOnlyWebMethod[];
  readonly allowedActionKinds?: readonly BrowserPublicReadOnlyWebActionKind[];
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly responseByteBudget?: number;
  readonly contentTypeAllowlist?: readonly string[];
  readonly warnings?: readonly string[];
} = {}): BrowserPublicReadOnlyWebManifest {
  return {
    manifestVersion: BROWSER_PUBLIC_READONLY_WEB_MANIFEST_VERSION,
    source: input.source ?? "test-only",
    allowedPublicOrigins: (input.allowedPublicOrigins ?? ["https://example.com"]).map(normalizeOriginForManifest),
    allowedMethods: unique(input.allowedMethods ?? ["GET", "HEAD"]),
    allowedActionKinds: unique(input.allowedActionKinds ?? ["navigate", "observe", "extract"]),
    maxRedirects: input.maxRedirects ?? 3,
    timeoutMs: input.timeoutMs ?? 1500,
    responseByteBudget: input.responseByteBudget ?? 4096,
    contentTypeAllowlist: unique(input.contentTypeAllowlist ?? DEFAULT_CONTENT_TYPES),
    confirmationRequirement: "required",
    evidencePolicy: "safe-summary-only",
    publicNetworkAllowed: true,
    browserLaunchAllowed: false,
    javascriptAllowed: false,
    cookiesAllowed: false,
    warnings: sanitizeList(input.warnings ?? []),
  };
}

export function serializeBrowserPublicReadOnlyWebManifest(
  manifest: BrowserPublicReadOnlyWebManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateBrowserPublicReadOnlyWebManifest(
  value: unknown,
): BrowserPublicReadOnlyWebManifestLoadResult {
  if (!isRecord(value)) {
    return invalid("Public read-only web manifest must be a JSON object.");
  }
  if (value.manifestVersion !== BROWSER_PUBLIC_READONLY_WEB_MANIFEST_VERSION) {
    return invalid("Public read-only web manifest version is unsupported.");
  }
  if (!isSource(value.source)) {
    return invalid("Public read-only web manifest source is unsupported.");
  }
  if (
    value.publicNetworkAllowed !== true ||
    value.browserLaunchAllowed !== false ||
    value.javascriptAllowed !== false ||
    value.cookiesAllowed !== false
  ) {
    return invalid("Public read-only web manifest must enable only public network reads and disable browser, JavaScript, and cookies.");
  }
  if (value.confirmationRequirement !== "required" || value.evidencePolicy !== "safe-summary-only") {
    return invalid("Public read-only web manifest requires explicit confirmation and safe-summary-only evidence.");
  }
  const origins = parseOrigins(value.allowedPublicOrigins);
  if (origins.ok === false) {
    return invalid(origins.reason, origins.redactions);
  }
  const methods = parseMethods(value.allowedMethods);
  if (methods.ok === false) {
    return invalid(methods.reason);
  }
  const actions = parseActions(value.allowedActionKinds);
  if (actions.ok === false) {
    return invalid(actions.reason);
  }
  if (!isSafeInteger(value.maxRedirects, 0, 10) || !isSafeInteger(value.timeoutMs, 50, 15_000) || !isSafeInteger(value.responseByteBudget, 128, 65_536)) {
    return invalid("Public read-only web manifest requires bounded redirects, timeout, and response budgets.");
  }
  const contentTypes = parseContentTypes(value.contentTypeAllowlist);
  if (contentTypes.ok === false) {
    return invalid(contentTypes.reason);
  }
  const manifest: BrowserPublicReadOnlyWebManifest = {
    manifestVersion: BROWSER_PUBLIC_READONLY_WEB_MANIFEST_VERSION,
    source: value.source,
    allowedPublicOrigins: origins.origins,
    allowedMethods: methods.methods,
    allowedActionKinds: actions.actions,
    maxRedirects: value.maxRedirects,
    timeoutMs: value.timeoutMs,
    responseByteBudget: value.responseByteBudget,
    contentTypeAllowlist: contentTypes.contentTypes,
    confirmationRequirement: "required",
    evidencePolicy: "safe-summary-only",
    publicNetworkAllowed: true,
    browserLaunchAllowed: false,
    javascriptAllowed: false,
    cookiesAllowed: false,
    warnings: sanitizeList(Array.isArray(value.warnings) ? value.warnings : []),
  };
  return {
    status: "valid",
    manifest,
    reason: "Explicit public read-only web manifest is valid.",
    evidence: [
      "browser-public-readonly-web-manifest:validated",
      "browser-public-readonly-web-manifest:public-network-explicit",
      "browser-public-readonly-web-manifest:no-browser-launch",
      "browser-public-readonly-web-manifest:no-javascript",
      "browser-public-readonly-web-manifest:no-cookies",
      "browser-public-readonly-web-manifest:safe-summary-only",
    ],
    warnings: manifest.warnings,
    redactions: [],
  };
}

export function loadBrowserPublicReadOnlyWebManifestFromEnv(input: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly readFile?: (path: string) => string;
} = {}): BrowserPublicReadOnlyWebManifestLoadResult {
  const env = input.env ?? process.env;
  const manifestPath = env[BROWSER_CLI_PUBLIC_READONLY_WEB_MANIFEST_ENV];
  if (!manifestPath) {
    return {
      status: "missing",
      reason: "No public read-only web manifest was provided.",
      evidence: [
        "browser-public-readonly-web-manifest-load:missing",
        "browser-public-readonly-web-manifest-load:no-default-public-network",
      ],
      warnings: [],
      redactions: [],
    };
  }
  const readFile = input.readFile ?? ((path) => fs.readFileSync(path, "utf8"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(manifestPath));
  } catch {
    return invalid("Public read-only web manifest could not be read or parsed.", ["manifest-content"]);
  }
  const validation = validateBrowserPublicReadOnlyWebManifest(parsed);
  return validation.status === "valid"
    ? {
        ...validation,
        evidence: [
          ...validation.evidence,
          "browser-public-readonly-web-manifest-load:valid",
          "browser-public-readonly-web-manifest-load:explicit-only",
        ],
      }
    : validation;
}

export function createBrowserPublicReadOnlyWebHarnessContext(input: {
  readonly manifestLoad: BrowserPublicReadOnlyWebManifestLoadResult;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): BrowserPublicReadOnlyWebHarnessContext {
  if (input.manifestLoad.status !== "valid") {
    return {};
  }
  const confirmed = (input.env ?? process.env)[BROWSER_CLI_PUBLIC_READONLY_WEB_CONFIRM_ENV] === "confirmed";
  return {
    browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
    browserNetworkAllowlist: createBrowserNetworkAllowlist({
      allowedOrigins: input.manifestLoad.manifest.allowedPublicOrigins.map((origin) => ({
        origin,
        mode: "future-runtime",
        label: "public-readonly-web-manifest",
      })),
      evidence: [
        "browser-public-readonly-web-manifest:harness-allowlist",
        "browser-public-readonly-web-manifest:public-readonly-only",
      ],
    }),
    browserExecutionConfirmations: confirmed
      ? [{ kind: "network", status: "confirmed" }]
      : [],
  };
}

function parseOrigins(value: unknown):
  | { readonly ok: true; readonly origins: readonly string[] }
  | { readonly ok: false; readonly reason: string; readonly redactions?: readonly string[] } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "Public read-only web manifest requires explicit allowed public origins." };
  }
  const origins: string[] = [];
  for (const item of value) {
    const origin = stringValue(item);
    if (!origin || origin === "*" || origin.includes("*")) {
      return { ok: false, reason: "Public read-only web manifest cannot use wildcard origins." };
    }
    const target = parseBrowserNetworkTarget(origin);
    if (target.hasCredentials) {
      return { ok: false, reason: "Public read-only web manifest cannot include credential URLs.", redactions: ["url-credentials"] };
    }
    if (target.parseError || target.scheme !== "https") {
      return { ok: false, reason: "Public read-only web manifest origins must be valid https origins." };
    }
    if (target.hostname && isPrivateNetworkHost(target.hostname)) {
      return { ok: false, reason: "Public read-only web manifest cannot allow private or local origins." };
    }
    origins.push(normalizeBrowserAllowedOrigin(origin) ?? target.origin!);
  }
  return { ok: true, origins: unique(origins) };
}

function parseMethods(value: unknown):
  | { readonly ok: true; readonly methods: readonly BrowserPublicReadOnlyWebMethod[] }
  | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "Public read-only web manifest requires allowed methods." };
  }
  const methods: BrowserPublicReadOnlyWebMethod[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !READ_ONLY_METHODS.has(item)) {
      return { ok: false, reason: "Public read-only web manifest only allows GET and HEAD." };
    }
    methods.push(item as BrowserPublicReadOnlyWebMethod);
  }
  return { ok: true, methods: unique(methods) };
}

function parseActions(value: unknown):
  | { readonly ok: true; readonly actions: readonly BrowserPublicReadOnlyWebActionKind[] }
  | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "Public read-only web manifest requires allowed action kinds." };
  }
  const actions: BrowserPublicReadOnlyWebActionKind[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !READ_ONLY_ACTIONS.has(item) || SENSITIVE_ACTIONS.includes(item as never)) {
      return { ok: false, reason: "Public read-only web manifest only allows navigate, observe, and extract." };
    }
    actions.push(item as BrowserPublicReadOnlyWebActionKind);
  }
  return { ok: true, actions: unique(actions) };
}

function parseContentTypes(value: unknown):
  | { readonly ok: true; readonly contentTypes: readonly string[] }
  | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "Public read-only web manifest requires a content-type allowlist." };
  }
  const contentTypes = sanitizeList(value)
    .map((item) => item.toLowerCase())
    .filter((item) => item.length > 0 && !item.includes("*"));
  if (contentTypes.length === 0) {
    return { ok: false, reason: "Public read-only web manifest content-type allowlist cannot be empty or wildcard." };
  }
  return { ok: true, contentTypes: unique(contentTypes) };
}

function invalid(
  reason: string,
  redactions: readonly string[] = [],
): BrowserPublicReadOnlyWebManifestLoadResult {
  return {
    status: "invalid",
    reason,
    evidence: [
      "browser-public-readonly-web-manifest:invalid",
      "browser-public-readonly-web-manifest:safe-error",
      "browser-public-readonly-web-manifest:no-default-public-network",
    ],
    warnings: ["browser-public-readonly-web-manifest:blocked"],
    redactions: unique(["manifest-content", ...redactions]),
  };
}

function normalizeOriginForManifest(origin: string): string {
  return normalizeBrowserAllowedOrigin(origin) ?? "https://example.com";
}

function isSource(value: unknown): value is BrowserPublicReadOnlyWebManifestSource {
  return value === "cli-harness" || value === "explicit-local-config" || value === "test-only";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isSafeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isPrivateNetworkHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    hostname === "::1" || hostname.startsWith("127.") || hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function sanitizeList(values: readonly unknown[]): readonly string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => sanitizeBrowserText(value, 160).replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0 && !hasForbiddenContent(value));
}

function hasForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|token|secret|password|hidden reasoning|<html|<body)/i.test(value);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
