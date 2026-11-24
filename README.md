# Cheers

Cheers is a TypeScript coding agent with an interactive terminal, durable sessions, configurable model connections, permission-aware tools, and a bundled single-file executable.

## Requirements

- Node.js 20.3 or newer for development and source execution
- Bun for building the single-file executable

## Run from source

```sh
npm ci
npm run setup
npm start
```

Use `/connect` in the terminal to configure a provider and its connection. Provider credentials are stored separately from human-editable settings. The model catalogue and settings accept YAML, with existing JSON files remaining readable. Run `cheers config migrate` to explicitly convert eligible user and workspace JSON configuration files. Migration creates a backup and reports each file outcome.

## Build

```sh
npm run build
npm run build:exe
```

The executable is written to `dist/bin/cheers` and includes its runtime. The build checks the generated executable on the host platform.

## Development checks

```sh
npm run verify:import-cycles
npm run check:config-consumers
npm run check:declarations
npm run check:node-floor
npm run check:lint
npm run verify:docs-drift:strict
npm run test:ts
```

## License

MIT. See [LICENSE](LICENSE).
