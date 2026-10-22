import { fileURLToPath } from "node:url";

const ptyRelay = fileURLToPath(new URL("./relay.py", import.meta.url));

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
    return { command: "python3", args: [ptyRelay, "--", command, ...args] };
  }
  throw new Error(`terminal PTY modes are unavailable on ${platform}; use line or pipe modes`);
}
