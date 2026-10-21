import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSources } from './registry/sources.js';
import { readState } from './store/state.js';

const emptyState = { schema: 1, revision: 0, packages: [], imports: [] };
const source = { name: 'fixture', url: 'https://example.invalid/', description: 'fixture' };
const readers = [
  { name: 'state', characters: 2 * 1024 * 1024, read: readState, value: emptyState, missing: emptyState,
    unicode: () => ({ ...emptyState, imports: [{ name: 'legacy', spec: '界'.repeat(2 * 1024 * 1024 - 256), version: '1', status: 'unresolved' }] }) },
  { name: 'sources', characters: 256 * 1024, read: (_file: string) => readSources(), value: [source], missing: [],
    unicode: () => Array.from({ length: 64 }, (_, index) => ({ ...source, name: `fixture${index}`, url: '界'.repeat(2048), description: '界'.repeat(256) })) },
];

let root: string;
let file: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'extension-reading-')));
  file = path.join(root, 'registry.json');
  vi.stubEnv('CHEERS_MARKETPLACES_FILE', file);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

describe.each(readers)('bounded extension $name acquisition', reader => {
  it('keeps genuinely absent files empty without creating storage', () => {
    expect(reader.read(file)).toEqual(reader.missing);
    expect(fs.readdirSync(root)).toEqual([]);
    file = path.join(root, 'missing', 'registry.json'); vi.stubEnv('CHEERS_MARKETPLACES_FILE', file);
    expect(reader.read(file)).toEqual(reader.missing);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('accepts existing Unicode documents up to the original character limit', () => {
    const value = reader.unicode(); const raw = JSON.stringify(value);
    expect(raw.length).toBeLessThan(reader.characters);
    const padded = raw + ' '.repeat(reader.characters - raw.length);
    expect(Buffer.byteLength(padded)).toBeGreaterThan(reader.characters);
    fs.writeFileSync(file, padded);
    expect(reader.read(file)).toEqual(value);
    fs.appendFileSync(file, ' ');
    expect(() => reader.read(file)).toThrow();
  });

  it('rejects sparse oversized files before allocating or reading their contents', () => {
    const fd = fs.openSync(file, 'w');
    try { fs.ftruncateSync(fd, reader.characters * 4 + 1); } finally { fs.closeSync(fd); }
    const whole = vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('Unbounded acquisition attempted.'); });
    const read = vi.spyOn(fs, 'readSync'); const allocate = vi.spyOn(Buffer, 'alloc');
    expect(() => reader.read(file)).toThrow();
    expect(whole).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(allocate).not.toHaveBeenCalled();
  });

  it('refuses malformed UTF-8 rather than trusting replacement characters', () => {
    const value = reader.name === 'state' ? { ...emptyState, ignored: '\ufffd' } : [{ ...source, description: '\ufffd' }];
    const bytes = Buffer.from(JSON.stringify(value)); const position = bytes.indexOf(Buffer.from('\ufffd'));
    fs.writeFileSync(file, Buffer.concat([bytes.subarray(0, position), Buffer.from([0xff]), bytes.subarray(position + 3)]));
    expect(() => reader.read(file)).toThrow();
  });

  it.each(['leaf', 'ancestor'])('refuses %s symlinks without following their contents', kind => {
    const original = path.join(root, 'original'); fs.mkdirSync(original);
    fs.writeFileSync(path.join(original, 'registry.json'), JSON.stringify(reader.value));
    if (kind === 'leaf') fs.symlinkSync(path.join(original, 'registry.json'), file);
    else { const alias = path.join(root, 'alias'); fs.symlinkSync(original, alias, 'dir'); file = path.join(alias, 'registry.json'); }
    vi.stubEnv('CHEERS_MARKETPLACES_FILE', file); const open = vi.spyOn(fs, 'openSync');
    expect(() => reader.read(file)).toThrow(); expect(open).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(original, 'registry.json'), 'utf8')).toBe(JSON.stringify(reader.value));
  });

  it('refuses directories before opening them', () => {
    fs.mkdirSync(file); const open = vi.spyOn(fs, 'openSync');
    expect(() => reader.read(file)).toThrow(); expect(open).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'win32')('refuses actual FIFOs before opening them', () => {
    execFileSync('mkfifo', [file]); const open = vi.spyOn(fs, 'openSync');
    expect(() => reader.read(file)).toThrow(); expect(open).not.toHaveBeenCalled();
  });

  it.each(['', '{', 'null'])('refuses invalid registry contents %j without reporting absence', raw => {
    fs.writeFileSync(file, raw);
    expect(() => reader.read(file)).toThrow();
  });

  it('refuses replacement between pathname inspection and descriptor acquisition', () => {
    fs.writeFileSync(file, JSON.stringify(reader.value)); const open = fs.openSync; let replaced = false;
    vi.spyOn(fs, 'openSync').mockImplementation((target, flags, mode) => {
      if (String(target) === file && !replaced) {
        replaced = true; fs.renameSync(file, `${file}.retained`); fs.writeFileSync(file, JSON.stringify(reader.value));
      }
      return open(target, flags, mode);
    });
    expect(() => reader.read(file)).toThrow(); expect(replaced).toBe(true);
  });

  it('refuses disappearance after inspection instead of reporting an empty registry', () => {
    fs.writeFileSync(file, JSON.stringify(reader.value)); const open = fs.openSync; let removed = false;
    vi.spyOn(fs, 'openSync').mockImplementation((target, flags, mode) => {
      if (String(target) === file && !removed) { removed = true; fs.unlinkSync(file); }
      return open(target, flags, mode);
    });
    expect(() => reader.read(file)).toThrow(); expect(removed).toBe(true);
  });

  it('refuses growth during bounded descriptor reading', () => {
    fs.writeFileSync(file, JSON.stringify(reader.value)); const read = fs.readSync; let changed = false;
    vi.spyOn(fs, 'readSync').mockImplementation((fd, buffer, offset, length, position) => {
      const count = read(fd, buffer, offset, length, position);
      if (!changed) { changed = true; fs.appendFileSync(file, ' '); }
      return count;
    });
    expect(() => reader.read(file)).toThrow(); expect(changed).toBe(true);
  });
});
