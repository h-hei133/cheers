import { importPwRuntime, type PwBrowser, type PwBrowserContext, type PwPage } from "./playwrightRuntime.js";
import {
  STEALTH_LAUNCH_ARGS,
  STEALTH_IGNORE_DEFAULT_ARGS,
  DEFAULT_USER_AGENT,
  DEFAULT_VIEWPORT,
  buildStealthPreloadScript,
} from "./stealthPreload.js";
import { admitBrowserRedirect, admitBrowserUrl, admitPageRequest, type BrowserUrlRefusal } from "./urlAdmission.js";
import { readBrowserOriginPolicy, type BrowserOriginPolicy } from "./originPolicy.js";

export interface BrowserElementRef {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly selector: string;
}

export interface ObservedPageState {
  readonly url: string;
  readonly title: string;
  readonly elements: readonly BrowserElementRef[];
  readonly outline: string;
}

/**
 * Why a browser action could not run.
 *
 * Carried out of this class rather than thrown, because every one of these is an
 * answer the model has to read: the tool renders them as a refusal with a next
 * action, and the difference between "no browser installed" and "the page has no
 * such element" decides what the next attempt should be.
 */
export interface BrowserSessionFailure {
  readonly kind: "not-launched" | "url-refused" | "navigation-failed" | "action-failed" | "close-failed";
  /** What went wrong, in the terms the user can act on. */
  readonly reason: string;
  readonly nextAction: string;
  /** The classified host refusal, when the URL was the problem. */
  readonly refusal?: BrowserUrlRefusal;
}

/**
 * `never` on the absent side, spelled out on purpose.
 *
 * With a plain `ok: true | false` pair the compiler narrowed these in a small
 * probe but not inside the tool's switch, which is long enough that its
 * control-flow analysis gives up — the failure is silent and looks like a type
 * error in correct code. Naming the absent member keeps the narrowing local to
 * the discriminant.
 */
export type BrowserActionResult =
  | { readonly ok: true; readonly output: string; readonly failure?: never }
  | { readonly ok: false; readonly failure: BrowserSessionFailure; readonly output?: never };

export interface BrowserOpenResult {
  readonly ok: boolean;
  readonly url: string;
  readonly title?: string;
  readonly failure?: BrowserSessionFailure;
}

interface SessionDependencies {
  /** Parses a URL the way the tool will. Injectable so tests do not need a network. */
  readonly admitUrl: typeof admitBrowserUrl;
  /** Where the page comes from. Tests supply their own; production launches Chromium. */
  readonly launchPage?: () => Promise<PwPage | null>;
}

/**
 * The failure a launch produces, in the words of the status vocabulary.
 *
 * `getPwRuntimeStatus` probes passively: it reports whether a binary exists, and
 * it cannot see a launch that fails with a missing shared library or a sandbox
 * refusal because it never launches anything. This class does launch, so it
 * classifies what the launch said. Both readings are needed, and this is the one
 * that covers "installed but will not start".
 */
function classifyLaunchFailure(message: string): BrowserSessionFailure {
  const text = message.toLowerCase();
  if (/cannot find module|module_not_found|is not a function/.test(text)) {
    return {
      kind: "not-launched",
      reason: "No Playwright package could be loaded.",
      nextAction: "Install the workspace dependency, then retry.",
    };
  }
  if (/executable doesn't exist|executable_path|browser.*not found|please run the following command/.test(text)) {
    return {
      kind: "not-launched",
      reason: "The Playwright package is present but its Chromium build is not.",
      nextAction: "Run `npx playwright install chromium`, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a local Chromium.",
    };
  }
  if (/libnss|libasound|libatk|libgbm|error while loading shared libraries/.test(text)) {
    return {
      kind: "not-launched",
      reason: "Chromium is installed but a system library it needs is missing.",
      nextAction: "Install the missing shared libraries for your distribution, then retry.",
    };
  }
  if (/sandbox|namespace|permission denied|operation not permitted/.test(text)) {
    return {
      kind: "not-launched",
      reason: "Chromium could not start under this environment's sandbox restrictions.",
      nextAction: "Run the session without the restrictive sandbox, or grant the browser the namespaces it needs.",
    };
  }
  return {
    kind: "not-launched",
    reason: `Chromium could not be launched: ${message}`,
    nextAction: "Check the browser runtime status for the available next step.",
  };
}

