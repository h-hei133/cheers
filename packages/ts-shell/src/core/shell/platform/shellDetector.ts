import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { PlatformKind, DetectedShell, PlatformEnvironment, ShellBackendKind } from "./types.js";

/** Discovers executable shells; a login-shell preference is not an execution backend. */
export class ShellDetector {
  public static detectEnvironment(forcedBackend: ShellBackendKind = "auto"): PlatformEnvironment {
    const platform = os.platform() as PlatformKind;
    const detectedShells = this.discoverShells(platform);
    const fallback = platform === "win32" ? "powershell" : "bash";
    const activeBackend = forcedBackend === "auto"
      ? detectedShells.find(shell => shell.isDefault)?.kind ?? fallback
      : forcedBackend;
    const activeShell = detectedShells.find(shell => shell.kind === activeBackend)!;
    return {
      platform,
      arch: os.arch(),
      activeBackend,
      detectedShells,
      executionPath: activeShell.executablePath,
      isAvailable: activeShell.isAvailable,
      isPosixCompatible: activeShell.isAvailable && activeShell.kind !== "powershell",
      isAutoDetected: forcedBackend === "auto",
    };
  }

  private static discoverShells(platform: PlatformKind): DetectedShell[] {
    const windows = platform === "win32";
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const gitCandidates = windows ? [
      path.win32.join(programFiles, "Git", "bin", "bash.exe"),
      path.win32.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
      ...(process.env.LOCALAPPDATA ? [path.win32.join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe")] : []),
    ] : [];
    const gitBash = gitCandidates.find(candidate => executable(candidate, platform));
    const bash = windows ? gitBash : ["/bin/bash", "/usr/bin/bash"].find(candidate => executable(candidate, platform))
      ?? onPath("bash", platform) ?? ["/bin/sh", "/usr/bin/sh"].find(candidate => executable(candidate, platform))
      ?? onPath("sh", platform);
    const powershell = windows
      ? [path.win32.join(programFiles, "PowerShell", "7", "pwsh.exe")].find(candidate => executable(candidate, platform))
        ?? onPath("pwsh.exe", platform) ?? onPath("powershell.exe", platform)
        ?? [path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")].find(candidate => executable(candidate, platform))
      : onPath("pwsh", platform);
    const wslCandidate = path.win32.join(systemRoot, "System32", "wsl.exe");
    const wsl = windows && executable(wslCandidate, platform) ? wslCandidate : undefined;
    const candidates: Array<{ kind: Exclude<ShellBackendKind, "auto">; found?: string; fallback: string }> = [
      { kind: "git-bash", found: gitBash, fallback: gitCandidates[0] ?? "bash.exe" },
      { kind: "powershell", found: powershell, fallback: windows ? "powershell.exe" : "pwsh" },
      { kind: "bash", found: bash, fallback: windows ? "bash.exe" : "/bin/bash" },
      { kind: "wsl", found: wsl, fallback: windows ? wslCandidate : "wsl.exe" },
    ];
    const preferred = windows ? gitBash ? "git-bash" : powershell ? "powershell" : wsl ? "wsl" : undefined
      : bash ? "bash" : powershell ? "powershell" : undefined;
    return candidates.map(candidate => ({
      kind: candidate.kind,
      executablePath: candidate.found ?? candidate.fallback,
      isAvailable: candidate.found !== undefined,
      isDefault: candidate.kind === preferred,
    }));
  }
}

function executable(candidate: string, platform: PlatformKind): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    fs.accessSync(candidate, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch { return false; }
}

function onPath(name: string, platform: PlatformKind): string | undefined {
  try {
    const output = execFileSync(platform === "win32" ? "where.exe" : "which", [name], {
      encoding: "utf8", timeout: 1000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim().split(/\r?\n/).find(candidate => executable(candidate, platform));
  } catch { return undefined; }
}
