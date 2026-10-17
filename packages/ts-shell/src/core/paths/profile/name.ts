/** A single portable identity, including on case-insensitive filesystems. */
export function profileName(value: string | undefined): string {
  const name = value?.trim().toLowerCase() || 'default';
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name) || name.endsWith('.')
    || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(name)) {
    throw new Error('Invalid profile name. Use 1–64 letters, numbers, dots, underscores or dashes; device names and trailing dots are reserved.');
  }
  return name;
}