class BrowserSessionManager {
  private browser: PwBrowser | null = null;
  private context: PwBrowserContext | null = null;
  private currentPage: PwPage | null = null;
  private currentUrl = "about:blank";
  private currentTitle = "Blank Page";
  private elementRefs: Map<string, string> = new Map();
  private initPromise: Promise<PwPage | null> | null = null;
  private closePromise: Promise<BrowserActionResult> | null = null;
  private cleanupRegistered = false;
  /**
   * The policy the current page's own requests are judged by.
   *
   * Held rather than passed at page creation, because the page is created
   * lazily and the caller that names a policy is `openUrl` — which may run
   * before or after the page exists. Defaults to the environment's policy, the
   * same one a caller that names none gets.
   */
  private requestPolicy: BrowserOriginPolicy = readBrowserOriginPolicy();
  /** A failed launch or cleanup, retained until the operation can be retried. */
  private sessionFailure: BrowserSessionFailure | null = null;
  private requestFailure: BrowserSessionFailure | null = null;


  constructor(private readonly dependencies: SessionDependencies = { admitUrl: admitBrowserUrl }) {}

  /**
   * The active page, launching a browser the first time it is asked.
   *
   * Concurrent callers share one attempt rather than each starting a browser;
   * the failure is recorded so the caller that arrives after it gets the reason
   * instead of a second launch attempt with the same outcome.
   */
  async getOrCreatePage(): Promise<PwPage | null> {
    if (this.closePromise) await this.closePromise;
    if (this.sessionFailure?.kind === "close-failed") return null;
    if (this.currentPage) return this.currentPage;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (this.dependencies.launchPage) {
          this.currentPage = await this.dependencies.launchPage();
          return this.currentPage;
        }
        // Imported through the module that already resolves the package, rather
        // than a second copy of the import dance. It reports which package
        // answered and what evidence it has, which the failure path reuses.
        const imported = await importPwRuntime();
        if (!imported.ok || !imported.module.chromium) {
          this.sessionFailure = {
            kind: "not-launched",
            reason: "Neither playwright-core nor playwright could be imported.",
            nextAction: "Install the workspace dependency, then retry.",
          };
          return null;
        }

        this.browser = await imported.module.chromium.launch({
          headless: true,
          args: [...STEALTH_LAUNCH_ARGS],
          ignoreDefaultArgs: [...STEALTH_IGNORE_DEFAULT_ARGS],
        });
        this.context = await this.browser.newContext({
          userAgent: DEFAULT_USER_AGENT,
          viewport: DEFAULT_VIEWPORT,
          locale: "en-US",
          timezoneId: "America/New_York",
          serviceWorkers: "block",
        });
        // Install before any page exists, including a popup's first request.
        // Service workers are disabled because they can bypass routing.
        await this.installRequestGuard(this.context);
        // Every page and popup also inherits the preload.
        const stealthScript = buildStealthPreloadScript();
        await this.context.addInitScript?.(stealthScript);

        this.currentPage = await this.context.newPage();
        // A crashed or closed page must not stay as the handle every later call
        // uses, or the session keeps answering from a page that is gone.
        this.currentPage.on("close", () => {
          this.currentPage = null;
        });
        this.currentPage.on("crash", () => {
          this.currentPage = null;
        });

        if (!this.cleanupRegistered) {
          process.once("exit", () => {
            this.browser?.close().catch(() => {});
          });
          this.cleanupRegistered = true;
        }
        this.sessionFailure = null;
        return this.currentPage;
      } catch (error) {
        const launchFailure = classifyLaunchFailure(
          error instanceof Error ? error.message : String(error),
        );
        const cleanup = await this.closeResources();
        if (cleanup.ok) this.sessionFailure = launchFailure;
        return null;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Open a URL, refusing one the policy does not admit.
   *
   * The refusal happens before a browser is started, so a refused navigation
   * costs nothing and cannot leave a page open on a host that should not have
   * been reached.
   */
  async openUrl(
    url: string,
    policy: BrowserOriginPolicy = readBrowserOriginPolicy(),
    timeoutMs = 20_000,
  ): Promise<BrowserOpenResult> {
    // Recorded before the page exists, so the guard it installs judges the
    // page's own requests by the policy this caller named.
    this.requestPolicy = policy;
    const admission = this.dependencies.admitUrl(url, policy);
    if (!admission.allowed && admission.refusal) {
      return {
        ok: false,
        url,
        failure: {
          kind: "url-refused",
          reason: admission.refusal.reason,
          nextAction: admission.refusal.nextAction,
          refusal: admission.refusal,
        },
      };
    }

    this.elementRefs.clear();
    this.requestFailure = null;
    const page = await this.getOrCreatePage();
    if (!page) {
      return { ok: false, url, failure: this.sessionFailure ?? {
        kind: "not-launched",
        reason: "The browser could not be started.",
        nextAction: "Check the browser runtime status for the available next step.",
      } };
    }

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (error) {
      return {
        ok: false,
        url,
        failure: this.requestFailure ?? {
          kind: "navigation-failed",
          reason: `${url} did not load: ${error instanceof Error ? error.message : String(error)}`,
          nextAction: "Check that the address is serving, then retry.",
        },
      };
    }

    // `goto` follows redirects internally, so the URL that was checked is the
    // first one. A page that answers with a redirect has moved the session to an
    // address nobody admitted, and it has to be judged before anything is read
    // from it.
    const landed = this.readPageUrl();
    const redirectAdmission = admitBrowserRedirect(url, landed, policy);
    if (!redirectAdmission.allowed && redirectAdmission.refusal) {
      // Navigated away rather than left open: the session must not keep a page
      // on a refused host where a later `observe` would read it.
      await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
      return {
        ok: false,
        url: landed,
        failure: {
          kind: "url-refused",
          reason: redirectAdmission.refusal.reason,
          nextAction: redirectAdmission.refusal.nextAction,
          refusal: redirectAdmission.refusal,
        },
      };
    }

    this.currentUrl = landed || url;
    this.currentTitle = await page.title().catch(() => this.currentUrl);
    return { ok: true, url: this.currentUrl, title: this.currentTitle };
  }

  /** Observe page and build the ref tree the model acts on. */
  async observe(): Promise<ObservedPageState> {
    this.elementRefs.clear();
    const elements: BrowserElementRef[] = [];
    const outlineLines: string[] = [];

    const page = await this.getOrCreatePage();
    if (page) {
      this.currentUrl = this.readPageUrl() || this.currentUrl;
      this.currentTitle = (await page.title().catch(() => this.currentTitle)) || this.currentTitle;
    }

    outlineLines.push(`Page URL: ${this.currentUrl}`, `Page Title: ${this.currentTitle}`);
    if (this.requestFailure) {
      outlineLines.push(`Request guard: ${this.requestFailure.reason}`, this.requestFailure.nextAction);
    }
    outlineLines.push("", "Interactive Elements:");

    if (page) {
      try {
        const rawElements = await page.evaluate(() => {
          const items: Array<{ role: string; name: string; selector: string }> = [];
          const interactive = Array.from(
            document.querySelectorAll("button, a, input, select, textarea, [role='button'], h1, h2, h3"),
          );

          interactive.slice(0, 50).forEach((el) => {
            const tagName = el.tagName.toLowerCase();
            let role = tagName;
            const inputType = (el as HTMLInputElement).type || "text";
            let name = "";

            if (tagName === "input" && (inputType === "password" || inputType === "hidden")) {
              name = `[${inputType}]`;
            } else {
              name = (el.textContent || (el as HTMLInputElement).placeholder || (el as HTMLInputElement).value || "").trim();
            }

            if (tagName === "a") role = "link";
            if (tagName === "button" || el.getAttribute("role") === "button") role = "button";
            if (tagName === "input") role = `input[${inputType}]`;
            if (tagName.startsWith("h")) role = `heading[${tagName}]`;

            let selector = tagName;
            if (el.id && /^[a-zA-Z0-9_-]+$/.test(el.id)) {
              selector = `#${el.id}`;
            } else if (name && !name.startsWith("[")) {
              const cleanText = name.slice(0, 20).replace(/["\\]/g, "");
              selector = `${tagName}:has-text("${cleanText}")`;
            }

            items.push({ role, name: name.slice(0, 40), selector });
          });
          return items;
        });

        rawElements.forEach((el, index) => {
          const ref = `e${index + 1}`;
          this.elementRefs.set(ref, el.selector);
          elements.push({ ref, role: el.role, name: el.name, selector: el.selector });
          outlineLines.push(`- [ref=${ref}] ${el.role} "${el.name}" (selector: ${el.selector})`);
        });
      } catch {
        // A page that cannot be evaluated has no element list, which the message
        // below says rather than a fabricated one.
      }
    }

    if (elements.length === 0) {
      outlineLines.push("(No interactive elements found on the current page)");
    }

    return {
      url: this.currentUrl,
      title: this.currentTitle,
      elements,
      outline: outlineLines.join("\n"),
    };
  }

  /**
   * Judge page, popup, and subresource requests using the current policy.
   * Routing sees only the first URL of a server redirect, so openUrl still
   * validates the landing URL. This is not per-hop network isolation.
   */
  private async installRequestGuard(context: PwBrowserContext): Promise<void> {
    await context.route("**/*", async (route) => {
      try {
        const admission = admitPageRequest(route.request().url(), this.requestPolicy);
        if (admission.allowed) {
          await route.continue();
          return;
        }
        await route.abort("blockedbyclient");
        this.requestFailure = {
          kind: "url-refused",
          reason: `A page request was blocked: ${admission.refusal!.reason}`,
          nextAction: admission.refusal!.nextAction,
          refusal: admission.refusal,
        };
      } catch (error) {
        // A failed disposition is not proof that a request was blocked.
        this.requestFailure = {
          kind: "action-failed",
          reason: `Request handling failed: ${error instanceof Error ? error.message : String(error)}`,
          nextAction: "Close the browser session and retry; request disposition could not be confirmed.",
        };
      }
    });
  }

  /** Where the page actually is. Read through one place so a failure has one shape. */
  private readPageUrl(): string {
    return this.currentPage?.url() ?? "";
  }

  /**
   * Resolve a ref or a raw selector to the selector to act on.
   *
   * A ref that was never observed is returned unchanged, so it reaches the page
   * as a selector and fails there with the page's own message. Reporting "no such
   * ref" here instead would be a second guess at what the caller meant.
   */
  resolveSelector(refOrSelector: string): string {
    const clean = refOrSelector.trim();
    return this.elementRefs.get(clean) ?? clean;
  }

  /**
   * Run one page action, turning both outcomes into a result.
   *
   * The page being absent is a failure, not a simulated success: an action that
   * reports it worked when no browser is running is the answer that makes a user
   * believe the page changed when nothing was loaded at all.
   */
  private async runAction(
    target: string,
    verb: string,
    act: (page: PwPage, selector: string) => Promise<void>,
  ): Promise<BrowserActionResult> {
    const selector = this.resolveSelector(target);
    // A page the caller never opened is not a failure of this action, and
    // launching a browser to answer it is worse than saying so: the launch
    // succeeds, the page is blank, and the action then spends its full locator
    // timeout waiting for an element on a page nobody asked for. The answer the
    // caller needs is that there is no page yet.
    const page = this.currentPage;
    if (!page) {
      return {
        ok: false,
        failure: this.sessionFailure ?? {
          kind: "not-launched",
          reason: "No page is open, so nothing was done.",
          nextAction: "Open a page first, then act on an element it lists.",
        },
      };
    }
    try {
      await act(page, selector);
      return { ok: true, output: `${verb} '${target}' (selector: ${selector}).` };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "action-failed",
          reason: `${verb} failed for '${target}': ${error instanceof Error ? error.message : String(error)}`,
          nextAction: "Observe the page again and use a ref from the current element list.",
        },
      };
    }
  }

  async click(refOrSelector: string): Promise<BrowserActionResult> {
    return this.runAction(refOrSelector, "Clicked element matching", (page, selector) =>
      page.click(selector, { timeout: 5000 }),
    );
  }

  async type(refOrSelector: string, text: string): Promise<BrowserActionResult> {
    return this.runAction(refOrSelector, `Typed "${text}" into element`, (page, selector) =>
      page.fill(selector, text, { timeout: 5000 }),
    );
  }

  async selectOption(refOrSelector: string, value: string): Promise<BrowserActionResult> {
    return this.runAction(refOrSelector, `Selected option "${value}" on`, (page, selector) =>
      page.selectOption(selector, value, { timeout: 5000 }),
    );
  }

  async hover(refOrSelector: string): Promise<BrowserActionResult> {
    return this.runAction(refOrSelector, "Hovered over", (page, selector) =>
      page.hover(selector, { timeout: 5000 }),
    );
  }

  async pressKey(key: string): Promise<BrowserActionResult> {
    // Same rule as the element actions: no page means nothing to press a key
    // into, and launching a browser to discover that spends seconds proving it.
    const page = this.currentPage;
    if (!page) {
      return {
        ok: false,
        failure: this.sessionFailure ?? {
          kind: "not-launched",
          reason: "No page is open, so no key was pressed.",
          nextAction: "Open a page first, then press the key.",
        },
      };
    }
    try {
      await page.keyboard.press(key);
      return { ok: true, output: `Pressed key '${key}'.` };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "action-failed",
          reason: `Key press failed for '${key}': ${error instanceof Error ? error.message : String(error)}`,
          nextAction: "Click the field first so the key has somewhere to go.",
        },
      };
    }
  }

  /** Close the session and release the browser. */
  async closeSession(): Promise<BrowserActionResult> {
    if (this.closePromise) return this.closePromise;
    const closing = (async () => {
      // A launch already in progress owns resources this close must observe.
      if (this.initPromise) await this.initPromise;
      return this.closeResources();
    })();
    this.closePromise = closing;
    try {
      return await closing;
    } finally {
      if (this.closePromise === closing) this.closePromise = null;
    }
  }

  private async closeResources(): Promise<BrowserActionResult> {
    const failures: string[] = [];
    const resources = [
      ["currentPage", "page"], ["context", "context"], ["browser", "browser"],
    ] as const;
    for (const [key, label] of resources) {
      const resource = this[key];
      if (!resource) continue;
      try {
        await resource.close();
        if (this[key] === resource) this[key] = null;
      } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.elementRefs.clear();
    this.requestFailure = null;
    if (failures.length > 0) {
      this.sessionFailure = {
        kind: "close-failed",
        reason: `Browser cleanup failed for ${failures.join("; ")}.`,
        nextAction: "Retry the close action before opening another browser session.",
      };
      return { ok: false, failure: this.sessionFailure };
    }
    this.currentUrl = "about:blank";
    this.currentTitle = "Blank Page";
    this.sessionFailure = null;
    return { ok: true, output: "Browser session closed and resources released." };
  }
}

export { BrowserSessionManager };
export const defaultBrowserSessionManager = new BrowserSessionManager();
