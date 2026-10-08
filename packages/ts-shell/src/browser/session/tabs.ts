import type { PwPage } from '../playwrightRuntime.js';
import { ResourceCleanup } from './cleanup.js';

export interface BrowserTab { readonly id: string; readonly url: string; readonly selected: boolean }
interface Tab { readonly id: string; readonly page: PwPage; generation: number }

/** Pages, document identities and observed refs belong to one browser context. */
export class BrowserTabs {
  constructor(private readonly cleanup = new ResourceCleanup()) {}
  private readonly entries = new Map<PwPage, Tab>();
  private readonly refs = new Map<string, { tab: Tab; generation: number; selector: string }>();
  private nextTab = 1;
  private nextRef = 1;
  current: PwPage | null = null;
  readonly dialogs: Array<{ state: 'pending' | 'dismissed' | 'failed' }> = [];
  failure?: string;

  register(page: PwPage): void {
    if (this.entries.has(page)) return;
    const tab = { id: `t${this.nextTab++}`, page, generation: 0 };
    this.entries.set(page, tab);
    this.current ??= page;
    page.on?.('close', () => this.remove(page));
    page.on?.('crash', () => this.remove(page));
    page.on?.('framenavigated', () => this.invalidate(page));
    page.on?.('popup', (popup: PwPage) => this.register(popup));
    // A page cannot silently accept a confirm/prompt while tools are observing it.
    page.on?.('dialog', (dialog: { dismiss(): Promise<void> }) => {
      const record = { state: 'pending' as 'pending' | 'dismissed' | 'failed' };
      this.dialogs.push(record); if (this.dialogs.length > 8) this.dialogs.shift();
      void dialog.dismiss().then(() => { record.state = 'dismissed'; }, () => {
        record.state = 'failed'; this.failure = 'Browser dialog dismissal failed. Close the session before continuing.';
      });
    });
    if (this.entries.size > 8) {
      this.failure = 'Browser exceeded the 8 tab limit. Close the session before continuing.';
      void this.cleanup.close(page).then(result => { if (result === 'closed') this.remove(page); });
    }
  }

  list(): readonly BrowserTab[] {
    return [...this.entries.values()].map(tab => ({ id: tab.id, url: tab.page.url(), selected: tab.page === this.current }));
  }

  select(id: string): void {
    const tab = [...this.entries.values()].find(entry => entry.id === id);
    if (!tab) throw new Error('The selected tab is unavailable. List tabs again.');
    this.current = tab.page;
    this.refs.clear();
  }

  binding(): string {
    const tab = this.current && this.entries.get(this.current);
    if (!tab) throw new Error('No browser tab is open.');
    return JSON.stringify([tab.id, tab.generation, tab.page.url()]);
  }

  invalidate(page: PwPage = this.current!): void {
    const tab = this.entries.get(page);
    if (tab) tab.generation++;
    this.refs.clear();
  }

  ref(selector: string): string {
    const tab = this.current && this.entries.get(this.current);
    if (!tab) throw new Error('No browser tab is open.');
    const ref = `e${this.nextRef++}`;
    this.refs.set(ref, { tab, generation: tab.generation, selector });
    return ref;
  }

  resolve(value: string): string {
    const clean = value.trim();
    if (!/^e\d+$/.test(clean)) return clean;
    const ref = this.refs.get(clean);
    if (!ref || ref.tab.page !== this.current || ref.tab.generation !== ref.generation) {
      throw new Error('This element ref is stale or belongs to another tab. Observe the selected tab again.');
    }
    return ref.selector;
  }

  async close(id: string): Promise<'closed' | 'failed' | 'unknown'> {
    const tab = [...this.entries.values()].find(entry => entry.id === id);
    if (!tab) throw new Error('The selected tab is unavailable.');
    const result = await this.cleanup.close(tab.page);
    if (result === 'closed') this.remove(tab.page);
    return result;
  }

  async closeAll(): Promise<readonly string[]> {
    const failures: string[] = [];
    for (const tab of [...this.entries.values()]) {
      const result = await this.cleanup.close(tab.page);
      if (result === 'closed') this.remove(tab.page);
      else failures.push(`page ${tab.id}: ${result}`);
    }
    if (!failures.length) { this.failure = undefined; this.dialogs.length = 0; }
    return failures;
  }

  private remove(page: PwPage): void {
    this.entries.delete(page);
    if (this.current === page) this.current = this.entries.keys().next().value ?? null;
    this.refs.clear();
  }
}
