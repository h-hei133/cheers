import type { ExtensionFlag } from '../../extensions/runtime/flag.js';
import { isBuiltinOption, type UnresolvedOption } from './argv.js';

export class ExtensionOptionError extends Error {}

export interface ExtensionOptionDeclaration {
  readonly flag: ExtensionFlag;
  readonly source: { readonly entry: string; readonly canonical: string };
}

export interface CliExtensionArguments {
  value(declaration: ExtensionOptionDeclaration): string | boolean | undefined;
  validate(flags: readonly ExtensionOptionDeclaration[]): void;
}

export function assertExtensionOption(flag: ExtensionFlag): void {
  const option = `--${flag.name}`;
  if (isBuiltinOption(option)) throw new ExtensionOptionError(`Extension option ${option} is reserved by Cheers.`);
}

function valueFor(option: UnresolvedOption, type: NonNullable<ExtensionFlag['type']>): string | boolean {
  if (type === 'string') {
    const value = option.inline ?? option.following;
    if (value !== undefined) return value;
    throw new ExtensionOptionError(`Missing value for extension option ${option.name}.`);
  }
  if (option.inline === undefined || option.inline === 'true') return true;
  if (option.inline === 'false') return false;
  throw new ExtensionOptionError(`Extension option ${option.name} expects true or false.`);
}

function sameDeclaration(previous: ExtensionOptionDeclaration, current: ExtensionOptionDeclaration): boolean {
  return previous.source.entry === current.source.entry && previous.source.canonical === current.source.canonical
    && previous.flag.type === current.flag.type;
}

/** Bind startup values to declarations by the admitted extension generation. */
export function cliExtensionArguments(options: readonly UnresolvedOption[],
  finalize: (types: ReadonlyMap<string, NonNullable<ExtensionFlag['type']>>) => void): CliExtensionArguments {
  const pending = new Map(options.map(option => [option.name, Object.freeze({ ...option })]));
  if (pending.size !== options.length) throw new ExtensionOptionError('An extension option was given more than once.');
  const accepted = new Map<string, ExtensionOptionDeclaration>();
  const value = (declaration: ExtensionOptionDeclaration) => {
    const name = `--${declaration.flag.name}`, option = pending.get(name);
    if (!option) return undefined;
    const previous = accepted.get(name);
    if (previous && !sameDeclaration(previous, declaration)) {
      throw new ExtensionOptionError(`Extension option ${name} changed its source or type. Restart with explicit arguments.`);
    }
    return valueFor(option, declaration.flag.type ?? 'string');
  };
  return {
    value,
    validate(flags) {
      const declarations = new Map(flags.map(declaration => [`--${declaration.flag.name}`, declaration]));
      for (const name of pending.keys()) {
        const declaration = declarations.get(name);
        if (!declaration) throw new ExtensionOptionError('An option is not registered by the selected extensions.');
        value(declaration);
      }
      finalize(new Map(flags.map(({ flag }) => [`--${flag.name}`, flag.type ?? 'string'])));
      for (const name of pending.keys()) accepted.set(name, declarations.get(name)!);
    },
  };
}
