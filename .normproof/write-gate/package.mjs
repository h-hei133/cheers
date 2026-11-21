import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version } from 'esbuild';

const directory = path.dirname(fileURLToPath(import.meta.url));
const { baseCommit } = JSON.parse(readFileSync(path.join(directory, '../bundle.json'), 'utf8'));
if (typeof baseCommit !== 'string' || !/^[a-f0-9]{40}$/.test(baseCommit)) {
  throw new Error('Expected a pinned source revision.');
}
const source = realpathSync(path.resolve(process.argv[2] ?? ''));
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
const fullCommit = git('rev-parse', baseCommit);
if (git('rev-parse', 'HEAD') !== fullCommit || git('status', '--porcelain', '--', 'src')) {
  throw new Error('The input must be the clean pinned source revision.');
}
const entry = path.join(source, 'src/adapters/write-gate/hook.ts');
const result = await build({
  absWorkingDir: source,
  entryPoints: [entry],
  bundle: true, platform: 'node', target: 'node20.3', format: 'esm', write: false, metafile: true,
  banner: { js: [
    'import { createRequire as artifactRequire } from "node:module";',
    'import { dirname as artifactDirectory } from "node:path";',
    'import { fileURLToPath as artifactPath } from "node:url";',
    'const require = artifactRequire(import.meta.url);',
    'const __filename = artifactPath(import.meta.url);',
    'const __dirname = artifactDirectory(__filename);',
  ].join('\n') },
  minify: true, legalComments: 'eof',
});
const bytes = Buffer.from(result.outputFiles[0].text.replace(
  /\/\*! Bundled license information:[\s\S]*\*\/\s*$/,
  notice => notice.replace(/[ \t]+$/gm, '')
));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const inputs = Object.fromEntries(Object.keys(result.metafile.inputs)
  .map(file => {
    const absolute = realpathSync(path.resolve(source, file));
    const rel = path.relative(source, absolute).split(path.sep).join('/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Bundled input escapes pinned source tree: ${file}`);
    }
    return [rel, sha256(readFileSync(absolute))];
  })
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
writeFileSync(path.join(directory, 'cli.mjs'), bytes);
writeFileSync(path.join(directory, 'artifact.json'), JSON.stringify({
  version: 1, protocolVersion: 2, workerProtocol: 1, path: '.normproof/write-gate/cli.mjs', sha256: sha256(bytes), nodeFloor: '20.3.0',
  provenance: { package: 'normproof', commit: fullCommit, entry: 'src/adapters/write-gate/hook.ts',
    bundler: `esbuild@${version}`, inputs },
}, null, 2) + '\n');
console.log(JSON.stringify({ commit: fullCommit, nodeFloor: '20.3.0', sha256: sha256(bytes), bytes: bytes.length }));
