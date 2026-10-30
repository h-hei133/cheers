import { receipt, save } from '../phase20-addition-resume-removal/observe.mjs';
import '../phase20-addition-session-management/observe.mjs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { AgentRegistryScanner } = await import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD,
  'core/messaging/agentRegistryScanner.js')));
receipt.syncTranscriptReadsBySession = {};
receipt.transcriptReadSites = [];
const read = fs.readFileSync;
fs.readFileSync = function(target, ...args) {
  if (String(target).endsWith('/transcript.jsonl')) {
    const id = path.basename(path.dirname(String(target)));
    receipt.syncTranscriptReadsBySession[id] = (receipt.syncTranscriptReadsBySession[id] ?? 0) + 1;
    if (receipt.transcriptReadSites.length < 32) receipt.transcriptReadSites.push({ id,
      site: new Error().stack.split('\n').slice(2, 8).map(line => line.replaceAll(process.env.CHEERS_PROBE_BUILD, '<build>')) });
  }
  return read.call(this, target, ...args);
};
syncBuiltinESMExports();
receipt.peerScans = 0;
receipt.panelPeerScans = 0;
const scan = AgentRegistryScanner.prototype.scanAllReachableAgents;
AgentRegistryScanner.prototype.scanAllReachableAgents = function(...args) {
  receipt.peerScans++;
  if (receipt.snapshot?.title === 'Resume session') receipt.panelPeerScans++;
  save(); return scan.apply(this, args);
};
save();
