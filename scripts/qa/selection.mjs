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

/** Fixed catalogue pages search and cancel through the packaged chooser. */
export async function browseSessionPages({ state, child, home, project, normalized, waitForOutput }) {
  const created = [];
  try {
    for (let index = 0; index < 45; index++) {
      const suffix = index.toString().padStart(2, '0');
      const id = `qa_catalog_${suffix}`;
      const directory = path.join(home, '.cheers', 'sessions', id);
      const timestamp = new Date(Date.UTC(2020, 0, 2, 0, 0, -index)).toISOString();
      fs.mkdirSync(directory); created.push(directory);
      fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({ id, projectRoot: project,
        title: `qa-catalog-${suffix}`, createdAt: timestamp, updatedAt: timestamp }));
      fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({ status: 'completed', projectRoot: project,
        runPhase: 'idle', thread: { schemaVersion: 1, entries: [
          { id: `${id}:root`, kind: 'session-root', order: 0, timestamp },
          { id: `${id}:message`, parentId: `${id}:root`, kind: 'turn-message', role: 'user', order: 1, timestamp },
        ], activeLeafId: `${id}:message`, branches: [], compactions: [] } }));
      fs.writeFileSync(path.join(directory, 'transcript.jsonl'), [
        { type: 'session', version: 1, id, timestamp, cwd: project },
        { type: 'message', id: `${id}:message`, role: 'user', content: `qa-catalog-${suffix}`, timestamp },
      ].map(event => JSON.stringify(event)).join('\n') + '\n');
    }
    const expected = snapshot(home);
    let start = state.output.length; child.stdin.write('/resume\r');
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('Resume session'), 'catalogue chooser');
    start = state.output.length; child.stdin.write('qa-catalog');
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('45 matches checked'), 'complete catalogue query');
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('Identity: qa_catalog_00'), 'catalogue first focus');
    for (let index = 1; index < 40; index++) {
      start = state.output.length; child.stdin.write('\x1b[B');
      const identity = `Identity: qa_catalog_${index.toString().padStart(2, '0')}`;
      await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes(identity), `catalogue focus ${index}`);
    }
    start = state.output.length; child.stdin.write('\x1b[B');
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('▸ Next session page'), 'catalogue next-page focus');
    start = state.output.length; child.stdin.write('\r');
    await waitForOutput(() => normalized(state.output.slice(start)), value =>
      value.includes('Selected session') && value.includes('qa-catalog-40'), 'older fixed catalogue page');
    start = state.output.length; child.stdin.write('\x1b');
    await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('Ask anything, or / for commands'), 'catalogue cancellation');
    const actual = snapshot(home);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Catalogue browsing changed saved session files.');
    state.catalogChecks = { status: 'pass', queryMatches: 45, fixedPage: 40, olderPage: true, cancelUnchanged: true, files: actual };
  } finally {
    for (const directory of created) fs.rmSync(directory, { recursive: true, force: true });
  }
}

/** Direct rename/editor and deletion use explicit confirmation and retain saved source bytes. */
export async function manageSavedSession({ state, child, home, sessionId, normalized, waitForOutput }) {
  const metadataPath = path.join(home, '.cheers', 'sessions', sessionId, 'metadata.json');
  const before = snapshot(home);
  let start = state.output.length; child.stdin.write(`/delete ${sessionId}\r`);
  await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('Delete saved session'), 'saved delete preview');
  start = state.output.length; child.stdin.write('\x1b');
  await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('Ask anything, or / for commands'), 'saved delete cancel');
  if (JSON.stringify(snapshot(home)) !== JSON.stringify(before)) throw new Error('Cancelled deletion changed saved files.');
  start = state.output.length; child.stdin.write(`/session rename ${sessionId}\r`);
  await waitForOutput(() => normalized(state.output.slice(start)), value =>
    value.includes('Rename saved session') && value.includes('Edit session title') && value.includes(sessionId), 'saved rename preview');
  start = state.output.length; child.stdin.write('\x1b[B\r');
  await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('Session title'), 'saved title editor handoff');
  start = state.output.length; child.stdin.write('\x15qa-managed-title\r');
  await waitForOutput(() => normalized(state.output.slice(start)), value => value.includes('Renamed session') && value.includes('qa-managed-title'), 'saved title write');
  if (JSON.parse(fs.readFileSync(metadataPath, 'utf8')).title !== 'qa-managed-title') throw new Error('Saved title was not written.');
  const after = snapshot(home);
  if (JSON.stringify(after.filter(([file]) => !file.endsWith(`${sessionId}/metadata.json`)))
    !== JSON.stringify(before.filter(([file]) => !file.endsWith(`${sessionId}/metadata.json`)))) {
    throw new Error('Rename changed conversation files or the active session.');
  }
  state.managementChecks = { status: 'pass', deleteCancelUnchanged: true, titleEditorHandoff: true, titleReadback: true, conversationUnchanged: true };
}
