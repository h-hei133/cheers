import type { Picker, PickerOutcome } from '../../overlay.js';
import { sessionSelectionBlock } from '../../../../session/navigation/selection.js';
import type { SessionPickerOptions } from './contract.js';
import type { SessionListingBrowse } from './listing.js';
import { SessionBrowser, sameSessionContext } from './browser.js';

export function sessionActions(browser: SessionBrowser,
  reopen: (options: SessionPickerOptions, browse?: SessionListingBrowse) => Picker): Pick<Picker, 'apply' | 'onDelete' | 'onRename' | 'onPin'> {
  const options = browser.options;
  const blocked = (id: string, action: 'resume' | 'rename' | 'delete' | 'pin'): string | undefined => {
    try { const issue = options.admission?.(); if (issue) return issue; }
    catch { return 'Session selection is unavailable. Reopen the session picker.'; }
    if (!browser.active()?.offered.has(id)) return 'This session was not offered. Reopen the session picker.';
    return sessionSelectionBlock({ expected: browser.expected, current: options.context(), target: options.sessionManager.getSession(id), targetId: id, action });
  };
  const update = async (id: string, action: 'delete' | 'rename' | 'pin', title?: string): Promise<string | undefined> => {
    const block = blocked(id, action);
    if (block) return block;
    const version = browser.active()?.versions.get(id);
    const note = action === 'delete' ? await options.delete!(id, version)
      : action === 'rename' ? await options.rename!(id, title!, version) : await options.pin!(id, version);
    if (!note) browser.close();
    return note;
  };
  return {
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (ids.length !== 1 || !ids[0]) return undefined;
      const sessionId = ids[0];
      if (sessionId === 'action:refresh') {
        if (!browser.refreshOffered) return { note: 'This refresh action was not offered. Reopen the session picker.' };
        browser.close();
        return { next: reopen({ ...options, continuation: undefined, initialQuery: undefined }) };
      }
      if (sessionId === 'action:more') {
        const projection = browser.active();
        const next = projection?.continuation;
        if (!next || browser.pagePending || !projection.rows.some(row => row.id === 'action:more')) return { note: 'This page was not offered. Reopen the session picker.' };
        const current = options.context();
        let unavailable = false;
        try { unavailable = !!options.admission?.(); } catch { unavailable = true; }
        if (unavailable || current.busy || !sameSessionContext(browser.expected, current)) return { note: 'Session page expired. Reopen the session picker.' };
        const browse = browser.listing.takeBrowse();
        browser.clearPage();
        try {
          return { next: reopen({ ...options, initialLimit: browser.limit, continuation: next,
            initialQuery: browser.lastQuery }, browse) };
        } catch (error) {
          if (browse) options.sessionManager.catalog.retireBrowse(browse.token);
          throw error;
        }
      }
      const action = options.action ?? 'resume';
      const block = blocked(sessionId, action);
      if (block) return { note: block };
      const version = browser.active()?.versions.get(sessionId);
      const query = browser.lastQuery;
      browser.close();
      if (action === 'pin') {
        if (!options.pin) return { note: 'Session pinning is unavailable.' };
        const note = await options.pin(sessionId, version);
        return note ? { note } : { next: reopen({ ...options, continuation: undefined, initialQuery: query }) };
      }
      const note = await options.resume(sessionId, version);
      return note ? { note } : undefined;
    },
    onDelete: options.delete ? (id: string) => update(id, 'delete') : undefined,
    onRename: options.rename ? (id: string, title: string) => update(id, 'rename', title) : undefined,
    onPin: options.pin ? (id: string) => update(id, 'pin') : undefined,
  };
}
