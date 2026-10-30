import { receipt, save } from '../phase20-addition-resume-removal/observe.mjs';
import '../phase20-addition-catalog-scheduling/observe.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { SessionCatalog } = await import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD,
  'session/store/catalog/index.js')));
const { CatalogBrowses } = await import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD,
  'session/store/catalog/browse.js')));
receipt.catalogSnapshots = [];
receipt.cancelledBrowses = 0;
const retire = CatalogBrowses.prototype.retire;
CatalogBrowses.prototype.retire = function(token) {
  const state = this.states?.get(token.id), result = retire.call(this, token);
  if (result && state?.controller.signal.aborted) receipt.cancelledBrowses++;
  save(); return result;
};
const list = SessionCatalog.prototype.list;
SessionCatalog.prototype.list = async function* (...args) {
  for await (const snapshot of list.apply(this, args)) {
    if (args[5]?.browse) {
      receipt.catalogSnapshots.push({ scanned: snapshot.scanned, unreadable: snapshot.unreadable,
        status: snapshot.status, total: snapshot.total, hasMore: snapshot.hasMore,
        sourceLimited: snapshot.sourceLimited === true });
      save();
    }
    yield snapshot;
  }
};
save();
