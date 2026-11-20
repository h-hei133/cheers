import { readdirSync } from 'node:fs';
import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

const directory = new URL('.', import.meta.url);
const files = readdirSync(directory)
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => fileURLToPath(new URL(name, directory)));

run({ files, concurrency: 1 })
  .on('test:fail', () => { process.exitCode = 1; })
  .compose(tap)
  .pipe(process.stdout);
