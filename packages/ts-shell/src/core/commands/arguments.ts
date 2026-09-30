interface Argument {
  readonly value: string;
  readonly start: number;
}

/** POSIX quoting and escapes only; no expansion or shell evaluation. */
export function tokenizeCommandArgs(input: string): string[] {
  return scan(input).map((argument) => argument.value);
}

/** Preserve shell syntax for a command that explicitly accepts shell source. */
export function commandArgsFrom(input: string, index: number): string {
  const start = scan(input)[index]?.start;
  return start === undefined ? "" : input.slice(start);
}

function scan(input: string): Argument[] {
  const args: Argument[] = [];
  let value = "";
  let start = -1;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\\" && quote !== "'") {
      const next = input[index + 1];
      if (next === undefined) throw new SyntaxError("Trailing escape in command arguments.");
      if (next === "\n") {
        index += 1;
        continue;
      }
      if (start < 0) start = index;
      if (quote === '"' && !['"', "\\", "$", "`"].includes(next)) {
        value += char;
      } else {
        value += next;
        index += 1;
      }
    } else if (quote) {
      if (char === quote) quote = null;
      else value += char;
    } else if (char === '"' || char === "'") {
      if (start < 0) start = index;
      quote = char;
    } else if (/\s/.test(char)) {
      if (start >= 0) args.push({ value, start });
      value = "";
      start = -1;
    } else {
      if (start < 0) start = index;
      value += char;
    }
  }
  if (quote) throw new SyntaxError(`Unclosed ${quote === '"' ? "double" : "single"} quote in command arguments.`);
  if (start >= 0) args.push({ value, start });
  return args;
}
