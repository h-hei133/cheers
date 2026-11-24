# Install and start Cheers

## Install a release binary

Download the executable and its matching `.sha256` file from the [releases page](https://github.com/h-hei133/cheers/releases). Choose `cheers-linux-x64`, `cheers-darwin-arm64`, or `cheers-darwin-x64` for your system.

Run these commands from the download directory with your selected filename in place of `cheers-linux-x64`.

```sh
shasum -a 256 -c cheers-linux-x64.sha256
mkdir -p "$HOME/.local/bin"
install -m 755 cheers-linux-x64 "$HOME/.local/bin/cheers"
"$HOME/.local/bin/cheers" --version
```

## Requirements

- Node.js 20.3 or newer
- Bun when building a single-file executable

## Run from a checkout

```sh
npm ci
npm run setup
npm start
```

Configure a model connection with `/connect`. Settings and model catalogues can use YAML. Legacy JSON configuration remains available until you explicitly run `cheers config migrate`, which backs up each selected source before verifying its YAML replacement.

## Build a single-file executable

```sh
npm ci
npm run build
npm run build:exe
dist/bin/cheers --version
```

The executable includes its runtime. Run the build on the platform that will use the executable.
