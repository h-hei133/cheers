function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function terminalSpawnSpec({ command, args = [], platform = process.platform }) {
  const commandLine = [command, ...args].map(quote).join(" ");
  const shellCommand = `stty rows 60 cols 120; exec ${commandLine}`;
  if (platform === "linux") {
    return { command: "script", args: ["-qec", shellCommand, "/dev/null"] };
  }
  if (platform === "darwin") {
    return { command: "script", args: ["-q", "/dev/null", "/bin/sh", "-c", shellCommand] };
  }
  throw new Error(`terminal PTY modes are unavailable on ${platform}; use line or pipe modes`);
}
