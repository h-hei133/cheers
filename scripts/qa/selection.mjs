import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function snapshot(home) {
  const store = path.join(home, '.cheers');
  const sessions = path.join(store, 'sessions');
  const files = fs.readdirSync(sessions).sort().flatMap(id =>
    ['metadata.json', 'state.json', 'transcript.jsonl'].map(name => path.join(sessions, id, name)));
  files.push(path.join(store, 'current-session.json'));
  return files.map(file => [path.relative(store, file), fs.existsSync(file)
    ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null]);
}

function changeSavedRevision(home, sessionId, label) {
  const file = path.join(home, '.cheers', 'sessions', sessionId, 'state.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!state.thread) throw new Error('Selection fixture has no saved thread');
  state.thread.navigationRevision = `qa-stale-${label}`;
  fs.writeFileSync(file, JSON.stringify(state));
}

/** Open a real chooser, change only the isolated fixture, then reject its stale choice. */
export async function rejectStaleSelection({ state, child, home, sessionId, command, query, title,
  normalized, waitForOutput }) {
  let start = state.output.length;
  child.stdin.write(`${command}\r`);
  await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes(title),
    `${command} hostile picker`);
  start = state.output.length;
  child.stdin.write(query);
  await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes(query),
    `${command} offered selection`);
  changeSavedRevision(home, sessionId, command);
  const expected = snapshot(home);
  start = state.output.length;
  child.stdin.write('\r');
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('changed after') && value.includes('Reopen'), `${command} stale rejection`);
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('Ask anything, or / for commands'), `${command} rejection prompt`);
  const actual = snapshot(home);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${command} stale selection changed saved files or the active session`);
  }
  state.selectionChecks ??= [];
  state.selectionChecks.push({ command, status: 'rejected', savedFilesUnchanged: true, files: actual });
}

/** Disclosure and search operate on a saved tree without publishing navigation. */
export async function browseSavedTree({ state, child, home, sessionId, normalized, waitForOutput }) {
  const expected = snapshot(home);
  let start = state.output.length;
  child.stdin.write('/tree\r');
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('Session tree') && value.includes('State: current'), 'tree current details');
  // The fixture is a single path: leaf -> call -> math -> user -> root.
  for (let index = 0; index < 4; index++) {
    if (index > 0) {
      start = state.output.length; child.stdin.write('\x1b[D');
      await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('▸'), `tree collapse ${index}`);
    }
    start = state.output.length;
    child.stdin.write('\x1b[D');
    const parent = index === 0 ? 'turn_saved_probe_diff_call' : index === 1 ? 'turn_saved_probe_math'
      : index === 2 ? 'turn_saved_probe' : `${sessionId}:root`;
    await waitForOutput(() => normalized(state.output.slice(start)), value =>
      value.includes(`Entry: ${parent}`), `tree parent ${index}`);
  }
  start = state.output.length; child.stdin.write('\x1b[D');
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('▸') && value.includes('Session start'), 'collapsed tree root');
  start = state.output.length; child.stdin.write('qa-link-label');
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('Entry: turn_saved_probe_math') && value.includes('qa-link-label'), 'search within collapsed tree');
  start = state.output.length; child.stdin.write('\x7f'.repeat('qa-link-label'.length));
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes(`Entry: ${sessionId}:root`) && value.includes('▸'), 'preserved collapsed tree');
  start = state.output.length; child.stdin.write('\x1b[C');
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('▾') && value.includes('user: Saved probe'), 'expanded tree root');
  for (const entry of ['turn_saved_probe', 'turn_saved_probe_math', 'turn_saved_probe_diff_call']) {
    start = state.output.length; child.stdin.write('\x1b[C');
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes(`Entry: ${entry}`), `tree child ${entry}`);
    start = state.output.length; child.stdin.write('\x1b[C');
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('▾'), `tree expand ${entry}`);
  }
  start = state.output.length; child.stdin.write('\x1b[C');
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('Entry: turn_saved_probe_diff_result'), 'expanded tree leaf');
  start = state.output.length; child.stdin.write('\x1b');
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('Ask anything, or / for commands'), 'tree cancellation prompt');
  const actual = snapshot(home);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Tree browsing changed saved session files.');
  state.treeChecks = { status: 'pass', currentDetails: true, parentFocus: true, disclosure: true,
    fullSearchUnderCollapse: true, cancelUnchanged: true, files: actual };
}
