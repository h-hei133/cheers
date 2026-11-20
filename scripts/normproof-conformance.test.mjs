import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';
import { contract, extractPinned, readBundleMetadata, repository, requireDigest, requireRuntime } from '../.normproof/adapter/artifact.mjs';
import { runShadow } from '../.normproof/adapter/shadow.mjs';

fs.mkdirSync(path.join(repository, '.tmp'), { recursive: true });
const scratch = fs.mkdtempSync(path.join(repository, '.tmp/adapter-conformance-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const identity = extractPinned(scratch);
const load = member => import(pathToFileURL(path.join(scratch, 'package/dist', member)).href);
const graph = await load('adapters/sidecar-file/module-graph.js');
const collector = await load('adapters/sidecar-file/evidence-collector.js');
const { GRAPH_SAFETY } = await load('contracts/sidecar/graph-budget.js');
const fixture = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/adapter/fixtures/graph.json')));
const nativeRuntime = { skip: Number(process.versions.node.split('.')[0]) < 24 && 'The native package requires Node 24' };

function workspace(name, source = 'export function value() { return 1; }', entry = 'packages/entry.ts') {
  const root = path.join(scratch, name);
  fs.mkdirSync(path.dirname(path.join(root, entry)), { recursive: true });
  fs.mkdirSync(path.join(root, '.normproof/norm-packs/software-structure-v0'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: [] }));
  fs.writeFileSync(path.join(root, entry), source);
  for (const file of ['judge-input.json', 'evidence-manifest.json', 'norm-packs/software-structure-v0/profile.json']) {
    fs.copyFileSync(path.join(repository, '.normproof', file), path.join(root, '.normproof', file));
  }
  fs.writeFileSync(path.join(root, '.normproof/baseline.json'), JSON.stringify({
    version: 2, values: {}, moduleFunctionSeed: 20, moduleFunctionCeilings: {}
  }));
  return root;
}

function command(args, options = {}) {
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 4194304, ...options });
  assert.equal(run.error, undefined);
  assert.equal(run.signal, null);
  return run;
}

test('artifact: the archive identifies an upstream commit and verified members', () => {
  const metadata = readBundleMetadata();
  assert.equal(identity.sourceCommit, metadata.baseCommit);
  assert.deepEqual(identity.members, metadata.members);
  assert.equal(identity.archiveSha256, metadata.archiveSha256);
  assert.equal(identity.parserVersion, '5.9.3');
  assert.throws(() => requireDigest(Buffer.from('changed'), contract.archiveSha256, 'archive'), /stale_artifact/);
  assert.throws(() => requireRuntime('v20.2.0'), /unsupported_runtime/);
  assert.throws(() => requireRuntime('unknown'), /unsupported_runtime/);
  requireRuntime('v20.3.0');
});

test('paths: explicit .js only TS/TSX; explicit .ts/.tsx only themselves; extensionless and self edges survive', () => {
  for (const item of fixture.paths) {
    const sources = new Map([['packages/entry.ts', `import '${item.specifier}';`], ...item.modules.map(file => ['packages/' + file, ''])]);
    const result = graph.buildModuleGraph(sources);
    assert.deepEqual(result.edges, item.target ? [{ from: 'packages/entry.ts', to: 'packages/' + item.target, kind: 'value' }] : [], item.name);
    assert.deepEqual(result.unresolved, item.target ? [] : [{ from: 'packages/entry.ts', specifier: item.specifier }], item.name);
  }
});

test('ast: declarations, escapes, literal dynamics, TSX and whole-collection syntax refusal', () => {
  assert.deepEqual(graph.declaredSpecifiers(fixture.astSource), fixture.astTargets);
  assert.deepEqual(graph.declaredSpecifiers("import './view.js'; const view = <div/>;", 'view.tsx'), ['./view.js']);
  const result = graph.buildModuleGraph(new Map([['bad.ts', fixture.syntaxFailure], ['ok.ts', "import './ok.js';"]]));
  assert.match(result.failure, /^invalid:.*parser diagnostics/);
  assert.equal(result.edges, undefined);
  assert.deepEqual(graph.declaredSpecifiers(fixture.legacyBlindSpots), []);
  const unknown = graph.buildModuleGraph(new Map([['entry.ts', fixture.legacyBlindSpots]]));
  assert.equal(unknown.unresolved.length, 2);
});

