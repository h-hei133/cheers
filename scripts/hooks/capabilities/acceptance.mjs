import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fileHash, pinnedIdentity, sha256 } from './identity.mjs';
import { checkBuild } from '../../start-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const input = path.join(root, 'docs/architecture/hooks/evidence/stop-envelope');
const output = path.join(root, 'docs/architecture/hooks/evidence/capabilities');
const accepted = JSON.parse(fs.readFileSync(path.join(input, 'source-identity.json')));
const members = JSON.parse(fs.readFileSync(path.join(input, accepted.sourceFileHashes)));
for (const [file, digest] of Object.entries(members)) assert.equal(fileHash(path.join(root, file)), digest, `${file}: accepted source drift`);
const currentFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'packages/ts-shell/src'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
assert.deepEqual(Object.keys(members).filter(file => file.startsWith('packages/ts-shell/src/')).sort(), currentFiles, 'Accepted product file inventory changed');
const productDigest = sha256(JSON.stringify(Object.fromEntries(Object.entries(members).sort(([a], [b]) => a.localeCompare(b)))));
assert.equal(productDigest, accepted.sourceSha256);
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), accepted.head);
assert.equal(accepted.fullSuiteExit, 0);
assert.equal(accepted.fullSuiteSourceDrift, 0);
const suite = fs.readFileSync(path.join(input, 'full-suite.txt'), 'utf8');
const files = /Test Files\s+(\d+) passed \((\d+)\)/.exec(suite);
const tests = /Tests\s+(\d+) passed \| (\d+) skipped \((\d+)\)/.exec(suite);
assert.ok(files && tests, 'Full suite has no passing terminal summary');
assert.equal(Number(files[1]), accepted.testFilesPassed); assert.equal(files[1], files[2]);
assert.equal(Number(tests[1]), accepted.testsPassed); assert.equal(Number(tests[2]), accepted.testsSkipped);
assert.equal(Number(tests[3]), accepted.testsPassed + accepted.testsSkipped);
for (const gate of ['no-dependency-cycles', 'declarations', 'node-floor']) assert.ok(suite.includes(`[pass] ${gate} -`), `${gate}: missing real passing output`);
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'), version: '0.1.0' });
assert.ok(build.ok, build.reason); assert.equal(build.manifest.buildId, accepted.buildId);
const binding = pinnedIdentity(root); delete binding.sourceSnapshot.members;
const record = { verification: 'reused completed R0b full chain after exact product byte, inventory, manifest and build checks',
  originalEvidence: 'docs/architecture/hooks/evidence/stop-envelope/full-suite.txt', originalOutputSha256: fileHash(path.join(input, 'full-suite.txt')),
  originalIdentitySha256: fileHash(path.join(input, 'source-identity.json')), originalMembersSha256: fileHash(path.join(input, 'source-files.json')),
  command: "rtk proxy sh -c 'npm run verify:import-cycles && npm run check:declarations && npm run check:node-floor && CHEERS_R0A_CLI=/home/wang/projects/normproof/dist/adapters/cli/normproof.js VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts'",
  exitCode: accepted.fullSuiteExit, sourceDrift: 0, productFiles: currentFiles.length, frozenFiles: Object.keys(members).length,
  productDigest, testFilesPassed: accepted.testFilesPassed, testsPassed: accepted.testsPassed, testsSkipped: accepted.testsSkipped,
  buildId: accepted.buildId, identity: binding,
  scope: 'Full suite covers unchanged product and manifests; J2 scripts are separately checked and exercised. No new full-suite process was launched.' };
fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify(record, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'acceptance.txt'), `Verified reuse of ${record.originalEvidence}\nOriginal command: ${record.command}\nOriginal exit: ${record.exitCode}; current product source drift: 0\n\n` + suite);
console.log(JSON.stringify({ fullChain: 'passed; matching completed run reused', sourceDrift: 0, testFiles: accepted.testFilesPassed, tests: accepted.testsPassed, skipped: accepted.testsSkipped, buildFresh: true }));
