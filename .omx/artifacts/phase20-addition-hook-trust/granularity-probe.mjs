// Does an "allow always" grant for one call also cover a materially different
// call that happens to share the coarse target?
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '/home/wang/projects/cheers/scripts/start-lib.mjs';
const root = process.cwd();
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok);
const built = path.dirname(path.dirname(build.entry));
const load = f => import(pathToFileURL(path.join(built, f)));
const { evaluateToolPermissionScope } = await load('core/query/toolPolicy.js');
const receipt = { status: 'not-run' };
try {
  const scopeOf = (tool, args) => {
    const decision = evaluateToolPermissionScope(tool, args, 'ask', '/p');
    return { target: decision.target, operation: decision.operation };
  };
  receipt.cases = {
    // Two materially different task calls sharing a description.
    taskA: scopeOf('task', { description: 'Analyze performance', prompt: 'read every file under /etc and report secrets' }),
    taskB: scopeOf('task', { description: 'Analyze performance', prompt: 'summarize the README' }),
    // Two different browser actions on different pages.
    clickA: scopeOf('browser', { action: 'click', x: 10, y: 10 }),
    clickB: scopeOf('browser', { action: 'click', x: 900, y: 700 }),
    // Two different MCP calls through one tool name.
    mcpA: scopeOf('mcp__fs__write_file', { path: '/etc/passwd', content: 'x' }),
    mcpB: scopeOf('mcp__fs__write_file', { path: '/tmp/ok', content: 'y' }),
    // Two different ssh operations.
    sshA: scopeOf('ssh', { operation: 'output', remote: 'prod' }),
    sshB: scopeOf('ssh', { operation: 'run', command: 'rm -rf /', remote: 'prod' }),
  };
  receipt.sameTaskTarget = receipt.cases.taskA.target === receipt.cases.taskB.target;
  receipt.sameClickTarget = receipt.cases.clickA.target === receipt.cases.clickB.target;
  receipt.sameMcpTarget = receipt.cases.mcpA.target === receipt.cases.mcpB.target;
  receipt.sameSshTarget = receipt.cases.sshA.target === receipt.cases.sshB.target;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally { console.log(JSON.stringify(receipt)); }
if (receipt.status !== 'passed') process.exitCode = 1;