test('cycles: type-only edges remain declared, with value edges identified separately', async () => {
  const workspaceRoot = workspace('types', "import type { Other } from './other.js'; export type Entry = Other;");
  const other = path.join(workspaceRoot, 'packages/other.ts');
  fs.writeFileSync(other, "import type { Entry } from './entry.js'; export type Other = Entry;");
  const manifest = { version: '0.1.0', workspace: workspaceRoot,
    entries: [{ id: 'graph', source: { kind: 'module-graph', pattern: 'packages/**/*.ts' } }] };
  const pure = await collector.collectEvidence(manifest, workspaceRoot);
  assert.deepEqual(pure.moduleEdges.graph.map(edge => edge.kind), ['type-only', 'type-only']);
  fs.appendFileSync(other, "\nimport './entry.js';");
  const mixed = await collector.collectEvidence(manifest, workspaceRoot);
  assert.deepEqual(mixed.moduleEdges.graph.map(edge => edge.kind), ['type-only', 'value']);
  fs.appendFileSync(path.join(workspaceRoot, 'packages/entry.ts'), "\nimport './other.js';");
  const runtime = await collector.collectEvidence(manifest, workspaceRoot);
  const { evaluateObligationExpression } = await load('engine/proof/expression/evaluate.js');
  for (const [capture, satisfied] of [[pure, true], [mixed, true], [runtime, false]]) {
    const result = await evaluateObligationExpression({ kind: 'acyclic', evidenceId: 'graph' },
      { inputs: { evidences: capture.evidences }, graphBudgets: capture.graphBudgets,
        reader: async () => ({ content: capture.fileSetListings.graph }) });
    assert.equal(result.satisfied, satisfied, result.reason);
  }
});

test('capacity: a committed path allowance is admitted through its exact bound', async () => {
  const root = workspace('paths');
  for (let index = 1; index < 4; index++) fs.writeFileSync(path.join(root, `packages/m${index}.ts`), '');
  const manifest = { version: '0.1.0', workspace: root, entries: [{ id: 'graph', source: {
    kind: 'module-graph', pattern: 'packages/**/*.ts*', resources: {
      version: '1', sourceSnapshot: 'sha256:' + '0'.repeat(64),
      accepted: { ...GRAPH_SAFETY, paths: 2 }, growth: { paths: 2 }
    }
  } }] };
  const exact = await collector.collectEvidence(manifest, root);
  assert.equal(exact.evidences.graph.error, undefined);
  fs.writeFileSync(path.join(root, 'packages/extra.ts'), '');
  const oversized = await collector.collectEvidence(manifest, root);
  assert.match(oversized.evidences.graph.error, /^oversized:/);
  assert.equal(oversized.fileSetListings.graph, undefined);
});

test('capacity: source overflow remains a native not_proven verdict in shadow observation', nativeRuntime, () => {
  const large = workspace('large', ' '.repeat(1048577));
  const extract = path.join(scratch, 'large-extract'); fs.mkdirSync(extract);
  const result = runShadow(large, path.join(scratch, 'large-out'), extract);
  assert.equal(result.underlyingExitCode, 2);
  assert.equal(result.proofVerdict, 'not_proven');
  assert.equal(result.hostExitCode, 0);
  const ledger = JSON.parse(fs.readFileSync(path.join(repository, result.artifacts, 'ledger.json')));
  assert.match(JSON.stringify(ledger), /oversized:/);
});

test('report: native advisory cycle/name ceiling remain visible with partial verdict and exit 0', nativeRuntime, () => {
  const root = workspace('advisory', "import './entry.js';\n" + Array.from({ length: 21 }, (_, i) => `export function f${i}() { return ${i}; }`).join('\n'), 'packages/example/src/entry.ts');
  const output = path.join(scratch, 'advisory-out');
  const run = command([path.join(scratch, 'package/dist/adapters/cli/normproof.js'), 'judge', path.join(root, '.normproof/judge-input.json'), output,
    '--evidence-manifest', path.join(root, '.normproof/evidence-manifest.json')], { cwd: root });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const verdict = JSON.parse(fs.readFileSync(path.join(output, 'verdict.json')));
  assert.equal(verdict.status, 'partial');
  const report = fs.readFileSync(path.join(output, 'report.md'), 'utf8');
  for (const id of ['source_graph_is_acyclic', 'declared_functions_within_module_ceiling']) {
    assert.equal(verdict.obligations.find(item => item.id === id).blocking, false);
    assert.equal(verdict.obligations.find(item => item.id === id).status, 'failed');
    assert.match(report.split('## Obligations')[1].split('## Evidence')[0], new RegExp(`${id}: failed`));
    assert.match(report.split('## Missing Or Failed Obligations (All Severities)')[1], new RegExp(`${id}: failed`));
  }
  console.log(JSON.stringify({ exitCode: run.status, verdict: verdict.status, advisoryVisible: true }));
});

