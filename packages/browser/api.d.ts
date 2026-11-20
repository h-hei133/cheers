export type PwFailureCode =
  | "runtime-package-missing"
  | "runtime-binary-missing"
  | "runtime-disabled"
  | "navigation-timeout"
  | "observe-failed"
  | "extract-failed"
  | "action-target-missing"
  | "action-timeout"
  | "policy-blocked"
  | "cleanup-failed"
  | "adapter-invalid-result"
  | "unknown";

export type PwRuntimeStatusKind =
  | "ready"
  | "package-missing"
  | "binary-missing"
  | "disabled"
  | "failed";

export interface PwBrowserType {
  executablePath(): string;
  launch(options?: {
    readonly headless?: boolean;
    readonly executablePath?: string;
    readonly timeout?: number;
    readonly args?: readonly string[];
    readonly ignoreDefaultArgs?: readonly string[];
  }): Promise<PwBrowser>;
}

export interface PwBrowser {
  newContext(options?: Record<string, unknown>): Promise<PwBrowserContext>;
  close(): Promise<void>;
}

export interface PwBrowserContext {
  /** Covers pages and popup first requests, but not every server redirect hop. */
  route(pattern: string, handler: (route: PwRoute) => Promise<void>): Promise<void>;
  newPage(): Promise<PwPage>;
  on?(event: 'page', handler: (page: PwPage) => void): void;
  /** Present in Playwright; optional here because a minimal double need not take a script. */
  addInitScript?(script: string): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * The page surface this runtime uses.
 *
 * Narrow on purpose: it is everything the browser session calls, and nothing
 * else. A wider declaration would describe Playwright rather than our use of it,
 * and every member declared but unused is one a reader has to rule out before
 * they can trust the ones that are. Locator, screenshot and file input members
 * are optional so an adapter can report an unavailable feature explicitly.
 *
 * The shapes match Playwright's, so the value returned by a real launch
 * satisfies this without a cast.
 */
export interface PwPage {
  goto(url: string, options?: { readonly waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit"; readonly timeout?: number }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  evaluate<T>(pageFunction: () => T): Promise<T>;
  click(selector: string, options?: { readonly timeout?: number }): Promise<void>;
  fill(selector: string, value: string, options?: { readonly timeout?: number }): Promise<void>;
  selectOption(selector: string, value: string, options?: { readonly timeout?: number }): Promise<void>;
  hover(selector: string, options?: { readonly timeout?: number }): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
  on(event: string, handler: (event: PwPage & { dismiss(): Promise<void> }) => void): void;
  viewportSize?(): { width: number; height: number } | null;
  locator?(selector: string): PwLocator;
  screenshot?(options: { type: 'png'; scale: 'css'; fullPage: false; mask: readonly PwLocator[]; maskColor: string; timeout: number }): Promise<Buffer>;
  setInputFiles?(selector: string, files: readonly { name: string; mimeType: string; buffer: Buffer }[], options: { timeout: number }): Promise<void>;
  close(): Promise<void>;
}

export interface PwLocator { count(): Promise<number> }

/** One intercepted request, as much of it as the policy check reads. */
export interface PwRoute {
  request(): { url(): string };
  continue(): Promise<void>;
  abort(reason?: string): Promise<void>;
}

export interface PwRuntimeModule {
  readonly chromium?: PwBrowserType;
}

export interface PwRuntimeStatus {
  readonly status: PwRuntimeStatusKind;
  readonly reasonCode: PwFailureCode | "ready";
  readonly dependency: "playwright-core" | "playwright" | "none";
  readonly packageName?: "playwright-core" | "playwright";
  readonly browserName: "chromium";
  readonly executablePath?: string;
  readonly executableSource: "env" | "playwright-cache" | "system-path" | "none" | "unknown";
  readonly realBrowserValidationAvailable: boolean;
  readonly passiveStatusCheck: true;
  readonly browserLaunched: false;
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly mcpLaunched: false;
  readonly reason: string;
  readonly skipReason?: string;
  readonly nextAction: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export interface PwRuntimeStatusInput {
  readonly enabled?: boolean;
  readonly importer?: (specifier: string) => Promise<unknown>;
  readonly fsExists?: (path: string) => boolean;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodeJS.Platform;
}

export type RuntimeImportResult =
  | { readonly ok: true; readonly packageName: "playwright-core" | "playwright"; readonly module: PwRuntimeModule; readonly evidence: readonly string[] }
  | { readonly ok: false; readonly evidence: readonly string[] };

export type SanitizeRuntimeText = (value: string, maxLength: number) => string;

export function getPwRuntimeStatus(input: PwRuntimeStatusInput, sanitize: SanitizeRuntimeText): Promise<PwRuntimeStatus>;
export function importPwRuntime(importer?: (specifier: string) => Promise<unknown>): Promise<RuntimeImportResult>;
