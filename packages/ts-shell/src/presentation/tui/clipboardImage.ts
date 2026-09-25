import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * An image from the system clipboard.
 *
 * There is no portable way to ask for one. Every terminal hands over text and
 * nothing else, so the bytes have to come from whichever clipboard the desktop
 * session actually has — and on this platform that is not even one clipboard,
 * because a Windows screenshot never reaches the Linux one.
 *
 * The three backends are tried in order and the distinction between them is kept
 * deliberately. A backend that *failed* and a backend that *has no image* are
 * different answers: the first means try the next one, the second means stop,
 * because a clipboard that was asked and answered "nothing" must not be followed
 * by one that still holds something older. Falling through on "nothing" is how a
 * paste delivers a picture the user copied an hour ago.
 */

/** The image types this build can send. */
const SUPPORTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** How long to wait for a clipboard tool before treating it as absent. */
const LIST_TIMEOUT_MS = 1_000;
/** The Windows clipboard round trip is slower, so it gets more room. */
const WINDOWS_TIMEOUT_MS = 5_000;

/**
 * The largest image worth attaching, in raw bytes.
 *
 * Providers reject an image whose base64 passes their own ceiling, and a refusal
 * there fails the whole request — including whatever the user wrote beside the
 * picture. 3.75 MB raw is 5 MB once base64 adds its third, which is the limit
 * that matters. Nothing here can make a picture smaller, so an oversized one is
 * refused where the user can still see why.
 */
const MAX_IMAGE_BYTES = 3.75 * 1024 * 1024;

export interface ClipboardImage {
  readonly bytes: Buffer;
  readonly mimeType: string;
}

/** What a backend found: an image, nothing, or a failure to ask. */
type BackendResult = ClipboardImage | null | undefined;

/** Run a clipboard command, returning its output or nothing when it could not run. */
function run(command: string, args: readonly string[], timeoutMs: number): Promise<Buffer | undefined> {
  // Built by hand rather than with `Promise.withResolvers`, which needs Node 22.
  // The declared floor is 20.3, and a helper that exists only on a newer runtime
  // than the package claims turns the first clipboard read into a `TypeError` on
  // every machine inside the declared range. The same reasoning is written out in
  // the retry wait and the file lock; this call was the one that missed it.
  let resolve!: (value: Buffer | undefined) => void;
  const promise = new Promise<Buffer | undefined>((settle) => {
    resolve = settle;
  });
  // No encoding, so the output is a Buffer: clipboard image bytes are not text,
  // and decoding them as UTF-8 would replace every invalid sequence and corrupt
  // the image without any error to say so.
  execFile(
    command,
    [...args],
    { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "buffer" },
    (error, stdout) => {
      resolve(error ? undefined : stdout);
    },
  );
  return promise;
}

/** `image/png;charset=utf-8` and `image/png` name the same format. */
function baseMimeType(value: string): string {
  return value.split(";")[0]!.trim().toLowerCase();
}

/** The best supported type among those offered, or nothing when none is. */
function selectMimeType(offered: readonly string[]): string | undefined {
  const normalized = offered.map(baseMimeType);
  for (const preferred of SUPPORTED_MIME_TYPES) {
    if (normalized.includes(preferred)) return preferred;
  }
  return undefined;
}

