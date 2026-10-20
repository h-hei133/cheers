import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"]);

export const REQUIRED_BUILD_INPUTS = [
  "package.json",
  "package-lock.json",
  "packages/ts-shell/package.json",
  "packages/ts-shell/tsconfig.json",
  "packages/ts-shell/tsconfig.build.json",
  "node_modules/typescript/package.json",
  "node_modules/typescript/bin/tsc",
  "node_modules/typescript/lib/tsc.js",
  "node_modules/typescript/lib/_tsc.js",
  "node_modules/typescript/lib/lib.es2024.d.ts",
  "node_modules/@types/node/index.d.ts",
  "scripts/build-cli.mjs",
  "scripts/build-cli-bin.mjs",
  "scripts/build-identity.mjs",
  "scripts/build-manifest.mjs",
  "scripts/start-lib.mjs",
  "scripts/start.mjs",
];

export const REQUIRED_BUILD_ENTRY = "entrypoints/cli.js";
export const REQUIRED_BUILD_INDEX = "index.js";
export const REQUIRED_BUILD_LAUNCHER = "dist/cli.js";
export const REQUIRED_PACKAGE_MAIN = "packages/ts-shell/dist/index.js";

export const REQUIRED_BUILD_ASSETS = [
  "presentation/themes/dark.json",
  "presentation/themes/dark-contrast.json",
  "presentation/themes/light.json",
  "presentation/themes/light-contrast.json",
  "presentation/themes/schema.json",
];

function filesUnder(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const rootStat = lstatSync(directory);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`Expected a directory without symlinks: ${directory}`);
  }
  const files = [];
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Directory tree contains a symlink: ${full}`);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && predicate(full)) files.push(full);
      else if (!entry.isFile()) throw new Error(`Directory tree contains an unsupported entry: ${full}`);
    }
  };
  walk(directory);
  return files;
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function digestFiles(root, files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => relative(root, left).localeCompare(relative(root, right)))) {
    hash.update(relative(root, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function listCompilerFiles(root) {
  const result = spawnSync(process.execPath, [
    path.join(root, "node_modules/typescript/bin/tsc"),
    "-p", path.join(root, "packages/ts-shell/tsconfig.build.json"),
    "--listFilesOnly",
  ], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not enumerate compiler inputs (exit ${result.status ?? "unknown"}).`);
  const rootPath = path.resolve(root);
  return [...new Set(result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => path.isAbsolute(line))
    .map(line => path.resolve(line))
    .filter(file => file.startsWith(`${rootPath}${path.sep}`))
    .filter(file => file.endsWith(".d.ts") || file.endsWith(".d.mts") || file.endsWith(".d.cts"))
    .map(file => relative(rootPath, file)))].sort();
}

export function buildInputDigest(root, compilerInputs = []) {
  const rootPath = path.resolve(root);
  const sourceRoot = path.join(root, "packages/ts-shell/src");
  const typeScriptLib = path.join(root, "node_modules/typescript/lib");
  const typesRoot = path.join(root, "node_modules/@types");
  for (const directory of [sourceRoot, typeScriptLib, typesRoot]) assertNoSymlinkPath(rootPath, directory);
  const sources = filesUnder(sourceRoot, file => SOURCE_EXTENSIONS.has(path.extname(file)));
  const compilerFiles = [
    ...filesUnder(typeScriptLib, file => file.endsWith(".d.ts")),
    ...filesUnder(typesRoot),
  ];
  const inputs = REQUIRED_BUILD_INPUTS.map(file => path.join(root, file));
  for (const file of inputs) {
    assertNoSymlinkPath(rootPath, file);
    if (!existsSync(file)) throw new Error(`Required build input is missing: ${relative(root, file)}`);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Required build input is not a regular file: ${relative(root, file)}`);
    }
  }
  const enumerated = compilerInputs.map(file => {
    const absolute = path.resolve(root, file);
    assertNoSymlinkPath(rootPath, absolute);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) throw new Error(`Compiler input is not a regular file: ${file}`);
    return absolute;
  });
  const allInputs = [...new Set([...sources, ...compilerFiles, ...inputs, ...enumerated])];
  return { digest: digestFiles(root, allInputs), files: allInputs.length };
}

export function snapshotFile(file, label = relative(process.cwd(), file)) {
  if (!existsSync(file)) throw new Error(`Required file is missing: ${label}`);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Required file is not a regular file: ${label}`);
  const bytes = readFileSync(file);
  return {
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function snapshotDirectory(directory) {
  if (!existsSync(directory)) return { digest: createHash("sha256").digest("hex"), artifacts: [] };
  const files = filesUnder(directory, () => true);
  const artifacts = files.map(file => {
    const stat = lstatSync(file);
    if (!stat.isFile()) throw new Error(`Build artifact is not a regular file: ${file}`);
    const bytes = readFileSync(file);
    return {
      path: relative(directory, file),
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const hash = createHash("sha256");
  for (const artifact of artifacts) hash.update(`${artifact.path}\0${artifact.size}\0${artifact.sha256}\0`);
  return { digest: hash.digest("hex"), artifacts };
}

export function safeRelativePath(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\")) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && normalized !== "." && !normalized.startsWith("../") && !normalized.includes("/../");
}

export function assertNoSymlinkPath(root, target) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  const rootStat = lstatSync(rootPath);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`Path root is not a regular directory: ${rootPath}`);
  const relativePath = path.relative(rootPath, targetPath);
  if (relativePath === "") return;
  if (!safeRelativePath(relativePath.split(path.sep).join("/"))) throw new Error(`Path escapes the repository: ${targetPath}`);
  let current = rootPath;
  for (const part of relativePath.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!existsSync(current)) break;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Path contains a symlink: ${current}`);
  }
}

export function buildIdFor({ version, inputsDigest, node, mode }) {
  return createHash("sha256").update(`${version}\0${inputsDigest}\0${node}\0${mode}`).digest("hex");
}