test('policy: workspace direction and module function scope agree at write and completion', async () => {
  const root = workspace('policy', 'export function value() {}', 'packages/browser/src/entry.ts');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.normproof/evidence-manifest.json')));
  const profile = JSON.parse(fs.readFileSync(path.join(root, '.normproof/norm-packs/software-structure-v0/profile.json')));
  const rules = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/write-rules.json')));
  const { workspaces } = JSON.parse(fs.readFileSync(path.join(repository, 'package.json')));
  const domains = workspaces.filter(dir => dir !== 'packages/ts-shell').map(dir => `${dir}/**`);
  const to = 'packages/ts-shell/**';
  const boundaries = profile.obligationTemplates.filter(item => item.expression.kind === 'noDependency' && item.expression.to === to);
  assert.deepEqual(boundaries.map(item => item.expression.from).sort(), domains.sort());
  for (const { id, expression, severity } of boundaries) {
    const write = rules.rules.find(item => item.id === id);
    assert.deepEqual([severity, expression.reachable, write?.kind, write?.from, write?.to],
      ['blocking', true, 'noReachableDependency', expression.from, to]);
  }
  const functionSource = manifest.entries.find(item => item.id === 'source_module_functions').source;
  assert.equal(rules.rules.find(item => item.kind === 'moduleFunctionBaseline').pattern, functionSource.pattern);
  fs.writeFileSync(path.join(root, 'packages/browser/api.d.ts'), Array.from({ length: 21 }, (_, i) => `export declare function f${i}(): void;`).join('\n'));
  const captured = await collector.collectEvidence(manifest, path.join(root, '.normproof'));
  assert.deepEqual({ ...captured.moduleFunctionCounts.source_module_functions }, { 'packages/browser/src/entry.ts': 1 });
});

test('hooks: pinned write CLI emits allow and block JSON with process exit 0', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/write-gate/artifact.json'), 'utf8'));
  const projectHooks = JSON.parse(fs.readFileSync(path.join(repository, '.agents/hooks.json'), 'utf8'));
  const { provenance, ...descriptor } = artifact;
  assert.deepEqual(projectHooks.hooks.PreToolUse[0].hooks[0].writeGate, descriptor);
  assert.equal(provenance.commit, readBundleMetadata().baseCommit);
  const clean = workspace('write');
  fs.writeFileSync(path.join(clean, '.normproof/write-rules.json'), JSON.stringify({ version: '0.1.0', rules: [{ kind: 'pathBoundary', id: 'protected', deny: ['target.ts'], message: 'protected' }] }));
  const entry = path.join(repository, descriptor.path);
  const cases = [['allowed.ts', 'allow'], ['target.ts', 'block']].map(([file, decision], id) => ({
    decision, request: { jsonrpc: '2.0', id, method: 'writeGate/check', params: {
      cwd: clean, tool_name: 'Write', tool_input: { file_path: file, content: 'fixture' },
    } },
  }));
  assert.equal(descriptor.workerProtocol, 1);
  const batch = command([entry, 'gate', 'write', '--stdio'], { input: cases.map(({ request }) => JSON.stringify(request)).join('\n') + '\n' });
  assert.equal(batch.status, 0);
  const replies = batch.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(replies.length, cases.length);
  for (const { decision, request } of cases) {
    const single = command([entry, 'gate', 'write', '--emit-result'], { input: JSON.stringify(request.params) });
    assert.equal(single.status, 0);
    const result = JSON.parse(single.stdout);
    assert.equal(result.decision, decision);
    assert.deepEqual(replies[request.id], { jsonrpc: '2.0', id: request.id, result });
  }
});

test('hooks: the native Stop emits a versioned decision for both clean and blocked workspaces', nativeRuntime, () => {
  const clean = workspace('clean');
  const bad = workspace('bad', "import './missing.js';");
  const cli = path.join(scratch, 'package/dist/adapters/cli/normproof.js');
  for (const [root, expected] of [[clean, 'allow'], [bad, 'block']]) {
    const run = command([cli, 'gate', 'stop', '--emit-result'], { cwd: root, input: JSON.stringify({ cwd: root, hook_event_name: 'Stop', stop_hook_active: false }) });
    assert.equal(run.status, 0);
    const wire = JSON.parse(run.stdout);
    assert.equal(wire.decision, expected);
    assert.deepEqual(wire.contract, { name: 'normproof.completion-gate.stop', version: '0.1.0' });
    if (expected === 'block') assert.equal(wire.reasonCode, 'actionable_gap');
  }
});

