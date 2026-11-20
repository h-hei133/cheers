#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractUpstream, readBundleMetadata, repository } from './adapter/artifact.mjs';

function contained(value) {
  const resolved = path.resolve(repository, value);
  const relative = path.relative(repository, resolved);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Archive paths must remain inside this repository.');
  }
  return resolved;
}

const [source, output, extra] = process.argv.slice(2);
if (!source || !output || extra) throw new Error('Usage: node .normproof/package.mjs <upstream-archive> <output-archive>');
const sourcePath = contained(await realpath(contained(source)));
const requestedOutput = contained(output);
const outputParent = contained(await realpath(path.dirname(requestedOutput)));
const outputPath = path.join(outputParent, path.basename(requestedOutput));
if (sourcePath === outputPath) throw new Error('The source and output archives must be distinct.');

const metadata = readBundleMetadata();
const scratch = contained(path.join(repository, '.tmp'));
await mkdir(scratch, { recursive: true });
const temporary = await mkdtemp(path.join(contained(await realpath(scratch)), 'normproof-package-'));
try {
  const bytes = await readFile(sourcePath);
  const identity = extractUpstream(bytes, metadata, temporary);
  const archive = path.join(temporary, 'upstream.tgz');
  await writeFile(archive, bytes, { flag: 'wx', mode: 0o644 });
  await rename(archive, outputPath);
  console.log(JSON.stringify({ sha256: identity.archiveSha256, sourceCommit: identity.sourceCommit,
    verifiedMembers: Object.keys(identity.members).length }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
