import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { capturePromptSources } from './sources.js';

let root: string;
beforeEach(() => { fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/prompt-sources-'); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('invalidates unchanged-length edits, absent candidate creation and symlink retargeting', () => {
  const file = path.join(root, 'rules'); fs.writeFileSync(file, 'old');
  const edited = capturePromptSources(); edited.track(file); edited.verify();
  fs.writeFileSync(file, 'new'); fs.utimesSync(file, new Date(0), new Date(1000));
  expect(() => edited.verify()).toThrow('changed');
  const missing = path.join(root, 'nested', 'rules'); const absent = capturePromptSources(); absent.track(missing); absent.verify();
  fs.mkdirSync(path.dirname(missing)); fs.writeFileSync(missing, 'created'); expect(() => absent.verify()).toThrow('changed');
  const target = path.join(root, 'other'); fs.writeFileSync(target, 'new');
  const link = path.join(root, 'link'); fs.symlinkSync(file, link);
  const linked = capturePromptSources(); linked.track(link); linked.verify();
  fs.unlinkSync(link); fs.symlinkSync(target, link); expect(() => linked.verify()).toThrow('changed');
});

it('bounds source metadata and detects changes during repeated capture', () => {
  const sources = capturePromptSources(); const target = path.join(root, 'rules'); fs.writeFileSync(target, 'old'); sources.track(target);
  fs.writeFileSync(target, 'changed'); expect(() => sources.track(target)).toThrow('changed');
  const bounded = capturePromptSources();
  for (let i = 0; i < 512; i++) bounded.track(path.join(root, `missing-${i}`));
  expect(() => bounded.track(path.join(root, 'overflow'))).toThrow('limit');
});
