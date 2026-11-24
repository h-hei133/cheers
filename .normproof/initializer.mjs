#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { brotliCompressSync, constants } from 'node:zlib';
import { digest, extractPinned, readBundleMetadata, repository, requireRuntime } from './adapter/artifact.mjs';

const [checkout, extra] = process.argv.slice(2);
if (!checkout || extra) throw new Error('Usage: node .normproof/initializer.mjs <clean-source-checkout>');
requireRuntime(process.version);
const source = fs.realpathSync(checkout);
const metadata = readBundleMetadata();
const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), metadata.baseCommit);
assert.equal(git('status', '--porcelain', '--untracked-files=normal'), '');
const scratch = path.join(repository, '.tmp');
fs.mkdirSync(scratch, { recursive: true });
if (fs.realpathSync(scratch) !== scratch) throw new Error('The packaging scratch directory must be local.');
const stage = fs.mkdtempSync(path.join(scratch, 'architecture-package-'));
try {
  extractPinned(stage);
  const packaged = path.join(stage, 'package');
  const manifest = JSON.parse(fs.readFileSync(path.join(packaged, 'package.json'), 'utf8'));
  for (const [name, required] of Object.entries(manifest.dependencies)) {
    const installed = JSON.parse(fs.readFileSync(path.join(source, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(installed.version, required);
  }
  const load = createRequire(path.join(source, 'package.json'));
  const esbuild = load('esbuild');
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  assert.equal(esbuild.version, sourceManifest.devDependencies.esbuild);
  const notice = fs.readFileSync(path.join(packaged, 'LICENSE'), 'utf8');
  const result = await esbuild.build({ absWorkingDir: packaged, entryPoints: [manifest.bin[manifest.name]],
    bundle: true, target: 'node20.3', platform: 'node', format: 'esm', minify: true, legalComments: 'eof',
    nodePaths: [path.join(source, 'node_modules')], write: false,
    banner: { js: ['import { createRequire as architectureCreateRequire } from "node:module";',
      'import { fileURLToPath as architectureFromUrl } from "node:url";',
      'import { dirname as architectureDirname } from "node:path";',
      'const require = architectureCreateRequire(import.meta.url);',
      'const __filename = architectureFromUrl(import.meta.url);', 'const __dirname = architectureDirname(__filename);',
      `/*\n${notice.trimEnd()}\n*/`].join('\n') },
  });
  const bytes = result.outputFiles[0].contents;
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('The initializer exceeds its runtime asset limit.');
  const data = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  if (data.byteLength > 2 * 1024 * 1024) throw new Error('The compressed initializer exceeds its runtime asset limit.');
  const asset = { version: 1, sourceCommit: metadata.baseCommit, archiveSha256: metadata.archiveSha256,
    sha256: digest(bytes), bytes: bytes.byteLength, data: data.toString('base64') };
  assert.equal(git('rev-parse', 'HEAD'), metadata.baseCommit);
  assert.equal(git('status', '--porcelain', '--untracked-files=normal'), '');
  assert.deepEqual(readBundleMetadata(), metadata);
  const destination = path.join(repository, 'packages/ts-shell/src/cli/runtime/architecture/asset.json');
  const temporary = path.join(stage, 'asset.json');
  fs.writeFileSync(temporary, `${JSON.stringify(asset, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
  fs.renameSync(temporary, destination);
  console.log(`${asset.sourceCommit} ${asset.sha256}`);
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
