/** Complete row rewrites emitted by the fullscreen renderer, including erases. */
function paintedRows(output, normalize) {
  const clearedAt = output.lastIndexOf('\x1b[2J');
  if (clearedAt >= 0) output = output.slice(clearedAt + 4);
  const positions = [...output.matchAll(/\x1b\[(\d+);(\d+)H/g)];
  const rows = new Map();
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    if (position[2] !== '1') continue;
    const row = Number(position[1]);
    rows.delete(row);
    const body = output.slice(position.index + position[0].length, positions[index + 1]?.index);
    if (body.includes('\x1b[J')) {
      for (const painted of rows.keys()) if (painted >= row) rows.delete(painted);
    }
    const end = body.indexOf('\x1b[K');
    if (end >= 0) rows.set(row, normalize(body.slice(0, end)));
  }
  return rows;
}

function diffPosition(output, normalize, oldSource, newSource) {
  const matches = [...paintedRows(output, normalize)]
    .filter(([, text]) => text.includes(oldSource) && text.includes(newSource));
  return matches.length === 1 ? { row: matches[0][0], text: matches[0][1] } : undefined;
}

function clipboardTexts(output) {
  return [...output.matchAll(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/g)]
    .map(match => Buffer.from(match[1], 'base64').toString('utf8'));
}

/** A copy result adds chrome; acquire the next hit from its completed paint. */
export async function copyDiffSources({ read, write, waitForOutput, normalize, oldSource, newSource }) {
  await waitForOutput(read, value => diffPosition(value, normalize, oldSource, newSource) !== undefined,
    'currently painted source diff row');
  const start = read().length;
  const dragCopy = source => {
    const position = diffPosition(read(), normalize, oldSource, newSource);
    const column = position?.text.indexOf(source);
    if (!position || column === undefined || column < 0) throw new Error('Expected one currently painted source diff row');
    const first = column + 1;
    const last = first + source.length - 1;
    write(`\x1b[<0;${first};${position.row}M\x1b[<32;${last};${position.row}M\x1b[<0;${last};${position.row}m`);
  };
  dragCopy(oldSource);
  await waitForOutput(() => read().slice(start), value => {
    const resultPainted = [...paintedRows(value, normalize).values()]
      .some(text => /^(?:Copied|Sent) \d+ characters.*clipboard\./.test(text));
    return clipboardTexts(value).length >= 1 && resultPainted
      && diffPosition(read(), normalize, oldSource, newSource) !== undefined;
  }, 'old-side diff source copy and result frame');
  dragCopy(newSource);
  await waitForOutput(() => read().slice(start), value => clipboardTexts(value).length >= 2,
    'new-side diff source copy');
  const copiedSides = clipboardTexts(read().slice(start));
  if (copiedSides[0] !== oldSource || copiedSides[1] !== newSource) {
    throw new Error(`side-by-side source copy mismatch: ${JSON.stringify(copiedSides)}`);
  }
}
