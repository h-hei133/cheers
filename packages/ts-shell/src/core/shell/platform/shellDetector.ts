import os from "node:os";
import fs from "node:fs";
import type { PlatformKind, DetectedShell, PlatformEnvironment, ShellBackendKind } from "./types.js";

/**
 * Cross-Platform Shell Detector
 * Automatically inspects the host OS, finds installed shell binaries
 * (Git Bash, PowerShell 7/5.1, WSL, system /bin/bash), and selects the optimal default.
 */
export class ShellDetector {
  public static detectEnvironment(forcedBackend: ShellBackendKind = "auto"): PlatformEnvironment {
    const platform = os.platform() as PlatformKind;
    const arch = os.arch();
    const detectedShells = this.discoverShells(platform);

    let activeBackend: ShellBackendKind;
    if (forcedBackend !== "auto") {
      activeBackend = forcedBackend;
    } else {
      activeBackend = this.pickOptimalDefault(platform, detectedShells);
    }

    const activeShell =
      detectedShells.find((s) => s.kind === activeBackend) ?? {
        kind: activeBackend,
        executablePath:
          activeBackend === "powershell"
            ? (platform === "win32" ? "powershell.exe" : "pwsh")
            : activeBackend === "git-bash"
            ? (platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/bash")
            : activeBackend === "wsl"
            ? (platform === "win32" ? "wsl.exe" : "/bin/bash")
            : "/bin/bash",
        isAvailable: platform === "win32" ? activeBackend === "powershell" : activeBackend === "bash",
        isDefault: false,
      };

    const isPosixCompatible = activeShell.kind === "bash" || activeShell.kind === "git-bash" || activeShell.kind === "wsl";

    return {
      platform,
      arch,
      activeBackend: activeShell.kind,
      detectedShells,
      executionPath: activeShell.executablePath,
      isPosixCompatible,
      isAutoDetected: forcedBackend === "auto",
    };
  }

  private static discoverShells(platform: PlatformKind): DetectedShell[] {
    const shells: DetectedShell[] = [];

    if (platform === "win32") {
      // 1. Check Git Bash (highest priority for Windows)
      const gitBashPaths = [
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        ...(process.env.LOCALAPPDATA ? [`${process.env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe`] : []),
      ];
      let gitBashFound = false;
      for (const p of gitBashPaths) {
        if (p && fs.existsSync(p)) {
          shells.push({
            kind: "git-bash",
            executablePath: p,
            isAvailable: true,
            isDefault: true,
          });
          gitBashFound = true;
          break;
        }
      }
      if (!gitBashFound) {
        shells.push({
          kind: "git-bash",
          executablePath: "C:\\Program Files\\Git\\bin\\bash.exe",
          isAvailable: false,
          isDefault: false,
        });
      }

      // 2. Check PowerShell Core (pwsh.exe) / Windows PowerShell (powershell.exe)
      const pwshPath = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
      if (fs.existsSync(pwshPath)) {
        shells.push({
          kind: "powershell",
          executablePath: pwshPath,
          isAvailable: true,
          isDefault: !gitBashFound,
        });
      } else {
        shells.push({
          kind: "powershell",
          executablePath: "powershell.exe",
          isAvailable: true,
          isDefault: !gitBashFound,
        });
      }

      // 3. Check WSL
      const wslPath = "C:\\Windows\\System32\\wsl.exe";
      shells.push({
        kind: "wsl",
        executablePath: wslPath,
        isAvailable: fs.existsSync(wslPath),
        isDefault: false,
      });
    } else {
      // Linux / macOS: Standard POSIX bash / zsh / sh
      const defaultBash = process.env.SHELL || (fs.existsSync("/bin/bash") ? "/bin/bash" : fs.existsSync("/bin/sh") ? "/bin/sh" : "/bin/bash");
      const isAvailable = fs.existsSync(defaultBash) || defaultBash.startsWith("/");
      shells.push({
        kind: "bash",
        executablePath: defaultBash,
        isAvailable,
        isDefault: true,
      });
    }

    return shells;
  }

  private static pickOptimalDefault(
    platform: PlatformKind,
    shells: readonly DetectedShell[],
  ): ShellBackendKind {
    if (platform !== "win32") {
      return "bash";
    }

    // On Windows, prefer Git Bash (POSIX) if available, otherwise PowerShell
    const gitBash = shells.find((s) => s.kind === "git-bash" && s.isAvailable);
    if (gitBash) {
      return "git-bash";
    }

    return "powershell";
  }
}
