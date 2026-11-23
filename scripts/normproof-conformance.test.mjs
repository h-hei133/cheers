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
const nativeRuntime = { skip: false };

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

test('report: native blocking cycle fails exit 2 while advisory name ceiling remains visible with partial verdict and exit 0', nativeRuntime, () => {
  const advisoryRoot = workspace('advisory', Array.from({ length: 21 }, (_, i) => `export function f${i}() { return ${i}; }`).join('\n'), 'packages/example/src/entry.ts');
  const advisoryOut = path.join(scratch, 'advisory-out');
  const advisoryRun = command([path.join(scratch, 'package/dist/adapters/cli/normproof.js'), 'judge', path.join(advisoryRoot, '.normproof/judge-input.json'), advisoryOut,
    '--evidence-manifest', path.join(advisoryRoot, '.normproof/evidence-manifest.json')], { cwd: advisoryRoot });
  assert.equal(advisoryRun.status, 0, advisoryRun.stdout + advisoryRun.stderr);
  const advisoryVerdict = JSON.parse(fs.readFileSync(path.join(advisoryOut, 'verdict.json')));
  assert.equal(advisoryVerdict.status, 'partial');
  const advisoryReport = fs.readFileSync(path.join(advisoryOut, 'report.md'), 'utf8');
  assert.equal(advisoryVerdict.obligations.find(item => item.id === 'declared_functions_within_module_ceiling').blocking, false);
  assert.equal(advisoryVerdict.obligations.find(item => item.id === 'declared_functions_within_module_ceiling').status, 'failed');
  assert.match(advisoryReport.split('## Obligations')[1].split('## Evidence')[0], /declared_functions_within_module_ceiling: failed/);
  assert.match(advisoryReport.split('## Missing Or Failed Obligations (All Severities)')[1], /declared_functions_within_module_ceiling: failed/);

  const cycleRoot = workspace('cycle-block', "import './entry.js';\nexport function f0() { return 0; }\n", 'packages/example/src/entry.ts');
  const cycleOut = path.join(scratch, 'cycle-out');
  const cycleRun = command([path.join(scratch, 'package/dist/adapters/cli/normproof.js'), 'judge', path.join(cycleRoot, '.normproof/judge-input.json'), cycleOut,
    '--evidence-manifest', path.join(cycleRoot, '.normproof/evidence-manifest.json')], { cwd: cycleRoot });
  assert.equal(cycleRun.status, 2, cycleRun.stdout + cycleRun.stderr);
  const cycleVerdict = JSON.parse(fs.readFileSync(path.join(cycleOut, 'verdict.json')));
  assert.equal(cycleVerdict.status, 'failed');
  assert.equal(cycleVerdict.obligations.find(item => item.id === 'source_graph_is_acyclic').blocking, true);
  assert.equal(cycleVerdict.obligations.find(item => item.id === 'source_graph_is_acyclic').status, 'failed');
  console.log(JSON.stringify({ exitCode: advisoryRun.status, verdict: advisoryVerdict.status, advisoryVisible: true }));
});

test('policy: workspace direction and module function scope agree at write and completion', async () => {
  const root = workspace('policy', 'export function value() {}', 'packages/browser/src/entry.ts');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.normproof/evidence-manifest.json')));
  const profile = JSON.parse(fs.readFileSync(path.join(root, '.normproof/norm-packs/software-structure-v0/profile.json')));
  const rules = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/write-rules.json')));
  const to = 'packages/ts-shell/**';
  const boundary = profile.obligationTemplates.find(item => item.id === 'domains_do_not_reach_shell');
  assert.ok(boundary, 'expected consolidated domains_do_not_reach_shell obligation');
  const write = rules.rules.find(item => item.id === boundary.id);
  assert.deepEqual(
    [boundary.severity, boundary.expression.reachable, boundary.expression.from, boundary.expression.excludeFrom, boundary.expression.to],
    ['blocking', true, 'packages/**', ['packages/ts-shell/**'], to]
  );
  assert.deepEqual(
    [write?.kind, write?.from, write?.excludeFrom, write?.to],
    ['noReachableDependency', boundary.expression.from, boundary.expression.excludeFrom, to]
  );
  const functionSource = manifest.entries.find(item => item.id === 'source_module_functions').source;
  const baselineRule = rules.rules.find(item => item.kind === 'moduleFunctionBaseline');
  assert.equal(baselineRule.pattern, functionSource.pattern);
  assert.deepEqual(baselineRule.exclude, functionSource.exclude);
  const filename = rules.rules.find(item => item.kind === 'filenameTokens');
  const names = profile.obligationTemplates.find(item => item.id === filename.id);
  assert.equal(names.severity, 'blocking');
  assert.deepEqual(names.expression.operands.map(term => term.matches).sort(), filename.tokens.map(token => `**/*${token}*`).sort());
  for (const term of names.expression.operands) {
    assert.equal(term.kind, 'none');
    assert.equal(term.caseInsensitive, true);
    assert.deepEqual(manifest.entries.find(item => item.id === term.evidenceId).source, { kind: 'file-set', pattern: filename.pattern });
  }
  assert.deepEqual(filename.exclude ?? [], []);
  fs.writeFileSync(path.join(root, 'packages/browser/api.d.ts'), Array.from({ length: 21 }, (_, i) => `export declare function f${i}(): void;`).join('\n'));
  fs.writeFileSync(path.join(root, 'packages/browser/src/entry.test.ts'), Array.from({ length: 25 }, (_, i) => `function t${i}() {}`).join('\n'));
  const captured = await collector.collectEvidence(manifest, path.join(root, '.normproof'));
  assert.deepEqual({ ...captured.moduleFunctionCounts.source_module_functions }, { 'packages/browser/src/entry.ts': 1 });
});

