import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  decodeRunManifest,
  manifestReportBinding,
  persistRatings,
  readRunManifest,
  RUN_MANIFEST_SCHEMA,
  writeRunManifest,
} from "./qa-quality-manifest.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function seededRun(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-quality-manifest-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, "run-meta.json", "{\"schemaVersion\":\"run\"}\n");
  write(root, "tokenizer.json", "{\"status\":\"measured\"}\n");
  write(root, "pairs/read-symbol/0.json", "{\"pairId\":\"read-symbol:0\"}\n");
  write(root, "arms/read-symbol/0/full/run.json", "{\"arm\":\"full\"}\n");
  write(root, "blind-reviews/summary-facts/0/candidate.md", "# candidate\n");
  write(root, "private/review-map.jsonl", "{\"candidateId\":\"c\"}\n");
  return root;
}

test("the run manifest binds every evidence class and rejects later changes", t => {
  const root = seededRun(t);
  const binding = writeRunManifest(root);
  assert.equal(binding.manifest.schemaVersion, RUN_MANIFEST_SCHEMA);
  assert.equal(binding.manifest.revision, 1);
  assert.deepEqual(binding.manifest.files.map(file => file.path), [
    "arms/read-symbol/0/full/run.json",
    "blind-reviews/summary-facts/0/candidate.md",
    "pairs/read-symbol/0.json",
    "private/review-map.jsonl",
    "run-meta.json",
    "tokenizer.json",
  ]);
  assert.equal(readRunManifest(root).sha256, binding.sha256);
  write(root, "pairs/read-symbol/0.json", "{\"pairId\":\"changed\"}\n");
  assert.throws(() => readRunManifest(root), /changed after recording/);
});

test("ratings extend the manifest without blessing changed or extra evidence", t => {
  const root = seededRun(t);
  const first = writeRunManifest(root);
  const raw = Buffer.from("{\"read-symbol:0\":{}}\n");
  const ratings = { raw, sha256: sha256(raw) };
  const ratingsPath = persistRatings(root, ratings);
  const second = writeRunManifest(root, { previous: first, additionalPaths: [ratingsPath] });
  assert.equal(second.manifest.revision, 2);
  assert.equal(second.manifest.parentManifestSha256, first.sha256);
  assert.ok(second.manifest.files.some(file => file.path === ratingsPath));
  assert.equal(manifestReportBinding(second, root).artifacts, second.manifest.files.length);

  const third = writeRunManifest(root);
  write(root, "pairs/unlisted/0.json", "{}\n");
  assert.throws(() => readRunManifest(root), /file set does not match/);
  assert.throws(() => writeRunManifest(root, {
    previous: third,
    additionalPaths: ["private/ratings-extra.json"],
  }), /file set does not match|changed while extending/);
});

test("the run manifest decoder rejects unsafe, duplicate and unsorted entries", () => {
  const digest = "a".repeat(64);
  const base = {
    schemaVersion: RUN_MANIFEST_SCHEMA,
    runId: "run",
    revision: 1,
    parentManifestSha256: null,
    files: [
      { path: "run-meta.json", sha256: digest, bytes: 1 },
      { path: "tokenizer.json", sha256: digest, bytes: 1 },
    ],
  };
  assert.deepEqual(decodeRunManifest(base).files.map(file => file.path), ["run-meta.json", "tokenizer.json"]);
  assert.throws(() => decodeRunManifest({
    ...base,
    files: [{ path: "../run-meta.json", sha256: digest, bytes: 1 }],
  }), /invalid or unsorted/);
  assert.throws(() => decodeRunManifest({
    ...base,
    files: [
      { path: "tokenizer.json", sha256: digest, bytes: 1 },
      { path: "run-meta.json", sha256: digest, bytes: 1 },
    ],
  }), /invalid or unsorted/);
  assert.throws(() => decodeRunManifest({
    ...base,
    files: [base.files[0], base.files[0]],
  }), /invalid or unsorted/);
});
