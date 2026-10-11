import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runChangelogCommand } from './changelogCommandRuntime.js';

describe('/changelog', () => {
  it('reports offline absence truthfully', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-changelog-'));
    const result = await runChangelogCommand([], { cwd: directory, projectRoot: directory } as never);
    expect(result.output).toContain('Changelog unavailable');
    expect(result.output).toContain('offline');
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
