import type { PlatformEnvironment, ShellBackendKind } from "./types.js";
import { ShellDetector } from "./shellDetector.js";

/**
 * Shell Manager
 * Tracks the active execution shell backend for the current process.
 */
export class ShellManager {
  private static forcedBackend: ShellBackendKind = "auto";

  public static getActiveEnvironment(): PlatformEnvironment {
    return ShellDetector.detectEnvironment(this.forcedBackend);
  }

  public static setBackend(backend: ShellBackendKind): PlatformEnvironment {
    const selected = ShellDetector.detectEnvironment(backend);
    if (!selected.isAvailable) throw new Error(`Shell backend '${selected.activeBackend}' is unavailable: ${selected.executionPath}`);
    this.forcedBackend = backend;
    return selected;
  }

  public static resetToAuto(): PlatformEnvironment {
    this.forcedBackend = "auto";
    return this.getActiveEnvironment();
  }

  public static formatStatusReport(): string {
    const env = this.getActiveEnvironment();
    const lines: string[] = [
      "# Cross-Platform Shell Environment Diagnostics",
      "",
      `**Host Platform**: \`${env.platform}\` (${env.arch})`,
      `**Active Shell Backend**: \`${env.activeBackend}\` ${env.isAutoDetected ? "*(auto-detected)*" : "*(manually configured)*"}`,
      `**Executable Path**: \`${env.executionPath}\``,
      `**Executable Available**: ${env.isAvailable ? "yes" : "no"}`,
      "**Selection Scope**: current process",
      `**Command Syntax**: ${env.isPosixCompatible ? "POSIX shell" : env.isAvailable ? "PowerShell" : "unavailable"}`,
      "",
      "### Detected Shell Backends:",
    ];

    env.detectedShells.forEach((s, idx) => {
      const isCurrent = s.kind === env.activeBackend;
      const statusTag = s.isAvailable ? (isCurrent ? "🟢 [ACTIVE]" : "⚪ [AVAILABLE]") : "❌ [NOT FOUND]";
      lines.push(`${idx + 1}. \`${s.kind}\` ${statusTag}`);
      lines.push(`   - Path: \`${s.executablePath}\``);
    });

    lines.push(
      "",
      "Commands:",
      "- `/shell use <bash|git-bash|powershell|wsl>` : Switch active shell backend",
      "- `/shell auto` : Reset to automatic platform detection",
    );

    return lines.join("\n");
  }
}
