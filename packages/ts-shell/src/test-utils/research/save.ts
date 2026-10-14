import fs from 'node:fs';
import path from 'node:path';
import { SessionManager } from '../../session/SessionManager.js';
import { ResearchRuntime } from '../../research/run/runtime.js';
import { researchSaveTool } from '../../research/report/save.js';

const [workspace, sessionId, phase] = process.argv.slice(2);
if (!workspace || !sessionId || !phase) throw new Error('Missing isolated save crash fixture arguments.');
const manager = new SessionManager();
const resumed = manager.tryResume(sessionId, workspace);
if (!resumed.ok) throw new Error('The isolated fixture session could not resume.');
const session = resumed.session;
const runtime = new ResearchRuntime({ store: manager, current: () => session, report: () => {} });
const run = runtime.current();
if (!run) throw new Error('Missing isolated research run.');
runtime.arm(run);
const context = { workspaceRoot: workspace, sessionId, taskId: `save-${phase}`,
  onEditOperationPrepared(operationId: string) {
    if (phase === 'prepared') process.exit(81);
    const published = (destination: fs.PathLike) => {
      const actual = fs.realpathSync(destination);
      if (phase === 'target' && actual === path.join(workspace, 'report.md')) process.exit(81);
      if (path.basename(actual) !== `${operationId}.json`) return;
      const receipt = JSON.parse(fs.readFileSync(actual, 'utf8'));
      if (receipt.operationId === operationId && receipt.callId === context.taskId
        && (phase === 'intent' && receipt.status === 'intent' || phase === 'receipt' && receipt.status === 'committed')) process.exit(81);
    };
    const link = fs.linkSync; const rename = fs.renameSync;
    fs.linkSync = (...args) => { link(...args); published(args[1]); };
    fs.renameSync = (...args) => { rename(...args); published(args[1]); };
  } };
const prepared = await researchSaveTool(runtime, run.id).prepare!({ runId: run.id, path: 'report.md' }, context);
await prepared.execute(context);
throw new Error('The save crash fixture did not reach its selected interruption.');
