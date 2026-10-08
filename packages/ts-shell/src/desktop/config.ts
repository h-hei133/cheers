import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { DesktopError } from './model.js';

export interface NativeFile { readonly path: string; readonly identity: string }
export interface DesktopConfig {
  readonly display: string;
  readonly xdotool: NativeFile;
  readonly ffmpeg: NativeFile;
  readonly xclip?: NativeFile;
  readonly authority?: NativeFile;
  readonly identity: string;
}

function file(input: string | undefined, executable: boolean): NativeFile {
  if (!input || !path.isAbsolute(input) || /[\x00-\x1f]/.test(input)) throw new DesktopError('unavailable', 'An explicit absolute native utility or authority path is required.');
  try {
    const canonical = realpathSync(input); const stats = statSync(canonical, { bigint: true });
    if (!stats.isFile()) throw new Error();
    accessSync(canonical, executable ? constants.X_OK : constants.R_OK);
    return { path: canonical, identity: `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}` };
  } catch { throw new DesktopError('unavailable', 'A configured native utility or authority file is unavailable.'); }
}

/** Passive explicit adapter selection; inherited user desktop/clipboard variables never select it. */
export function desktopConfig(env: NodeJS.ProcessEnv = process.env, platform = process.platform): DesktopConfig {
  if (platform !== 'linux') throw new DesktopError('unavailable', 'Native desktop adapter is unavailable on this platform; Linux X11 is supported.');
  const display = env.CHEERS_DESKTOP_DISPLAY;
  if (!display || !/^(?:127\.0\.0\.1|localhost)?:\d{1,5}(?:\.\d{1,2})?$/.test(display)) throw new DesktopError('unavailable', 'Set CHEERS_DESKTOP_DISPLAY to an explicit local X11 display. Wayland and inherited DISPLAY are unavailable.');
  const selected = { display, xdotool: file(env.CHEERS_DESKTOP_XDOTOOL_PATH, true), ffmpeg: file(env.CHEERS_DESKTOP_FFMPEG_PATH, true),
    ...(env.CHEERS_DESKTOP_XCLIP_PATH ? { xclip: file(env.CHEERS_DESKTOP_XCLIP_PATH, true) } : {}),
    ...(env.CHEERS_DESKTOP_XAUTHORITY ? { authority: file(env.CHEERS_DESKTOP_XAUTHORITY, false) } : {}) };
  return Object.freeze({ ...selected, identity: JSON.stringify(selected) });
}

export function verifyDesktopConfig(config: DesktopConfig): void {
  if (desktopConfig().identity !== config.identity) throw new DesktopError('changed', 'Desktop adapter, display or authority changed after approval.');
}

export function desktopEnvironment(config: DesktopConfig): Readonly<Record<string, string>> {
  return { DISPLAY: config.display, ...(config.authority ? { XAUTHORITY: config.authority.path } : {}), PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
}