function splitTypes(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The Wayland clipboard, which is the one a Linux desktop session normally has. */
async function readViaWlPaste(): Promise<BackendResult> {
  const listed = await run("wl-paste", ["--list-types"], LIST_TIMEOUT_MS);
  if (listed === undefined) return undefined;

  const selected = selectMimeType(splitTypes(listed));
  // Asked and answered: there is no image here, so the next backend must not be
  // consulted — it may hold something stale.
  if (selected === undefined) return null;

  const data = await run("wl-paste", ["--type", selected, "--no-newline"], LIST_TIMEOUT_MS);
  if (data === undefined) return undefined;
  return data.length === 0 ? null : { bytes: data, mimeType: baseMimeType(selected) };
}

/** The X11 clipboard, for sessions that are not Wayland. */
async function readViaXclip(): Promise<BackendResult> {
  const targets = await run("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"], LIST_TIMEOUT_MS);
  if (targets !== undefined) {
    const selected = selectMimeType(splitTypes(targets));
    if (selected === undefined) return null;
    const data = await run("xclip", ["-selection", "clipboard", "-t", selected, "-o"], LIST_TIMEOUT_MS);
    if (data === undefined) return undefined;
    return data.length === 0 ? null : { bytes: data, mimeType: baseMimeType(selected) };
  }

  // The target list is itself optional on some setups, so each supported type is
  // tried directly before giving up.
  for (const mimeType of SUPPORTED_MIME_TYPES) {
    const data = await run("xclip", ["-selection", "clipboard", "-t", mimeType, "-o"], LIST_TIMEOUT_MS);
    if (data !== undefined && data.length > 0) return { bytes: data, mimeType };
  }
  return undefined;
}

/**
 * The Windows clipboard, reachable from a Linux session running under Windows.
 *
 * A screenshot taken with the Windows shortcut never reaches the Linux clipboard
 * at all, so this is not a fallback for a failure — it is the only place that
 * image exists.
 */
async function readViaWindows(): Promise<BackendResult> {
  const target = path.join(os.tmpdir(), `clipboard-${randomUUID()}.png`);
  try {
    const translated = await run("wslpath", ["-w", target], LIST_TIMEOUT_MS);
    if (translated === undefined) return undefined;
    const windowsPath = translated.toString("utf8").trim();
    if (windowsPath === "") return null;

    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      `$path = '${windowsPath.replaceAll("'", "''")}'`,
      "$img = [System.Windows.Forms.Clipboard]::GetImage()",
      "if ($img) { $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); Write-Output 'ok' } else { Write-Output 'empty' }",
    ].join("; ");

    const result = await run("powershell.exe", ["-NoProfile", "-Command", script], WINDOWS_TIMEOUT_MS);
    if (result === undefined) return undefined;
    if (result.toString("utf8").trim() !== "ok") return null;

    const bytes = fs.readFileSync(target);
    return bytes.length === 0 ? null : { bytes, mimeType: "image/png" };
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(target);
    } catch {
      // The file may never have been written; nothing to clean up.
    }
  }
}

/** Whether this session is running under Windows. */
function isWindowsHosted(): boolean {
  try {
    return /microsoft/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

/** What a read found: an image, a reason there is none, or nothing to say. */
export type ClipboardRead =
  | { readonly kind: "image"; readonly image: ClipboardImage }
  | { readonly kind: "too-large"; readonly bytes: number }
  | { readonly kind: "none" };

/**
 * The image on the clipboard, and what to say when there is not one.
 *
 * Failure is reported rather than thrown for every way this can go wrong: no
 * clipboard tool installed, no desktop session, a headless machine. None of those
 * is an error the caller can act on, and all of them mean the same thing to a
 * user — there is no image to paste. An image that is too large is told apart
 * from those, because it is the one case where the clipboard did hold a picture
 * and the user can do something about it.
 */
export async function readClipboardImage(): Promise<ClipboardRead> {
  const backends = isWindowsHosted()
    ? [readViaWindows, readViaWlPaste, readViaXclip]
    : [readViaWlPaste, readViaXclip];
  for (const backend of backends) {
    const found = await backend();
    // `null` means the clipboard answered and held no image, which ends the
    // search; `undefined` means this backend could not be asked.
    if (found === undefined) continue;
    if (found === null) return { kind: "none" };
    if (found.bytes.length > MAX_IMAGE_BYTES) {
      return { kind: "too-large", bytes: found.bytes.length };
    }
    return { kind: "image", image: found };
  }
  return { kind: "none" };
}
