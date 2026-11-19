const MAX_SOURCE = 8_192;
const MAX_DEPTH = 24;
const WHITESPACE = /^[\t\n\r ]$/;
const EMPTY = /^[\t\n\r ]*$/;

/** Locate complete top-level members without repairing incomplete JSON. */
export class ArgumentFields {
  private text = '';
  private offset = 0;
  private memberStart = 0;
  private started = false;
  private ended = false;
  private first = true;
  private stopped = false;
  private quoted = false;
  private escaped = false;
  private readonly closers: string[] = [];

  append(chunk: string, member: (key: string, value: unknown) => void): 'invalid' | 'bounded' | undefined {
    if (this.stopped) return undefined;
    const available = MAX_SOURCE - this.text.length;
    this.text += chunk.slice(0, available);
    while (this.offset < this.text.length) {
      const char = this.text[this.offset]!;
      const valid = this.read(char, member);
      this.offset++;
      if (!valid) {
        this.stopped = true;
        return this.closers.length > MAX_DEPTH ? 'bounded' : 'invalid';
      }
    }
    if (chunk.length > available || this.text.length === MAX_SOURCE && !this.ended) {
      this.stopped = true;
      return 'bounded';
    }
    return undefined;
  }

  private read(char: string, member: (key: string, value: unknown) => void): boolean {
    if (this.ended) return WHITESPACE.test(char);
    if (!this.started) {
      if (WHITESPACE.test(char)) return true;
      this.started = char === '{';
      this.memberStart = this.offset + 1;
      return this.started;
    }
    if (this.quoted) {
      if (this.escaped) this.escaped = false;
      else if (char === '\\') this.escaped = true;
      else if (char === '"') this.quoted = false;
      return true;
    }
    if (char === '"') {
      this.quoted = true;
      return true;
    }
    if (char === '{' || char === '[') {
      this.closers.push(char === '{' ? '}' : ']');
      return this.closers.length <= MAX_DEPTH;
    }
    if (this.closers.length > 0) {
      return char !== '}' && char !== ']' || this.closers.pop() === char;
    }
    if (char === ']') return false;
    if (char !== ',' && char !== '}') return true;
    const source = this.text.slice(this.memberStart, this.offset);
    const emptyObject = this.first && char === '}';
    this.first = false;
    this.ended = char === '}';
    this.memberStart = this.offset + 1;
    return this.member(source, member, emptyObject);
  }

  private member(source: string, consume: (key: string, value: unknown) => void, emptyObject: boolean): boolean {
    if (EMPTY.test(source)) return emptyObject;
    try {
      const fields = Object.entries(JSON.parse('{' + source + '}') as Record<string, unknown>);
      if (fields.length !== 1) return false;
      const [key, value] = fields[0]!;
      consume(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
