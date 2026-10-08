import { createHash } from 'node:crypto';
import type { ExecutionService } from '../runtime/execution/types.js';
import { desktopCommand, type DesktopScope } from './command.js';
import type { DesktopConfig } from './config.js';
import { DesktopError, type DesktopSnapshot, type Rectangle } from './model.js';

export class X11Adapter {
  constructor(readonly config: DesktopConfig, private readonly service: ExecutionService, private readonly root: string) {}

  async windows(scope: DesktopScope): Promise<readonly string[]> {
    const output = await desktopCommand(this.service, this.config, this.root, scope, this.config.xdotool, ['search', '--onlyvisible', '--name', '.']);
    const values = output.toString('utf8').trim().split(/\s+/).filter(Boolean);
    if (values.length > 64 || values.some(value => !/^\d+$/.test(value))) throw new DesktopError('limit', 'Window enumeration exceeded its bounded native format.');
    return values;
  }

  async observe(scope: DesktopScope, selected: 'screen' | 'window', windowId?: string): Promise<Omit<DesktopSnapshot, 'id'>> {
    if (selected === 'window' && (!windowId || !/^\d{1,12}$/.test(windowId))) throw new DesktopError('invalid', 'A numeric windowId is required for window scope.');
    const screen = dimensions(await desktopCommand(this.service, this.config, this.root, scope, this.config.xdotool, ['getdisplaygeometry']));
    const focus = (await desktopCommand(this.service, this.config, this.root, scope, this.config.xdotool, ['getwindowfocus'])).toString('utf8').trim();
    if (!/^\d{1,12}$/.test(focus)) throw new DesktopError('command', 'Native focus identity is unavailable.');
    let frame: Rectangle = { x: 0, y: 0, ...screen }; let windowIdentity: string | undefined;
    if (selected === 'window') {
      frame = geometry(await desktopCommand(this.service, this.config, this.root, scope, this.config.xdotool, ['getwindowgeometry', '--shell', windowId!]));
      const name = await desktopCommand(this.service, this.config, this.root, scope, this.config.xdotool, ['getwindowname', windowId!]);
      windowIdentity = createHash('sha256').update(name).digest('hex');
    }
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.width > screen.width || frame.y + frame.height > screen.height
      || frame.width * frame.height > 4_000_000) throw new DesktopError('limit', 'Selected desktop frame is outside the screen or exceeds 4 MP.');
    return { scope: selected, ...(windowId ? { windowId } : {}), focus, frame, screen, ...(windowIdentity ? { windowIdentity } : {}) };
  }

  async screenshot(scope: DesktopScope, snapshot: DesktopSnapshot, masks: readonly Rectangle[]): Promise<Buffer> {
    const { frame } = snapshot;
    const filter = masks.length ? masks.map(mask => `drawbox=x=${mask.x}:y=${mask.y}:w=${mask.width}:h=${mask.height}:color=black:t=fill`).join(',') : 'null';
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${frame.width}x${frame.height}`,
      '-i', `${this.config.display}+${frame.x},${frame.y}`, '-frames:v', '1', '-vf', filter, '-threads', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'];
    const png = await desktopCommand(this.service, this.config, this.root, scope, this.config.ffmpeg, args, 2 * 1024 * 1024);
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || png.readUInt32BE(16) !== frame.width || png.readUInt32BE(20) !== frame.height) throw new DesktopError('command', 'Native screenshot dimensions or PNG format do not match the selected frame.');
    return png;
  }

  async input(scope: DesktopScope, action: string, args: Record<string, unknown>, snapshot: DesktopSnapshot): Promise<void> {
    let command: string[]; let input: Buffer | undefined;
    if (action === 'focus') {
      if (!snapshot.windowId) throw new DesktopError('invalid', 'Focus requires a selected window.');
      command = ['windowfocus', '--sync', snapshot.windowId];
    } else if (action === 'click') {
      const x = args.x as number, y = args.y as number;
      if (![1, 2, 3].includes((args.button ?? 1) as number)) throw new DesktopError('invalid', 'Click button must be 1, 2 or 3.');
      if (!snapshot.image?.coordinatesAvailable || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0
        || x >= snapshot.frame.width || y >= snapshot.frame.height) throw new DesktopError('invalid', 'Click requires valid coordinates from a current reviewed screenshot.');
      command = ['mousemove', '--sync', String(snapshot.frame.x + x), String(snapshot.frame.y + y), 'click', '--clearmodifiers', String(args.button ?? 1)];
    } else if (action === 'key') {
      if (typeof args.key !== 'string' || !KEYS.has(args.key)) throw new DesktopError('invalid', 'Key is outside the supported key allowlist.');
      command = ['key', '--clearmodifiers', args.key];
    } else {
      if (typeof args.text !== 'string' || Buffer.byteLength(args.text) > 16 * 1024 || args.text.includes('\0')) throw new DesktopError('invalid', 'Type requires text of at most 16 KiB without NUL.');
      command = ['type', '--clearmodifiers', '--file', '-']; input = Buffer.from(args.text);
    }
    await desktopCommand(this.service, this.config, this.root, scope, this.config.xdotool, command, 64 * 1024, true, input);
  }

  async clipboard(scope: DesktopScope): Promise<{ bytes: number; sha256: string; redacted: true }> {
    if (!this.config.xclip) throw new DesktopError('unavailable', 'Native clipboard adapter is unavailable. Configure an explicit xclip utility.');
    const bytes = await desktopCommand(this.service, this.config, this.root, scope, this.config.xclip, ['-selection', 'clipboard', '-t', 'UTF8_STRING', '-o']);
    return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), redacted: true };
  }
}

const KEYS = new Set(['Return', 'Tab', 'Escape', 'BackSpace', 'Delete', 'Left', 'Right', 'Up', 'Down', 'Home', 'End', 'Page_Up', 'Page_Down', 'space', 'ctrl+a', 'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+f', 'alt+Tab']);

function dimensions(output: Buffer): { width: number; height: number } {
  const match = /^(\d{1,5}) (\d{1,5})\s*$/.exec(output.toString('utf8'));
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) throw new DesktopError('command', 'Native screen geometry is unavailable.');
  return { width: Number(match[1]), height: Number(match[2]) };
}

function geometry(output: Buffer): Rectangle {
  const fields = Object.fromEntries(output.toString('utf8').trim().split('\n').map(line => line.split('=')));
  if (['X', 'Y', 'WIDTH', 'HEIGHT'].some(key => !/^-?\d{1,6}$/.test(fields[key] ?? ''))) throw new DesktopError('command', 'Native window geometry is unavailable.');
  const frame = { x: Number(fields.X), y: Number(fields.Y), width: Number(fields.WIDTH), height: Number(fields.HEIGHT) };
  if (frame.width < 1 || frame.height < 1) throw new DesktopError('command', 'Native window geometry is empty.');
  return frame;
}
