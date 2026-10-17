import * as fs from "node:fs";
import * as path from "node:path";
import { orderedLogFiles, tailLines, exportLogFiles } from "./logs/files.js";
import type { StructuredLogEntry } from "./types.js";
import { userDataDir } from "../core/paths/userHome.js"
import { assertProfileStorage, currentProfile, profilePathOverride, type ProfileContext } from '../core/paths/profile/context.js';

export interface RotatingFileSinkOptions {
  readonly logDir?: string;
  readonly maxFileSizeMb?: number;
  readonly maxHistoryDays?: number;
  /** Includes the current file; foreign live process logs may exceed the limit. */
  readonly maxFiles?: number;
  readonly filePrefix?: string;
  readonly pid?: number;
}

/**
 * Log file prefixes this tool has used before.
 *
 * The name changed, and the files written under the old one are still in the log
 * directory. Pruning has to recognise them, or the retention window silently stops
 * covering the oldest files — the ones it exists for.
 */
const LEGACY_FILE_PREFIXES = ["coding-agent"] as const;

/**
 * Rotating file sink for structured logs.
 * Segregates logs by process PID and date: <prefix>.<DATE>.<PID>.log.
 * Bounds history by age and count while preserving other processes' live logs.
 */
export class RotatingFileSink {
  private readonly profile = currentProfile();
  private readonly logDir: string;
  private readonly maxFileSizeBytes: number;
  private readonly maxHistoryDays: number;
  private readonly maxFiles: number;
  private readonly filePrefix: string;
  private readonly pid: number;
  private currentFilePath: string = "";
  private currentFileSize: number = 0;
  private currentPart = 0;
  private initialized: boolean = false;

  constructor(options: RotatingFileSinkOptions = {}) {
    const configuredDir = profilePathOverride('CHEERS_LOG_DIR');
    const defaultDir = path.join(userDataDir(), "logs");
    this.logDir = options.logDir ?? (configuredDir || defaultDir);
    assertProfileStorage(this.logDir, this.profile);
    this.maxFileSizeBytes = (options.maxFileSizeMb ?? 5) * 1024 * 1024;
    this.maxHistoryDays = options.maxHistoryDays ?? 7;
    this.maxFiles = options.maxFiles ?? 20;
    if (!Number.isSafeInteger(this.maxFiles) || this.maxFiles < 1) {
      throw new RangeError("maxFiles must be a positive safe integer.");
    }
    this.filePrefix = options.filePrefix ?? "cheers";
    this.pid = options.pid ?? process.pid;
  }

  getLogDir(): string {
    assertProfileStorage(this.logDir, this.profile);
    return this.logDir;
  }

  getCurrentFilePath(): string {
    assertProfileStorage(this.logDir, this.profile);
    if (!this.currentFilePath) {
      this.currentFilePath = this.computeLogPath();
    }
    assertProfileStorage(this.currentFilePath, this.profile);
    return this.currentFilePath;
  }
  write(entry: StructuredLogEntry): void {
    try {
      assertProfileStorage(this.logDir, this.profile);
      this.ensureInitialized();
      const line = JSON.stringify(entry) + "\n";
      const lineByteLength = Buffer.byteLength(line, "utf8");

      if (this.currentFileSize + lineByteLength > this.maxFileSizeBytes) {
        this.rotate();
      }

      assertProfileStorage(this.currentFilePath, this.profile);
      fs.appendFileSync(this.currentFilePath, line, "utf8");
      this.currentFileSize += lineByteLength;
    } catch {
      // Sinks must never crash the main host process
    }
  }
  getRecentLines(limit: number = 50): string[] {
    const bounded = Number.isFinite(limit) ? Math.max(0, Math.min(10_000, Math.trunc(limit))) : 50;
    if (bounded === 0) return [];
    let lines: string[] = [];
    try {
      for (const file of this.getFiles().reverse()) {
        lines = [...tailLines(file), ...lines].slice(-bounded);
        if (lines.length >= bounded) break;
      }
    } catch { return []; }
    return lines;
  }

  getFiles(strict = false): string[] {
    assertProfileStorage(this.logDir, this.profile);
    const files = orderedLogFiles(this.logDir, this.getCurrentFilePath(), { familyOnly: true, strict });
    for (const file of files) assertProfileStorage(file, this.profile);
    return files;
  }

  exportTo(target: string): number {
    const files = this.getFiles(true);
    if (files.length) exportLogFiles(files, target);
    return files.length;
  }

