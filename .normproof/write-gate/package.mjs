import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version } from 'esbuild';

const directory = path.dirname(fileURLToPath(import.meta.url));
const commit = 'a6ff094';
const source = path.resolve(process.argv[2] ?? '');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
const fullCommit = git('rev-parse', commit);
if (git('rev-parse', 'HEAD') !== fullCommit || git('status', '--porcelain', '--', 'src')) {
  throw new Error('The input must be the clean pinned source revision.');
}
const entry = path.join(source, 'src/adapters/write-gate/hook.ts');
const result = await build({
  absWorkingDir: source,
  entryPoints: [entry],
  bundle: true, platform: 'node', target: 'node20.3', format: 'esm', write: false, metafile: true,
  minify: true, legalComments: 'none',
});
const bytes = result.outputFiles[0].contents;
const sha256 = value => createHash('sha256').update(value).digest('hex');
writeFileSync(path.join(directory, 'cli.mjs'), bytes);
writeFileSync(path.join(directory, 'artifact.json'), JSON.stringify({
  version: 1, path: '.normproof/write-gate/cli.mjs', sha256: sha256(bytes), nodeFloor: '20.3.0',
  provenance: { package: 'normproof', commit: fullCommit, entry: 'src/adapters/write-gate/hook.ts',
    bundler: `esbuild@${version}`, inputs: Object.fromEntries(Object.keys(result.metafile.inputs)
      .sort().map(file => {
        const absolute = path.resolve(source, file);
        return [path.relative(source, absolute), sha256(readFileSync(absolute))];
      })) },
}, null, 2) + '\n');
console.log(JSON.stringify({ commit: fullCommit, nodeFloor: '20.3.0', sha256: sha256(bytes), bytes: bytes.length }));
