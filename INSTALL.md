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

You can bootstrap credentials either by editing the user config file or by using `/connect` inside the CLI.

```bash
npm start
```

Supported keys:

- `provider`
- `daemonEnabled`
- `maxTurns`
- `providerCredentials`

Supported provider profiles:

- `openai`
- `anthropic`
- `openai-compatible` (for SiliconFlow-style OpenAI-compatible endpoints)

For `openai-compatible`, store all three fields:

- `apiKey`
- `baseUrl`
- `model`

Recommended CLI onboarding flow:

```bash
/connect set openai-compatible <api-key> https://api.siliconflow.cn/v1 deepseek-ai/DeepSeek-V3
/connect status
```

## Daily-use commands

```bash
npm run build
npm test
npm start
```

Inside the CLI, you can then submit a real task prompt directly at the `>` prompt.

If you want to force the real-provider path during a session, set:

```powershell
$env:CHEERS_PROVIDER_MODE='real'
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