  clear(): void {
    for (const file of this.getFiles(true)) {
      assertProfileStorage(file, this.profile);
      fs.writeFileSync(file, "", "utf8");
    }
    this.currentFileSize = 0;
  }

  flushAndClose(): void {
    this.initialized = false;
  }
  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.openCurrentStream();
      this.pruneStaleLogs();
      this.initialized = true;
    } catch {
      // Fallback
    }
  }

  private computeLogPath(part: number = 0): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const suffix = part > 0 ? `.${part}` : "";
    return path.join(this.logDir, `${this.filePrefix}.${dateStr}.${this.pid}.log${suffix}`);
  }

  private openCurrentStream(): void {
    const basePath = this.computeLogPath();
    this.currentPart = orderedLogFiles(this.logDir, basePath, { familyOnly: true }).reduce(
      (highest, file) => Math.max(highest, Number(/\.log\.(\d+)$/.exec(file)?.[1] ?? 0)), 0,
    );
    this.currentFilePath = this.computeLogPath(this.currentPart);
    try {
      if (fs.existsSync(this.currentFilePath)) {
        const stats = fs.statSync(this.currentFilePath);
        this.currentFileSize = stats.size;
      } else {
        this.currentFileSize = 0;
      }
    } catch {
      this.currentFileSize = 0;
    }
  }

  private rotate(): void {
    try {
      // Retention can remove low suffixes. Reusing those holes would put newer
      // records before older shards whenever filesystem timestamps tie.
      let part = this.currentPart + 1;
      while (fs.existsSync(this.computeLogPath(part))) {
        part++;
      }
      this.currentFilePath = this.computeLogPath(part);
      this.currentPart = part;
      this.currentFileSize = 0;
      this.pruneStaleLogs();
    } catch {
      // Fallback
    }
  }

  private pruneStaleLogs(): void {
    const prefixes = new Set<string>([this.filePrefix, ...LEGACY_FILE_PREFIXES]);
    const now = Date.now();
    const maxAgeMs = this.maxHistoryDays * 24 * 60 * 60 * 1000;
    const retained: { file: string; removable: boolean }[] = [];
    const livePids = new Map<number, boolean>();
    for (const file of orderedLogFiles(this.logDir, this.currentFilePath)) {
      const match = /^(.+)\.(\d{4}-\d{2}-\d{2})\.(\d+)\.log(?:\.\d+)?$/.exec(path.basename(file));
      if (!match || !prefixes.has(match[1]!)) continue;
      const pid = Number(match[3]);
      if (pid !== this.pid && !livePids.has(pid)) livePids.set(pid, this.isProcessActive(pid));
      // Our closed shards are reclaimable even while this process stays alive.
      // Other processes do not expose their active path, so retain their files.
      const removable = file !== this.currentFilePath && !livePids.get(pid);
      if (removable && now - Date.parse(match[2]!) > maxAgeMs && this.removeLog(file)) continue;
      retained.push({ file, removable });
    }

    // The next append may create the current path; reserve its slot now.
    let excess = retained.length + Number(!fs.existsSync(this.currentFilePath)) - this.maxFiles;
    for (const { file, removable } of retained) {
      if (excess <= 0) break;
      if (removable && this.removeLog(file)) excess--;
    }
  }

  private removeLog(file: string): boolean {
    try {
      assertProfileStorage(file, this.profile);
      fs.unlinkSync(file);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT";
    }
  }

  private isProcessActive(pid: number): boolean {
    if (pid === this.pid) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // Permission or inspection failures are not evidence that a writer exited.
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }
}

let defaultRotatingFileSink: RotatingFileSink | null = null;
const profileSinks = new WeakMap<ProfileContext, RotatingFileSink>();

export function getGlobalRotatingFileSink(): RotatingFileSink {
  const profile = currentProfile();
  if (profile) {
    let sink = profileSinks.get(profile);
    if (!sink) { sink = new RotatingFileSink(); profileSinks.set(profile, sink); }
    return sink;
  }
  if (!defaultRotatingFileSink) {
    defaultRotatingFileSink = new RotatingFileSink();
  }
  return defaultRotatingFileSink;
}

export function setGlobalRotatingFileSink(sink: RotatingFileSink | null): void {
  const profile = currentProfile();
  if (profile) { if (sink) profileSinks.set(profile, sink); else profileSinks.delete(profile); return; }
  defaultRotatingFileSink = sink;
}
