# Install and Start

## Requirements

- Node.js >= 20
- Rust toolchain (`cargo`, optional `rustup`)
- Python 3.10+

## First-time setup

```bash
npm install
npm run setup
```

## Health check

```bash
npm run doctor
```

## Optional local config

Copy the example file and customize it:

```bash
cp .private-agents.example.json .private-agents.json
```

Supported keys:

- `provider`
- `daemonEnabled`
- `maxTurns`

## Daily-use commands

```bash
npm run build
npm test
npm start
```

## Optional Rust execution path

```bash
DAEMON_ENABLED=1 npm start
```

On PowerShell:

```powershell
$env:DAEMON_ENABLED='1'
npm start
```
