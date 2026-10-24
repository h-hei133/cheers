import { afterEach, expect, it, vi } from 'vitest';
import { Transcript } from '../../../../presentation/tui/transcript/container.js';
import { textBlock } from '../../../../presentation/tui/transcript/blocks.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { visibleWidth } from '../../../../presentation/tui/text/measure.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { OverlayHost, type Picker } from '../../overlay.js';
import { copyPicker } from '../copy.js';
import { CopySource } from './source.js';

afterEach(() => vi.restoreAllMocks());

it.each(['abort', 'close'])('refuses copy acquisition when admission triggers %s', async action => {
  const transcript = new Transcript(); transcript.append(textBlock('assistant', 'private source'));
  const read = vi.spyOn(transcript, 'copySources'), controller = new AbortController();
  const picker = copyPicker(transcript, { cwd: '/workspace', signal: controller.signal,
    admission: () => { if (action === 'abort') controller.abort(); else picker.previewEnd?.(); return undefined; } });
  await expect(picker.load()).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(picker.filterOptions?.('', [])).toEqual([]);
});

it.each([32, 128 * 1024])('bounds actual copy source, pages and repeated host lifetime (%i source units)', async units => {
  const transcript = new Transcript();
  transcript.retainEarlier([textBlock('assistant', `earlier\nneedle ${'x'.repeat(units)}`)]);
  transcript.append(textBlock('user', 'middle\nneedle'));
  transcript.append(textBlock('assistant', 'latest\nneedle'));
  const before = JSON.stringify([...transcript.copySources()]), revision = transcript.revision;
  const read = vi.spyOn(transcript, 'copySources'), page = vi.spyOn(CopySource.prototype, 'page');
  for (let browse = 0; browse < 10; browse++) {
    let picker = copyPicker(transcript, { cwd: '/workspace' }, { pageSize: 1 });
    const host = new OverlayHost(() => {});
    const retired: Picker[] = [];
    try {
      for (const label of ['latest', 'middle', 'earlier']) {
        const load = vi.spyOn(picker, 'load'); host.open(picker);
        const options = await load.mock.results[0]!.value;
        expect(options[0]?.detail).toBe(label);
        if (label === 'latest') host.handlePaste('needle');
        for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
          const rows = host.render(width, height);
          expect(rows.length).toBeLessThanOrEqual(height);
          expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
        }
        expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain(label);
        expect(Reflect.get(host, 'baseOptions').length).toBeLessThanOrEqual(2);
        expect(read).toHaveBeenCalledTimes(browse + 1);
        const source = page.mock.instances.at(-1)!;
        expect(Reflect.get(source, 'entries')).toHaveLength(3);
        expect(Reflect.get(source, 'search')).toHaveLength(3);
        expect(Reflect.get(source, 'matches')).toHaveLength(3);
        if (label !== 'earlier') {
          const outcome = await picker.apply(['__more__']);
          retired.push(picker); host.close(); picker = outcome!.next!;
          expect(picker.initialFilter).toBe('needle');
        }
      }
      host.handleKey(parseKeyEvent('\x1b'), vi.fn());
      retired.push(picker);
      expect(Reflect.get(host, 'baseOptions')).toEqual([]);
      expect(Reflect.get(host, 'model').total).toBe(0);
      expect(Reflect.get(host, 'optionRows').size).toBe(0);
      expect(host.render(120, 24)).toEqual([]);
      for (const old of retired) {
        expect(old.filterOptions?.('', [])).toEqual([]);
        expect(await old.apply(['0'])).toBeUndefined();
        await expect(old.load()).rejects.toThrow();
      }
      expect(read).toHaveBeenCalledTimes(browse + 1);
    } finally { host.close(); }
  }
  expect(transcript.revision).toBe(revision);
  read.mockRestore();
  expect(JSON.stringify([...transcript.copySources()])).toBe(before);
});
