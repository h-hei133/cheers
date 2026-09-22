import * as fs from "node:fs";
import * as path from "node:path";
import type { StructuredLogEntry } from "./types.js";
import { userDataDir } from "../core/paths/userHome.js"

export interface RotatingFileSinkOptions {
  readonly logDir?: string;
  readonly maxFileSizeMb?: number;
  readonly maxHistoryDays?: number;
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
 * High-performance, non-blocking rotating file sink for structured logs.
 * Segregates logs by process PID and date: <prefix>.<DATE>.<PID>.log.
 * Cleans up stale logs older than maxHistoryDays while actively protecting running PIDs.
 */
export class RotatingFileSink {
  private readonly logDir: string;
  private readonly maxFileSizeBytes: number;
  private readonly maxHistoryDays: number;
  private readonly filePrefix: string;
  private readonly pid: number;
  private currentFilePath: string = "";
  private currentFileSize: number = 0;
  private initialized: boolean = false;

  constructor(options: RotatingFileSinkOptions = {}) {
    const configuredDir = process.env.CHEERS_LOG_DIR?.trim();
    const defaultDir = path.join(userDataDir(), "logs");
    this.logDir = options.logDir ?? (configuredDir || defaultDir);
    this.maxFileSizeBytes = (options.maxFileSizeMb ?? 5) * 1024 * 1024;
    this.maxHistoryDays = options.maxHistoryDays ?? 7;
    this.filePrefix = options.filePrefix ?? "cheers";
    this.pid = options.pid ?? process.pid;
  }

  getLogDir(): string {
    return this.logDir;
  }

  getCurrentFilePath(): string {
    if (!this.currentFilePath) {
      this.currentFilePath = this.computeLogPath();
    }
    return this.currentFilePath;
  }
  write(entry: StructuredLogEntry): void {
    try {
      this.ensureInitialized();
      const line = JSON.stringify(entry) + "\n";
      const lineByteLength = Buffer.byteLength(line, "utf8");

      if (this.currentFileSize + lineByteLength > this.maxFileSizeBytes) {
        this.rotate();
      }

      fs.appendFileSync(this.currentFilePath, line, "utf8");
      this.currentFileSize += lineByteLength;
    } catch {
      // Sinks must never crash the main host process
    }
  }
  getRecentLines(limit: number = 50): string[] {
    const filePath = this.getCurrentFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      return lines.slice(-limit);
    } catch {
      return [];
    }
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
      this.pruneStaleLogs();
      this.openCurrentStream();
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
    this.currentFilePath = this.computeLogPath();
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
      let part = 1;
      while (fs.existsSync(this.computeLogPath(part))) {
        part++;
      }
      this.currentFilePath = this.computeLogPath(part);
      this.currentFileSize = 0;
    } catch {
      // Fallback
    }
  }

  private pruneStaleLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir);
      // Every prefix a log file may carry, current first. A file written under an
      // earlier name is still this tool's log, and pruning only the current prefix
      // would leave those on disk forever — the retention bound would stop
      // applying to exactly the files that are already oldest.
      const prefixes = [this.filePrefix, ...LEGACY_FILE_PREFIXES];
      const pattern = new RegExp(
        `^(?:${prefixes.join("|")})\\.(\\d{4}-\\d{2}-\\d{2})\\.(\\d+)\\.log(?:\\.\\d+)?$`,
      );
      const now = Date.now();
      const maxAgeMs = this.maxHistoryDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const match = file.match(pattern);
        if (!match) continue;

        const [, dateStr, pidStr] = match;
        const filePid = parseInt(pidStr, 10);

        // Protect currently active running processes
        if (this.isProcessActive(filePid)) {
          continue;
        }

        const fileDate = new Date(dateStr).getTime();
        if (now - fileDate > maxAgeMs) {
          const fullPath = path.join(this.logDir, file);
          fs.unlinkSync(fullPath);
        }
      }
    } catch {
      // Non-critical pruning failure
    }
  }

  private isProcessActive(pid: number): boolean {
    if (pid === this.pid) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

let defaultRotatingFileSink: RotatingFileSink | null = null;

export function getGlobalRotatingFileSink(): RotatingFileSink {
  if (!defaultRotatingFileSink) {
    defaultRotatingFileSink = new RotatingFileSink();
  }
  return defaultRotatingFileSink;
}

export function setGlobalRotatingFileSink(sink: RotatingFileSink | null): void {
  defaultRotatingFileSink = sink;
}
