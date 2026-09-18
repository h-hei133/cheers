import {
  createBrowserLocalFixture,
  sanitizeBrowserEvidenceText,
  type BrowserLocalFixture,
  type BrowserLocalFixtureAction,
  type BrowserLocalFixtureKind,
} from "./browserLocalFixture.js";

export const BROWSER_LOCAL_FIXTURE_MANIFEST_VERSION =
  "browser-local-fixture-manifest/v1" as const;

export type BrowserLocalFixtureManifestVersion =
  typeof BROWSER_LOCAL_FIXTURE_MANIFEST_VERSION;

export type BrowserLocalFixtureManifestSource = "cli-harness" | "test-only";
export type BrowserLocalFixtureManifestExecutorMode =
  | "local-fixture"
  | "playwright-local";

export interface BrowserLocalFixtureManifestEntry {
  readonly id: string;
  readonly kind: BrowserLocalFixtureKind;
  readonly title: string;
  readonly url: string;
  readonly textSummary: string;
  readonly allowedActions: readonly BrowserLocalFixtureAction[];
}

export interface BrowserLocalFixtureManifest {
  readonly version: BrowserLocalFixtureManifestVersion;
  readonly source: BrowserLocalFixtureManifestSource;
  readonly executorMode: BrowserLocalFixtureManifestExecutorMode;
  readonly fixtures: readonly BrowserLocalFixtureManifestEntry[];
  readonly allowedLocalOrigins: readonly string[];
  readonly sandbox: {
    readonly mode: "local-fixture";
    readonly capabilities: readonly BrowserLocalFixtureAction[];
  };
  readonly confirmations: readonly {
    readonly kind: "sandbox";
    readonly status: "confirmed";
  }[];
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
}

export type BrowserLocalFixtureManifestValidationResult =
  | {
      readonly ok: true;
      readonly manifest: BrowserLocalFixtureManifest;
      readonly fixture: BrowserLocalFixture;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    };

type FixtureEntryValidationResult =
  | {
      readonly ok: true;
      readonly entry: BrowserLocalFixtureManifestEntry;
    }
  | Extract<BrowserLocalFixtureManifestValidationResult, { ok: false }>;

const SAFE_ACTIONS = new Set<BrowserLocalFixtureAction>([
  "observe",
  "extract",
  "navigate-local",
]);

export function createBrowserLocalFixtureManifest(input: {
  readonly source?: BrowserLocalFixtureManifestSource;
  readonly executorMode?: BrowserLocalFixtureManifestExecutorMode;
  readonly fixture?: Partial<BrowserLocalFixtureManifestEntry>;
} = {}): BrowserLocalFixtureManifest {
  const fixture = createBrowserLocalFixture({
    fixtureId: input.fixture?.id,
    fixtureKind: input.fixture?.kind,
    title: input.fixture?.title,
    url: input.fixture?.url,
    text: input.fixture?.textSummary,
    allowedActions: input.fixture?.allowedActions,
  });
  return {
    version: BROWSER_LOCAL_FIXTURE_MANIFEST_VERSION,
    source: input.source ?? "cli-harness",
    executorMode: input.executorMode ?? "local-fixture",
    fixtures: [
      {
        id: fixture.fixtureId,
        kind: fixture.fixtureKind,
        title: fixture.safeTitle,
        url: fixture.safeUrl,
        textSummary: fixture.safeTextSummary,
        allowedActions: fixture.allowedActions,
      },
    ],
    allowedLocalOrigins: [fixture.safeUrl],
    sandbox: {
      mode: "local-fixture",
      capabilities: fixture.allowedActions,
    },
    confirmations: [{ kind: "sandbox", status: "confirmed" }],
    redactions: fixture.redactions,
    warnings: fixture.warnings,
  };
}

