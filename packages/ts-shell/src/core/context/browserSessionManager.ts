import type { PwBrowser, PwBrowserContext, PwPage } from "./pwRuntime.js";
import {
  STEALTH_LAUNCH_ARGS,
  STEALTH_IGNORE_DEFAULT_ARGS,
  DEFAULT_USER_AGENT,
  DEFAULT_VIEWPORT,
  buildStealthPreloadScript,
} from "./stealthPreload.js";
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

class BrowserSessionManager {
  private browser: PwBrowser | null = null;
  private context: PwBrowserContext | null = null;
  private currentPage: PwPage | null = null;
  private currentUrl = "about:blank";
  private currentTitle = "Blank Page";
  private elementRefs: Map<string, string> = new Map();
  private mockHtmlContent: string | null = null;
  private initPromise: Promise<PwPage | null> | null = null;

  /**
   * Set mock HTML content for testing or simulated environments
   */
  setMockHtml(html: string, url = "http://localhost:3000"): void {
    this.mockHtmlContent = html;
    this.currentUrl = url;
  }

  /**
   * Get active page or initialize browser instance with concurrency mutex
   */
  async getOrCreatePage(): Promise<PwPage | null> {
    if (this.currentPage) {
      return this.currentPage;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const pw = await (Function('return import("playwright-core")')().catch(
          () => Function('return import("playwright")')().catch(() => null),
        ));

        if (pw?.chromium) {
          this.browser = await pw.chromium.launch({
            headless: true,
            args: [...STEALTH_LAUNCH_ARGS],
            ignoreDefaultArgs: [...STEALTH_IGNORE_DEFAULT_ARGS],
          });
          this.context = await this.browser!.newContext({
            userAgent: DEFAULT_USER_AGENT,
            viewport: DEFAULT_VIEWPORT,
            locale: "en-US",
            timezoneId: "America/New_York",
          });
          this.currentPage = await this.context!.newPage();

          // Inject composite Anti-Detection stealth preload script
          const stealthScript = buildStealthPreloadScript();
          await (this.currentPage as any).addInitScript?.(stealthScript);

          return this.currentPage;
        }
      } catch (err) {
        if (this.browser) {
          await this.browser.close().catch(() => {});
          this.browser = null;
          this.context = null;
          this.currentPage = null;
        }
      } finally {
        this.initPromise = null;
      }
      return null;
    })();

    return this.initPromise;
  }

  /**
   * Open / navigate to URL
   */
  async openUrl(url: string, timeoutMs = 20_000): Promise<{ url: string; title: string }> {
    this.currentUrl = url;
    this.elementRefs.clear();

    const page = await this.getOrCreatePage();
    if (page) {
      try {
        await (page as any).goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });
        this.currentTitle = await page.title().catch(() => url);
      } catch {
        this.currentTitle = url;
      }
    } else {
      this.currentTitle = `Simulated Session: ${url}`;
    }

    return { url: this.currentUrl, title: this.currentTitle };
  }

  /**
   * Observe page and build ARIA-like element reference tree
   */
  async observe(): Promise<ObservedPageState> {
    this.elementRefs.clear();
    const elements: BrowserElementRef[] = [];

    const page = await this.getOrCreatePage();
    if (page) {
      try {
        this.currentUrl = (await (page as any).url?.()) || this.currentUrl;
        this.currentTitle = (await (page as any).title?.()) || this.currentTitle;
      } catch {
        // Keep existing
      }
    }

    const outlineLines: string[] = [
      `Page URL: ${this.currentUrl}`,
      `Page Title: ${this.currentTitle}`,
      "",
      "Interactive Elements:",
    ];

    if (page) {
      try {
        const rawElements = (await (page as any).evaluate(() => {
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

            // Build a stable escaped selector
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
        })) as Array<{ role: string; name: string; selector: string }>;

        rawElements.forEach((el, index) => {
          const ref = `e${index + 1}`;
          this.elementRefs.set(ref, el.selector);
          elements.push({ ref, role: el.role, name: el.name, selector: el.selector });
          outlineLines.push(`- [ref=${ref}] ${el.role} "${el.name}" (selector: ${el.selector})`);
        });
      } catch {
        // Fallback if evaluate fails
      }
    }

    if (elements.length === 0) {
      if (this.mockHtmlContent) {
        // Support both paired tags and void input/img tags
        const mockMatches = Array.from(this.mockHtmlContent.matchAll(/<(button|a|h1|h2)[^>]*>([^<]*)<\/\1>|<(input)[^>]*>/gi));
        mockMatches.slice(0, 20).forEach((m, idx) => {
          const ref = `e${idx + 1}`;
          const role = m[1] || m[3];
          const name = (m[2] || "").trim() || (role === "input" ? "Input Field" : "Item");
          const selector = `${role}:text("${name}")`;
          this.elementRefs.set(ref, selector);
          elements.push({ ref, role, name, selector });
          outlineLines.push(`- [ref=${ref}] ${role} "${name}"`);
        });
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
   * Resolve ref or raw selector to actual target selector
   */
  resolveSelector(refOrSelector: string): string {
    const clean = refOrSelector.trim();
    if (this.elementRefs.has(clean)) {
      return this.elementRefs.get(clean)!;
    }
    return clean;
  }

  /**
   * Click element by ref or selector
   */
  async click(refOrSelector: string): Promise<string> {
    const selector = this.resolveSelector(refOrSelector);
    const page = await this.getOrCreatePage();
    if (page) {
      try {
        await (page as any).click(selector, { timeout: 5000 });
        return `Clicked element matching '${refOrSelector}' (selector: ${selector}).`;
      } catch (err: any) {
        return `Click attempt failed for '${refOrSelector}': ${err.message}`;
      }
    }
    return `Simulated click on element '${refOrSelector}' (selector: ${selector}).`;
  }

  /**
   * Type text into input element by ref or selector
   */
  async type(refOrSelector: string, text: string): Promise<string> {
    const selector = this.resolveSelector(refOrSelector);
    const page = await this.getOrCreatePage();
    if (page) {
      try {
        await (page as any).fill(selector, text, { timeout: 5000 });
        return `Typed "${text}" into element '${refOrSelector}' (selector: ${selector}).`;
      } catch (err: any) {
        return `Type attempt failed for '${refOrSelector}': ${err.message}`;
      }
    }
    return `Simulated type "${text}" into element '${refOrSelector}' (selector: ${selector}).`;
  }

  /**
   * Select dropdown option
   */
  async selectOption(refOrSelector: string, value: string): Promise<string> {
    const selector = this.resolveSelector(refOrSelector);
    const page = await this.getOrCreatePage();
    if (page) {
      try {
        await (page as any).selectOption(selector, value, { timeout: 5000 });
        return `Selected option "${value}" on '${refOrSelector}' (selector: ${selector}).`;
      } catch (err: any) {
        return `Select option failed for '${refOrSelector}': ${err.message}`;
      }
    }
    return `Simulated select "${value}" on element '${refOrSelector}'.`;
  }

  /**
   * Hover over element
   */
  async hover(refOrSelector: string): Promise<string> {
    const selector = this.resolveSelector(refOrSelector);
    const page = await this.getOrCreatePage();
    if (page) {
      try {
        await (page as any).hover(selector, { timeout: 5000 });
        return `Hovered over element '${refOrSelector}'.`;
      } catch (err: any) {
        return `Hover failed for '${refOrSelector}': ${err.message}`;
      }
    }
    return `Simulated hover over '${refOrSelector}'.`;
  }

  /**
   * Press keyboard key
   */
  async pressKey(key: string): Promise<string> {
    const page = await this.getOrCreatePage();
    if (page) {
      try {
        await (page as any).keyboard?.press(key);
        return `Pressed key '${key}'.`;
      } catch (err: any) {
        return `Key press failed for '${key}': ${err.message}`;
      }
    }
    return `Simulated key press '${key}'.`;
  }

  /**
   * Close active browser session and release resources
   */
  async closeSession(): Promise<string> {
    try {
      if (this.currentPage) {
        await this.currentPage.close().catch(() => {});
        this.currentPage = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch {
      // Ignore close failures
    }
    this.elementRefs.clear();
    this.currentUrl = "about:blank";
    this.currentTitle = "Blank Page";
    return "Browser session closed and resources released.";
  }
}

export const defaultBrowserSessionManager = new BrowserSessionManager();
