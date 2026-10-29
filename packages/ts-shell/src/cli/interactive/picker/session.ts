import type { Picker } from '../overlay.js';
import { SessionBrowser } from './session/browser.js';
import { sessionActions } from './session/actions.js';
import type { SessionPickerOptions } from './session/contract.js';
import type { SessionListingBrowse } from './session/listing.js';
import { sessionPreview } from './session/preview.js';

export type { SessionPickerOptions } from './session/contract.js';
export { groupedOptions } from './session/projection.js';

/** One full-screen chooser owns one catalog browse source across its pages. */
export function sessionPicker(options: SessionPickerOptions, browse?: SessionListingBrowse): Picker {
  const browser = new SessionBrowser(options, browse);
  return {
    ...sessionActions(browser, sessionPicker),
    onOpen: () => browser.open(),
    title: options.action === 'pin' ? 'Pin saved session' : 'Resume session',
    form: 'panel',
    fullScreen: true,
    chips: {
      items: [{ id: 'project', label: 'This project' }, { id: 'all', label: 'All projects' }],
      active: browser.allProjects ? 'all' : 'project',
      select: id => {
        browser.close();
        return sessionPicker({ ...options, continuation: undefined, allProjects: id === 'all' });
      },
    },
    get empty() { return browser.empty; },
    loadError: 'Saved sessions could not be loaded.',
    searchError: 'Session search could not be completed. The loaded results are incomplete.',
    footer: [options.action === 'pin' ? 'Enter: toggle pin.' : undefined,
      'Session files: logical size; excludes attachments.',
      'Pages and searches reuse a bounded browse index; reopen to include changes to earlier results.'].filter(Boolean).join(' '),
    defaultSelection: rows => browser.defaultSelection(rows),
    get initialFilter() { return options.initialQuery?.trim() || undefined; },
    onSearchChange: query => browser.changeSearch(query),
    onSearchClear: () => browser.clearSearch(),
    detail: id => {
      const projection = browser.active();
      const summary = id ? projection?.summaries.get(id) : undefined;
      return summary ? sessionPreview(summary, projection?.sizes.get(summary.id), browser.expected.sessionId) : [];
    },
    status: (visible, query) => browser.status(visible, query),
    load: signal => browser.load(signal),
    search: (query, signal) => browser.search(query, signal),
    subscribe: publish => browser.subscribe(publish),
    previewEnd: () => browser.close(),
  };
}