test('hooks: Stop blocks unresolved exports for three improving repair rounds', nativeRuntime, () => {
  const root = workspace('repair', 'export const a = 1, b = 2, c = 3;', 'packages/example/src/entry.ts');
  const entry = path.join(root, 'packages/example/src/entry.ts');
  fs.writeFileSync(path.join(root, 'packages/example/src/use.ts'), "import { a, b, c } from './entry.js'; export const total = a + b + c;");
  fs.copyFileSync(path.join(repository, '.normproof/write-rules.json'), path.join(root, '.normproof/write-rules.json'));
  const write = command([path.join(repository, '.normproof/write-gate/cli.mjs'), 'gate', 'write', '--emit-result'], {
    cwd: root, input: JSON.stringify({ cwd: root, tool_name: 'Edit', tool_input: { file_path: entry, content: 'export {};' } })
  });
  assert.equal(write.status, 0, write.stderr);
  assert.equal(JSON.parse(write.stdout).decision, 'allow_with_advisory');
  const projectHooks = JSON.parse(fs.readFileSync(path.join(repository, '.agents/hooks.json'), 'utf8'));
  assert.equal(projectHooks.hooks.Stop[0].hooks[0].command,
    'npx --yes --package .normproof/normproof-0.1.0.tgz normproof gate stop --emit-result');
  const cli = path.join(scratch, 'package/dist/adapters/cli/normproof.js');
  const stop = active => {
    const run = command([cli, 'gate', 'stop', '--emit-result'], { cwd: root, input: JSON.stringify({
      cwd: root, hook_event_name: 'Stop', session_id: 'repair-exports', stop_hook_active: active, stop_repair_protocol: 1
    }) });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  };
  let chainId;
  for (const [index, source] of ['export {};', 'export const a = 1;', 'export const a = 1, b = 2;'].entries()) {
    fs.writeFileSync(entry, source);
    const result = stop(index > 0);
    assert.equal(result.decision, 'block', result.reason);
    assert.match(result.reason, /entry\.js#c/);
    chainId ??= result.stopRepair.chainId;
    assert.deepEqual([result.stopRepair.round, result.stopRepair.maxRounds, result.stopRepair.chainId], [index + 1, 3, chainId]);
  }
  fs.writeFileSync(entry, 'export const a = 1, b = 2, c = 3;');
  assert.equal(stop(true).decision, 'allow');
});

test('hooks: current host consumes captured R0a envelopes; fixture producer is not the pinned release', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = command([path.join(repository, 'node_modules/tsx/dist/cli.mjs'), '--conditions=cheers-source', path.join(repository, 'scripts/normproof/host.test.mts')], { env });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /tests 2/);
  assert.match(run.stdout, /pass 2/);
});

test('MCP initialize: the pinned server negotiates supported revisions and rejects an unknown one', nativeRuntime, () => {
  const server = path.join(scratch, 'package/dist/adapters/protocol/stdio-server.js');
  for (const protocolVersion of ['2025-11-25', '2026-07-28', 'unknown-version']) {
    const frame = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion, capabilities: {}, clientInfo: { name: 'adapter-conformance', version: '1.0.0' } } };
    const run = command([server], { input: JSON.stringify(frame) + '\n' });
    assert.equal(run.status, 0);
    const output = JSON.parse(run.stdout);
    if (protocolVersion === 'unknown-version') {
      assert.equal(output.error.code, -32602);
      assert.equal(output.result, undefined);
    } else {
      assert.equal(output.result.protocolVersion, protocolVersion);
      assert.equal(output.error, undefined);
    }
  }
});

test('shadow: a real blocking failure remains failed while observation exits 0; blocking command is unavailable', nativeRuntime, () => {
  const root = workspace('shadow', "import './missing.js';");
  const run = command([path.join(repository, '.normproof/adapter/cli.mjs'), 'shadow', root, path.join(scratch, 'shadow-output')]);
  assert.equal(run.status, 0);
  const result = JSON.parse(run.stdout);
  assert.equal(result.mode, 'shadow'); assert.equal(result.canBlock, false);
  assert.equal(result.underlyingExitCode, 2); assert.equal(result.proofVerdict, 'failed');
  console.log(JSON.stringify({ mode: result.mode, canBlock: result.canBlock, underlyingExitCode: result.underlyingExitCode, hostExitCode: run.status, proofVerdict: result.proofVerdict }));
  const blocking = command([path.join(repository, '.normproof/adapter/cli.mjs'), 'blocking', root]);
  assert.equal(blocking.status, 1);
  assert.match(blocking.stderr, /blocking is unavailable/);
});
