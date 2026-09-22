/**
 * Making text that someone else wrote safe to show a person or a model.
 *
 * Two separate jobs live here, because they are needed in different places and
 * fail in different ways.
 *
 * `neutraliseForDisplay` is for text that reaches a terminal. A repository
 * controls the strings in an approval prompt — commands, matchers, paths — and it
 * is shown to the user at the exact moment they are deciding whether to trust it.
 * Render that verbatim and it can carry newlines that forge extra prompt lines, or
 * escape sequences that repaint what is on screen so the harness appears to be
 * saying something it is not.
 *
 * `neutraliseTagBoundaries` is for text placed between tags the harness writes.
 * A closing tag inside the wrapped text ends the block early and leaves the rest
 * outside the boundary, where it reads as coming from the harness rather than from
 * the file it came from.
 *
 * Both were previously written out three times with slightly different rules,
 * which is how one of them ended up handling fewer characters than the others.
 */

/** Characters that a terminal may act on rather than print. */
function isControlLike(code: number): boolean {
  return (
    // C0: NUL through US, the classic escape and newline range.
    code < 0x20 ||
    // DEL.
    code === 0x7f ||
    // C1: NEL, and the 8-bit forms of CSI/OSC/DCS. A UTF-8 terminal does not read
    // these as escapes, but a plain `printf` of the text, a terminal in 8-bit
    // mode, or anything that re-encodes as Latin-1 will.
    (code >= 0x80 && code <= 0x9f) ||
    // Unicode separators, which several renderers treat as line breaks even though
    // they are not `\n`.
    code === 0x2028 ||
    code === 0x2029
  );
}

/**
 * Render a string so a terminal shows what it contains rather than obeying it.
 *
 * Control characters are spelled out (`\x1b`, `\x85`) rather than dropped: a
 * reader should be able to see that the value contained something unusual, which
 * is itself worth knowing at the moment of deciding whether to trust it.
 *
 * Runs of horizontal whitespace collapse to one space, because a value padded to
 * look like a separate column is a way of writing text that reads as if the
 * harness laid it out. Newlines are escaped by the control rule above rather than
 * collapsed, so a forged line break stays visible as an escape instead of being
 * quietly joined into one line.
 */
export function neutraliseForDisplay(value: string): string {
  let output = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    output += isControlLike(code) ? `\\x${code.toString(16).padStart(2, '0')}` : character
  }
  return output.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Escape the opening angle bracket of anything shaped like a tag.
 *
 * Applied to text that sits inside tags the harness writes, so the text cannot
 * close them. Brackets are escaped rather than tags removed, so a reader can still
 * see that the content contained something shaped like a tag — which is precisely
 * the thing worth noticing.
 *
 * Only a real tag-shaped sequence is touched: `<` followed by a name, so a
 * comparison like `a < b` in prose is left alone.
 */
export function neutraliseTagBoundaries(content: string): string {
  return content.replace(/<(?=\/?[A-Za-z_][\w.:-]*[\s/>])/g, '&lt;')
}

/** An attribute value cannot carry the quote that delimits it, or a new tag. */
export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
