import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { receipt, save } from '../phase20-addition-resume-removal/observe.mjs';

receipt.syncTranscriptReads = 0;
receipt.expectedSyncTranscriptReadsPerDeletion = 0;
const read = fs.readFileSync;
fs.readFileSync = function(target, ...args) {
  if (String(target).endsWith('/transcript.jsonl')) receipt.syncTranscriptReads++;
  return read.call(this, target, ...args);
};
syncBuiltinESMExports();
save();
