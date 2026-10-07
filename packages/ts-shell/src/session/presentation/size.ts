import type { SessionFileSize } from '../store/files.js';

/** Core logical bytes, sampled independently of attachment or allocated disk usage. */
export function sessionSizeLabel(size: SessionFileSize | undefined): string {
  if (!size || size.status === 'unknown' || size.bytes === null) return 'size unknown';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = size.bytes === 0 ? 0 : Math.min(units.length - 1, Math.floor(Math.log(size.bytes) / Math.log(1024)));
  const value = size.bytes / (1024 ** exponent);
  const label = `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
  return size.status === 'partial' ? `${label} sampled · partial` : label;
}
