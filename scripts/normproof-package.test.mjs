import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { contract, readBundleMetadata, repository } from '../.normproof/adapter/artifact.mjs';
import { prepareRefresh } from '../.normproof/package.mjs';

function fixture(t) {
  const scratch = path.join(repository, '.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratch, 'normproof-package-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const read = file => JSON.parse(fs.readFileSync(path.join(repository, file)));
  const metadata = readBundleMetadata();
  const current = { metadata, hooks: read('.agents/hooks.json'), descriptors: {
    write: read('.normproof/write-gate/artifact.json'), stop: read('.normproof/completion-gate/artifact.json'),
  } };
  const archive = path.basename(metadata.sourceArchive);
  fs.copyFileSync(path.join(repository, metadata.sourceArchive), path.join(directory, archive));
  const record = { version: 1, package: metadata.package, packageVersion: metadata.packageVersion,
    sourceCommit: metadata.baseCommit, nodeFloor: contract.nodeFloor, packageNodeEngine: contract.packageNodeEngine,
    parserVersion: contract.parserVersion, archive: { file: archive, sha256: metadata.archiveSha256, members: metadata.members } };
  for (const [name, descriptor] of Object.entries(current.descriptors)) {
    const file = `${name}.mjs`;
    fs.copyFileSync(path.join(repository, descriptor.path), path.join(directory, file));
    const { entry, bundler, inputs } = descriptor.provenance;
    record[name] = { file, sha256: descriptor.sha256, entry, bundler, inputs };
  }
  const prepare = (commit = metadata.baseCommit) => {
    fs.writeFileSync(path.join(directory, 'artifacts.json'), JSON.stringify(record));
    const extracted = fs.mkdtempSync(path.join(directory, 'unpack-'));
    return prepareRefresh(directory, commit, extracted, current);
  };
  return { directory, record, prepare, current };
}

test('the checked artifact packet reproduces the pinned files', t => {
  const { prepare, current } = fixture(t);
  const replacements = prepare();
  assert.equal(replacements.size, 8);
  for (const [file, bytes] of replacements) {
    assert.deepEqual(bytes, fs.readFileSync(path.join(repository, file)), file);
  }
  assert.deepEqual(current.hooks, JSON.parse(replacements.get('.agents/hooks.json')));
});

test('pin preparation rejects a foreign revision, escaping input and altered CLI bytes', t => {
  const { directory, record, prepare, current } = fixture(t);
  assert.throws(() => prepare('0'.repeat(40)), /requested source and runtime/);
  record.write.inputs['src/../outside.ts'] = '0'.repeat(64);
  assert.throws(prepare, /Invalid gate artifact provenance/);
  delete record.write.inputs['src/../outside.ts'];
  fs.appendFileSync(path.join(directory, 'stop.mjs'), '\n');
  assert.throws(prepare, /stale_artifact: stop CLI/);
  const descriptor = current.hooks.hooks.PreToolUse[0].hooks[0].writeGate;
  assert.equal(descriptor.sha256, current.descriptors.write.sha256);
});
