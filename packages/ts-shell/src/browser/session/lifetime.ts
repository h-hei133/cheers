import type { PwBrowser } from '../playwrightRuntime.js';
const browsers = new Set<PwBrowser>();
let registered = false;

export function retainBrowser(browser: PwBrowser): void {
  browsers.add(browser);
  if (registered) return;
  registered = true;
  process.once('exit', () => { for (const resource of browsers) void resource.close().catch(() => {}); });
}

export function releaseBrowser(browser: PwBrowser): void { browsers.delete(browser); }