test('policy: a file landed outside the edit tools is blocked by Stop and the cold judge', () => {
  const root = workspace('filename', 'export function value() { return 1; }', 'packages/example/src/entry.ts');
  const invalid = 'packages/example/src/entry-V2.ts';
  const source = 'export const other = 2;';
  fs.copyFileSync(path.join(repository, '.normproof/write-rules.json'), path.join(root, '.normproof/write-rules.json'));
  const pre = command([path.join(repository, '.normproof/write-gate/cli.mjs'), '--emit-result'], {
    cwd: root, input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: invalid, content: source } }),
  });
  assert.equal(pre.status, 0, pre.stderr);
  assert.equal(JSON.parse(pre.stdout).decision, 'block');

  fs.writeFileSync(path.join(root, invalid), source);
  const stop = command([path.join(repository, '.normproof/completion-gate/cli.mjs'), '--emit-result'], {
    cwd: root, input: JSON.stringify({ cwd: root, hook_event_name: 'Stop', stop_hook_active: false }),
  });
  assert.equal(stop.status, 0, stop.stderr);
  assert.equal(JSON.parse(stop.stdout).decision, 'block');
  assert.match(JSON.parse(stop.stdout).reason, /filenames_carry_no_phase_labels/);
  const cli = path.join(scratch, 'package/dist/adapters/cli/normproof.js');
  const judge = command([cli, 'judge', '--format', 'text'], { cwd: root });
  assert.equal(judge.status, 2, judge.stderr);
  assert.match(judge.stdout, /filenames_carry_no_phase_labels.*entry-V2\.ts/);

  fs.renameSync(path.join(root, invalid), path.join(root, 'packages/example/src/helper.ts'));
  const lawful = command([cli, 'judge'], { cwd: root });
  assert.equal(lawful.status, 0, lawful.stderr);
  assert.equal(JSON.parse(lawful.stdout).verdictStatus, 'proven');
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

test('hooks: Stop blocks unresolved exports for three improving repair rounds via the offline pinned bundle', () => {
  const root = workspace('repair', 'export const a = 1, b = 2, c = 3;', 'packages/example/src/entry.ts');
  const entry = path.join(root, 'packages/example/src/entry.ts');
  fs.writeFileSync(path.join(root, 'packages/example/src/use.ts'), "import { a, b, c } from './entry.js'; export const total = a + b + c;");
  fs.copyFileSync(path.join(repository, '.normproof/write-rules.json'), path.join(root, '.normproof/write-rules.json'));
  const write = command([path.join(repository, '.normproof/write-gate/cli.mjs'), 'gate', 'write', '--emit-result'], {
    cwd: root, input: JSON.stringify({ cwd: root, tool_name: 'Edit', tool_input: { file_path: entry, content: 'export {};' } })
  });
  assert.equal(write.status, 0, write.stderr);
  assert.equal(JSON.parse(write.stdout).decision, 'allow_with_advisory');
  const completionArtifact = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/completion-gate/artifact.json'), 'utf8'));
  const { provenance, ...completionDescriptor } = completionArtifact;
  const projectHooks = JSON.parse(fs.readFileSync(path.join(repository, '.agents/hooks.json'), 'utf8'));
  assert.deepEqual(projectHooks.hooks.Stop[0].hooks[0].completionGate, completionDescriptor);
  assert.equal(provenance.commit, readBundleMetadata().baseCommit);
  const cli = path.join(repository, completionDescriptor.path);
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
