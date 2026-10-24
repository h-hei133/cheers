import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../../session/SessionManager.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../../../session/store/sessionFileLayout.js';
import { readBackSource } from '../../../runtime/navigation.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { visibleWidth } from '../../../../presentation/tui/text/measure.js';
import { OverlayHost, type Picker } from '../../overlay.js';
import { rewindPicker } from '../rewind.js';
import { RewindSource } from './source.js';

let root: string | undefined;
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function saved(units: number) {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'back-lifetime-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  const manager = new SessionManager(), session = manager.createNew(root);
  for (let index = 0; index < 26; index++) manager.addTurn(session.id, {
    role: 'user', content: `question-${index}\nneedle 界 e\u0301 👩‍💻 ${index === 0 ? 'x'.repeat(units) : ''}`,
  });
  const context = { session: manager.getSession(session.id)!, cwd: root, projectRoot: root };
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  const targets = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = targets.map(target => fs.readFileSync(target));
  return { context, targets, before, bytes: before.reduce((sum, value) => sum + value.length, 0) };
}

it.each([32, 128 * 1024])('bounds saved back acquisition, shared pages and repeated host lifetime (%i source units)', async units => {
  const fixture = saved(units), rewind = vi.fn();
  const open = fs.promises.open.bind(fs.promises);
  const counts = { opened: 0, closed: 0, active: 0, peak: 0, bytes: 0, chunk: 0 };
  vi.spyOn(fs.promises, 'open').mockImplementation((async (...args) => {
    const handle = await open(...args), read = handle.read.bind(handle), close = handle.close.bind(handle);
    counts.opened++; counts.active++; counts.peak = Math.max(counts.peak, counts.active);
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      const value = await read(buffer, offset, length, position);
      counts.bytes += value.bytesRead; counts.chunk = Math.max(counts.chunk, length); return value;
    }) as typeof handle.read;
    handle.close = async () => { await close(); counts.closed++; counts.active--; };
    return handle;
  }) as typeof fs.promises.open);
  const page = vi.spyOn(RewindSource.prototype, 'page');
  for (let browse = 0; browse < 10; browse++) {
    const host = new OverlayHost(() => {}), retired: Picker[] = [];
    let picker = rewindPicker({ readTurns: signal => readBackSource(fixture.context, signal), rewind });
    try {
      for (let index = 0; index < 2; index++) {
        const load = vi.spyOn(picker, 'load'); host.open(picker);
        const rows = await load.mock.results[0]!.value;
        expect(rows).toHaveLength(index === 0 ? 26 : 1);
        if (index === 0) host.handlePaste('needle');
        for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
          const drawing = host.render(width, height);
          expect(drawing.length).toBeLessThanOrEqual(height);
          expect(drawing.every(row => visibleWidth(row) <= width)).toBe(true);
        }
        expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain(index === 0 ? 'question-25' : 'question-0');
        expect(Reflect.get(host, 'baseOptions').length).toBeLessThanOrEqual(26);
        const source = page.mock.instances.at(-1)!;
        expect(Reflect.get(source, 'points')).toHaveLength(26);
        expect(Reflect.get(source, 'search')).toHaveLength(26);
        expect(counts.opened).toBe(3 * (browse + 1));
        expect(counts.bytes).toBe(fixture.bytes * (browse + 1));
        expect(counts.active).toBe(0);
        if (index === 0) {
          const more = rows.at(-1)!.id, outcome = await picker.apply([more]);
          retired.push(picker); host.close(); picker = outcome!.next!;
          expect(picker.initialFilter).toBe('needle');
        }
      }
      host.handleKey(parseKeyEvent('\x1b'), vi.fn()); retired.push(picker);
      expect(Reflect.get(host, 'baseOptions')).toEqual([]);
      expect(Reflect.get(host, 'model').total).toBe(0);
      expect(Reflect.get(host, 'optionRows').size).toBe(0);
      for (const old of retired) {
        expect(old.filterOptions?.('', [])).toEqual([]);
        expect(await old.apply(['not-offered'])).toBeUndefined();
        await expect(old.load()).rejects.toThrow();
      }
    } finally { host.close(); }
  }
  expect(counts.active).toBe(0); expect(counts.closed).toBe(counts.opened); expect(counts.peak).toBe(1);
  expect(counts.chunk).toBeLessThanOrEqual(64 * 1024);
  expect(fixture.targets.map(target => fs.readFileSync(target))).toEqual(fixture.before);
  expect(rewind).not.toHaveBeenCalled();
});