export function serializeBrowserLocalFixtureManifest(
  manifest: BrowserLocalFixtureManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateBrowserLocalFixtureManifest(
  value: unknown,
): BrowserLocalFixtureManifestValidationResult {
  if (!isRecord(value)) {
    return invalid("Manifest must be a JSON object.");
  }
  if (value.version !== BROWSER_LOCAL_FIXTURE_MANIFEST_VERSION) {
    return invalid("Manifest version is unsupported.");
  }
  if (value.source !== "cli-harness" && value.source !== "test-only") {
    return invalid("Manifest source must be cli-harness or test-only.");
  }
  if (value.executorMode !== "local-fixture" && value.executorMode !== "playwright-local") {
    return invalid("Manifest executor mode must be local-fixture or playwright-local.");
  }
  if (!Array.isArray(value.fixtures) || value.fixtures.length !== 1) {
    return invalid("Manifest must include exactly one local fixture.");
  }
  const rawFixture = value.fixtures[0];
  if (!isRecord(rawFixture)) {
    return invalid("Fixture entry must be a JSON object.");
  }
  const fixture = validateFixtureEntry(rawFixture);
  if (fixture.ok === false) {
    return fixture;
  }
  if (!Array.isArray(value.allowedLocalOrigins)) {
    return invalid("Manifest allowedLocalOrigins must be an array.");
  }
  if (
    !value.allowedLocalOrigins.every(
      (origin) => typeof origin === "string" && origin.startsWith("local-fixture://"),
    )
  ) {
    return invalid("Manifest may only allow local-fixture origins.");
  }
  if (!isRecord(value.sandbox) || value.sandbox.mode !== "local-fixture") {
    return invalid("Manifest sandbox mode must be local-fixture.");
  }
  if (
    !Array.isArray(value.sandbox.capabilities) ||
    !value.sandbox.capabilities.every(isSafeFixtureAction)
  ) {
    return invalid("Manifest sandbox capabilities must be read-only local fixture actions.");
  }
  const warnings = stringArray(value.warnings);
  const redactions = stringArray(value.redactions);
  const manifest: BrowserLocalFixtureManifest = {
    version: BROWSER_LOCAL_FIXTURE_MANIFEST_VERSION,
    source: value.source,
    executorMode: value.executorMode,
    fixtures: [fixture.entry],
    allowedLocalOrigins: value.allowedLocalOrigins,
    sandbox: {
      mode: "local-fixture",
      capabilities: value.sandbox.capabilities,
    },
    confirmations: Array.isArray(value.confirmations)
      ? value.confirmations.filter(isSandboxConfirmation)
      : [],
    redactions,
    warnings,
  };
  return {
    ok: true,
    manifest,
    fixture: createBrowserLocalFixture({
      fixtureId: fixture.entry.id,
      fixtureKind: fixture.entry.kind,
      title: fixture.entry.title,
      url: fixture.entry.url,
      text: fixture.entry.textSummary,
      allowedActions: fixture.entry.allowedActions,
    }),
    evidence: [
      "browser-local-fixture-manifest:validated",
      "browser-local-fixture-manifest:no-raw-content",
      "browser-local-fixture-manifest:no-network",
    ],
    warnings,
  };
}

function validateFixtureEntry(
  value: Record<string, unknown>,
): FixtureEntryValidationResult {
  const id = stringValue(value.id);
  const kind = stringValue(value.kind);
  const title = stringValue(value.title);
  const url = stringValue(value.url);
  const textSummary = stringValue(value.textSummary);
  if (!id || !kind || !title || !url || !textSummary) {
    return invalid("Fixture entry is missing required safe fields.");
  }
  if (!["static-page", "accessibility-summary", "extraction-result"].includes(kind)) {
    return invalid("Fixture kind is unsupported.");
  }
  if (!url.startsWith("local-fixture://")) {
    return invalid("Fixture URL must use local-fixture scheme.");
  }
  const unsafeText = [id, title, url, textSummary].find(hasUnsafeRawContent);
  if (unsafeText) {
    return invalid("Fixture entry contains raw content or secret-looking data.");
  }
  const allowedActions = Array.isArray(value.allowedActions)
    ? value.allowedActions
    : [];
  if (
    allowedActions.length === 0 ||
    !allowedActions.every(isSafeFixtureAction)
  ) {
    return invalid("Fixture allowedActions must be read-only local fixture actions.");
  }
  const sanitizedTitle = sanitizeBrowserEvidenceText(title, 80);
  const sanitizedSummary = sanitizeBrowserEvidenceText(textSummary, 180);
  if (
    sanitizedTitle.redactions.length > 0 ||
    sanitizedSummary.redactions.length > 0
  ) {
    return invalid("Fixture entry requires pre-summarized safe text.");
  }
  return {
    ok: true,
    entry: {
      id,
      kind: kind as BrowserLocalFixtureKind,
      title: sanitizedTitle.value,
      url,
      textSummary: sanitizedSummary.value,
      allowedActions: allowedActions as BrowserLocalFixtureAction[],
    },
  };
}

function hasUnsafeRawContent(value: string): boolean {
  return (
    /<[^>]+>/.test(value) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value) ||
    /\b(auth token|api key|provider credential)\b/i.test(value)
  );
}

function isSafeFixtureAction(value: unknown): value is BrowserLocalFixtureAction {
  return typeof value === "string" && SAFE_ACTIONS.has(value as BrowserLocalFixtureAction);
}

function isSandboxConfirmation(
  value: unknown,
): value is { readonly kind: "sandbox"; readonly status: "confirmed" } {
  return (
    isRecord(value) &&
    value.kind === "sandbox" &&
    value.status === "confirmed"
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(
  reason: string,
): Extract<BrowserLocalFixtureManifestValidationResult, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: ["browser-local-fixture-manifest:invalid"],
    warnings: ["browser-local-fixture-manifest:blocked"],
  };
}
