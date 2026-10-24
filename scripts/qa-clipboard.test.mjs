import test from 'node:test';
import assert from 'node:assert/strict';
import { copyDiffSources } from './qa/clipboard.mjs';

const oldSource = 'qa-old-side-source';
const newSource = 'qa-new-side-source';
const diff = `${oldSource} | ${newSource}`;
const row = (number, text) => `\x1b[${number};1H${text}\x1b[K`;
const offer = text => `\x1b]52;c;${Buffer.from(text).toString('base64')}\x07`;
const normalize = text => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

test('waits for the complete copy result and targets the relocated painted diff', async () => {
  let output = row(55, diff);
  const clicks = [];
  await copyDiffSources({ read: () => output, normalize, oldSource, newSource,
    write: data => {
      clicks.push(data);
      output += offer(clicks.length === 1 ? oldSource : newSource);
    },
    waitForOutput: async (read, predicate, label) => {
      if (label === 'old-side diff source copy and result frame') {
        assert.equal(predicate(read()), false, 'OSC52 precedes native completion and repaint');
        output += row(54, `\x1b[7mq\x1b[27m${oldSource.slice(1)} | ${newSource}`) + row(55, '');
        output += '\x1b[60;1HSent 18 characters to the terminal clipboard.';
        assert.equal(predicate(read()), false, 'incomplete painted result must not admit the next click');
        output += '\x1b[K\x1b[57;4H\x1b[?25h';
      }
      assert.equal(predicate(read()), true);
    } });
  assert.deepEqual(clicks, ['\x1b[<0;15;55M\x1b[<0;15;55m', '\x1b[<0;70;54M\x1b[<0;70;54m']);
});

test('handles native success without changing source geometry', async () => {
  let output = row(55, diff);
  const clicks = [];
  await copyDiffSources({ read: () => output, normalize, oldSource, newSource,
    write: data => {
      clicks.push(data);
      output += offer(clicks.length === 1 ? oldSource : newSource)
        + row(60, 'Copied 18 characters to the clipboard.');
    },
    waitForOutput: async (read, predicate) => assert.equal(predicate(read()), true) });
  assert.equal(clicks[1], '\x1b[<0;70;55M\x1b[<0;70;55m');
});

test('refuses a source row that was erased or only partially painted', async () => {
  for (const output of [row(55, diff) + row(55, ''), `\x1b[55;1H${diff}`,
    row(55, diff) + '\x1b[55;1Hclearing', row(55, diff) + '\x1b[2J',
    row(55, diff) + '\x1b[1;1H\x1b[J', row(55, diff) + '\x1b[54;1H\x1b[J']) {
    await assert.rejects(copyDiffSources({ read: () => output, normalize, oldSource, newSource,
      write: () => assert.fail('no click may target a stale row'),
      waitForOutput: async (read, predicate, label) => {
        assert.equal(predicate(read()), false);
        throw new Error(label);
      } }),
    /currently painted source diff row/);
  }
});

test('waits for the initial source row to finish painting across output chunks', async () => {
  let output = `\x1b[55;1H${diff}`;
  let clicks = 0;
  await copyDiffSources({ read: () => output, normalize, oldSource, newSource,
    write: () => { output += offer(++clicks === 1 ? oldSource : newSource)
      + row(60, 'Copied 18 characters to the clipboard.'); },
    waitForOutput: async (read, predicate, label) => {
      if (label === 'currently painted source diff row') {
        assert.equal(predicate(read()), false);
        output += '\x1b[K';
      }
      assert.equal(predicate(read()), true);
    } });
  assert.equal(clicks, 2);
});

test('still rejects wrong-side source even when both copy operations emit OSC52', async () => {
  let output = row(55, diff);
  await assert.rejects(copyDiffSources({ read: () => output, normalize, oldSource, newSource,
    write: () => { output += offer(oldSource) + row(60, 'Copied 18 characters to the clipboard.'); },
    waitForOutput: async (read, predicate) => assert.equal(predicate(read()), true) }), /source copy mismatch/);
});

test('waits when another source row repaint is incomplete after the copy result', async () => {
  let output = row(55, diff);
  let clicks = 0;
  await copyDiffSources({ read: () => output, normalize, oldSource, newSource,
    write: () => { output += offer(++clicks === 1 ? oldSource : newSource); },
    waitForOutput: async (read, predicate, label) => {
      if (label === 'old-side diff source copy and result frame') {
        output += row(60, 'Copied 18 characters to the clipboard.') + `\x1b[55;1H${diff}`;
        assert.equal(predicate(read()), false);
        output += '\x1b[K';
      }
      assert.equal(predicate(read()), true);
    } });
  assert.equal(clicks, 2);
});
