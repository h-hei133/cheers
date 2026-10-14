import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { SubagentLoader } from './subagentLoader.js';

afterEach(cleanupAdvisorHarnesses);

it('bounds all enumerated entries before sorting even when none are Markdown', () => {
  const f = createAdvisorHarness(false, false); const directory = path.join(f.root, '.agents', 'agents');
  fs.mkdirSync(directory, { recursive: true });
  for (let index = 0; index < 8300; index++) fs.writeFileSync(path.join(directory, `entry-${index}.txt`), '');
  const original = fs.opendirSync; let reads = 0; let closed = false;
  vi.spyOn(fs, 'opendirSync').mockImplementation((...args: Parameters<typeof fs.opendirSync>) => {
    const handle = original(...args);
    if (args[0] === directory) {
      const read = handle.readSync.bind(handle); const close = handle.closeSync.bind(handle);
      vi.spyOn(handle, 'readSync').mockImplementation(() => { reads++; return read(); });
      vi.spyOn(handle, 'closeSync').mockImplementation(() => { close(); closed = true; });
    }
    return handle;
  });
  const discovery = new SubagentLoader(f.root).discover();
  expect(discovery.diagnostics.join('\n')).toMatch(/discovery limit reached.*entry count/);
  expect(reads).toBe(8193); expect(closed).toBe(true);
});

it('shares the directory budget across a wide tree of empty directories', () => {
  const f = createAdvisorHarness(false, false); const directory = path.join(f.root, '.agents', 'agents');
  fs.mkdirSync(directory, { recursive: true });
  for (let index = 0; index < 550; index++) fs.mkdirSync(path.join(directory, `entry-${index}`));
  const open = vi.spyOn(fs, 'opendirSync');
  const discovery = new SubagentLoader(f.root).discover();
  expect(discovery.diagnostics.join('\n')).toMatch(/discovery limit reached.*directory count/);
  expect(open.mock.calls.length).toBeLessThanOrEqual(512);
});
