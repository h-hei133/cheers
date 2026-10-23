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
