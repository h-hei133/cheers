import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RUN_MANIFEST_SCHEMA = "phase20-quality-run-manifest.v1";

const MANIFEST_FILE = "run-manifest.json";
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_FILES = ["run-meta.json", "tokenizer.json"];

function fail(message) {
  throw new Error(message);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1_024
    && !value.startsWith("/") && !value.includes("\\")
    && value.split("/").every(part => part && part !== "." && part !== "..");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform === "win32" && fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

function walkFiles(root, relativeDirectory, predicate) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && predicate(target)) {
        files.push(path.relative(root, target).split(path.sep).join("/"));
      }
    }
  };
  visit(directory);
  return files;
}

function evidencePaths(root) {
  for (const file of REQUIRED_FILES) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) fail(`Run evidence is missing ${file}.`);
  }
  return [...new Set([
    ...REQUIRED_FILES,
    ...walkFiles(root, "pairs", file => file.endsWith(".json")),
    ...walkFiles(root, "arms", file => path.basename(file) === "run.json"),
    ...walkFiles(root, "blind-reviews", file => file.endsWith(".md")),
    ...walkFiles(root, "private", file => file.endsWith(".json") || file.endsWith(".jsonl")),
  ])].sort();
}

export function decodeRunManifest(value) {
  if (!record(value) || value.schemaVersion !== RUN_MANIFEST_SCHEMA
    || typeof value.runId !== "string" || value.runId.length === 0 || value.runId.length > 128
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || (value.parentManifestSha256 !== null && !SHA256.test(value.parentManifestSha256))
    || !Array.isArray(value.files) || value.files.length === 0 || value.files.length > 10_000) {
    fail("The quality run manifest header is invalid.");
  }
  const seen = new Set();
  let previous = "";
  const files = value.files.map(file => {
    if (!record(file) || !safeRelativePath(file.path) || !SHA256.test(file.sha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || seen.has(file.path)
      || file.path <= previous) {
      fail("The quality run manifest contains an invalid or unsorted artifact.");
    }
    seen.add(file.path);
    previous = file.path;
    return { path: file.path, sha256: file.sha256, bytes: file.bytes };
  });
  if (REQUIRED_FILES.some(file => !seen.has(file))) {
    fail("The quality run manifest omits required run metadata.");
  }
  return {
    schemaVersion: RUN_MANIFEST_SCHEMA,
    runId: value.runId,
    revision: value.revision,
    parentManifestSha256: value.parentManifestSha256,
    files,
  };
}

function verifyManifestFiles(root, manifest) {
  for (const entry of manifest.files) {
    const target = path.join(root, entry.path);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`Run evidence is not a regular file: ${entry.path}.`);
    }
    const bytes = fs.readFileSync(target);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      fail(`Run evidence changed after recording: ${entry.path}.`);
    }
  }
}

export function readRunManifest(root) {
  const file = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(file)) fail("The run has no run-manifest.json.");
  const raw = fs.readFileSync(file);
  if (raw.length > 4 * 1024 * 1024) fail("The run manifest exceeds 4 MiB.");
  let value;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("The run manifest is not valid JSON.");
  }
  const manifest = decodeRunManifest(value);
  const actual = evidencePaths(root);
  const recorded = manifest.files.map(entry => entry.path);
  if (JSON.stringify(actual) !== JSON.stringify(recorded)) {
    fail("The run manifest file set does not match the recorded evidence.");
  }
  verifyManifestFiles(root, manifest);
  return { manifest, file, sha256: sha256(raw) };
}

export function writeRunManifest(root, options = {}) {
  const previous = options.previous ?? (
    fs.existsSync(path.join(root, MANIFEST_FILE)) ? readRunManifest(root) : null
  );
  const additions = Array.isArray(options.additionalPaths) ? options.additionalPaths : [];
  if (additions.some(file => !safeRelativePath(file))) {
    fail("A run manifest addition is not a safe relative path.");
  }
  const actual = evidencePaths(root);
  if (previous) {
    verifyManifestFiles(root, previous.manifest);
    const expected = [...new Set([...previous.manifest.files.map(entry => entry.path), ...additions])].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail("The run evidence set changed while extending the manifest.");
    }
    if (additions.every(file => previous.manifest.files.some(entry => entry.path === file))) {
      return previous;
    }
  }
  const files = actual.map(relative => {
    const target = path.join(root, relative);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`Run evidence is not a regular file: ${relative}.`);
    }
    const bytes = fs.readFileSync(target);
    return { path: relative, sha256: sha256(bytes), bytes: bytes.length };
  });
  const manifest = {
    schemaVersion: RUN_MANIFEST_SCHEMA,
    runId: previous?.manifest.runId ?? randomUUID(),
    revision: previous ? previous.manifest.revision + 1 : 1,
    parentManifestSha256: previous?.sha256 ?? null,
    files,
  };
  atomicWriteJson(path.join(root, MANIFEST_FILE), manifest);
  return readRunManifest(root);
}

export function persistRatings(root, binding) {
  if (!record(binding) || !Buffer.isBuffer(binding.raw) || !SHA256.test(binding.sha256)) {
    fail("The ratings binding is invalid.");
  }
  const relative = `private/ratings-${binding.sha256}.json`;
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  if (fs.existsSync(target)) {
    const existing = fs.readFileSync(target);
    if (!existing.equals(binding.raw)) fail("A different ratings file already uses the same digest.");
  } else {
    fs.writeFileSync(target, binding.raw, { mode: 0o600 });
  }
  fs.chmodSync(target, 0o600);
  return relative;
}

export function manifestReportBinding(binding, root) {
  if (!binding?.manifest || !binding?.file) fail("The run manifest binding is incomplete.");
  return {
    schemaVersion: binding.manifest.schemaVersion,
    file: path.relative(root, binding.file).split(path.sep).join("/"),
    sha256: binding.sha256,
    runId: binding.manifest.runId,
    revision: binding.manifest.revision,
    artifacts: binding.manifest.files.length,
  };
}
