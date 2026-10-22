#!/usr/bin/env node
/**
 * Responsiveness probes bound to the verified immutable build.
 *
 * This measures the synchronous work behind one list key and the renderers
 * whose input arrives as one stream chunk. Process startup remains the job of
 * bench:start and bench:interactive; these numbers are not startup evidence.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkBuild } from "./start-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "packages/ts-shell/dist");
const runs = Number(process.env.BENCH_RUNS ?? 30);
if (!Number.isSafeInteger(runs) || runs < 2) {
  console.error("BENCH_RUNS must be an integer of at least 2");
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "packages/ts-shell/package.json"), "utf8"));
const verified = checkBuild({ root, dist, version: pkg.version, executablePolicy: "required" });
if (!verified.ok) {
  console.error(`Build first: ${verified.reason}`);
  process.exit(2);
}

const manifest = verified.manifest;
const buildRoot = path.dirname(path.dirname(verified.entry));
const load = relative => import(pathToFileURL(path.join(buildRoot, relative)).href);
const executable = path.join(root, verified.executable.path);
const measuredModules = [
  path.join(buildRoot, "presentation/tui/chrome/options.js"),
  path.join(buildRoot, "presentation/tui/chrome/panel.js"),
  path.join(buildRoot, "presentation/tui/transcript/markdown.js"),
  path.join(buildRoot, "presentation/tui/transcript/diff.js"),
];
const evidenceFiles = [verified.entry, executable, path.join(dist, "build-manifest.json"),
  fileURLToPath(import.meta.url), ...measuredModules,
  ...manifest.artifacts.map(artifact => path.join(dist, artifact.path))];
const evidence = () => evidenceFiles.map(file => createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
const evidenceBefore = evidence();
const measurementSha256 = createHash("sha256").update(JSON.stringify(evidenceBefore)).digest("hex");
const [{ OptionModel }, { renderPanel }, { renderMarkdown }, { renderDiff }] = await Promise.all([
  load("presentation/tui/chrome/options.js"),
  load("presentation/tui/chrome/panel.js"),
  load("presentation/tui/transcript/markdown.js"),
  load("presentation/tui/transcript/diff.js"),
]);
if (JSON.stringify(evidence()) !== JSON.stringify(evidenceBefore)) {
  throw new Error("Build bytes changed while the measured modules were loading");
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function round(value) {
  return Number(value.toFixed(3));
}

function bootstrapInterval(values, quantile, iterations = 1000) {
  const sorted = [...values].sort((left, right) => left - right);
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const resampled = Array.from({ length: sorted.length }, () => sorted[Math.floor(random() * sorted.length)])
      .sort((left, right) => left - right);
    estimates.push(percentile(resampled, quantile));
  }
  estimates.sort((left, right) => left - right);
  return { low: round(percentile(estimates, 2.5)), high: round(percentile(estimates, 97.5)) };
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    minMs: round(sorted[0]),
    maxMs: round(sorted.at(-1)),
    uncertainty: {
      p50: bootstrapInterval(sorted, 50),
      p95: bootstrapInterval(sorted, 95),
    },
  };
}

function sample(operation) {
  const started = performance.now();
  operation();
  return performance.now() - started;
}

const options = Array.from({ length: 1000 }, (_, index) => ({
  id: `session-${index}`,
  label: `Session ${index}`,
  detail: `workspace ${index % 17}`,
  note: index % 5 === 0 ? "pinned" : "today",
}));
const listModel = new OptionModel();
listModel.setOptions(options);
const listChrome = { title: "Sessions", empty: "none", multiple: false, detailRows: 1 };
sample(() => renderPanel(listModel, listChrome, 120, 40));
const listSamples = [];
for (let index = 0; index < runs; index += 1) {
  listSamples.push(sample(() => {
    listModel.step(index % 2 === 0 ? 1 : -1);
    renderPanel(listModel, listChrome, 120, 40);
  }));
}

const table = [
  `| ${Array.from({ length: 16 }, (_, index) => `column ${index}`).join(" | ")} |`,
  `| ${Array.from({ length: 16 }, () => ":---").join(" | ")} |`,
  ...Array.from({ length: 200 }, (_, row) =>
    `| ${Array.from({ length: 16 }, (_, column) => `r${row}c${column}`).join(" | ")} |`),
].join("\n");
const math = `$$\n${String.raw`\begin{bmatrix}1&20&300&4\\5&6&7&8\\9&10&11&12\end{bmatrix}`}\n$$`;
const diff = [
  "@@ -1,400 +1,400 @@",
  ...Array.from({ length: 400 }, (_, index) => index % 2 === 0 ? `-before ${index} ${"x".repeat(40)}` : `+after ${index} ${"y".repeat(40)}`),
].join("\n");
const renderCases = [
  { name: "math", operation: () => renderMarkdown(math, 120) },
  { name: "table", operation: () => renderMarkdown(table, 160) },
  { name: "diff", operation: () => renderDiff(diff, 160, { sideBySide: true }) },
];
const renderReports = [];
for (const renderCase of renderCases) {
  sample(renderCase.operation);
  const samples = [];
  for (let index = 0; index < runs; index += 1) samples.push(sample(renderCase.operation));
  renderReports.push({ name: renderCase.name, samples: samples.map(round), summary: summarize(samples) });
}

if (JSON.stringify(evidence()) !== JSON.stringify(evidenceBefore)) {
  throw new Error("Build or benchmark inputs changed during measurement");
}

const list = { samples: listSamples.map(round), summary: summarize(listSamples) };
const thresholds = { listKeyP95Ms: 50, singleRenderBlockMs: 100 };
const checks = {
  listKeyP95: list.summary.p95Ms <= thresholds.listKeyP95Ms,
  singleRenderBlock: renderReports.every(report => report.summary.maxMs <= thresholds.singleRenderBlockMs),
};
const output = {
  build: {
    buildId: manifest.buildId,
    inputsDigest: manifest.inputsDigest,
    artifactDigest: manifest.artifactDigest,
    executableSha256: createHash("sha256").update(fs.readFileSync(executable)).digest("hex"),
    measurementSha256,
  },
  fixture: {
    platform: process.platform,
    architecture: process.arch,
    kernel: os.release(),
    node: process.version,
    cpu: os.cpus()[0]?.model,
    runs,
    qualifying: runs >= 30,
    cacheControl: "warm-uncontrolled",
    list: { items: options.length, width: 120, rows: 40, warmups: 1 },
    render: { width: 160, tableRows: 200, diffRows: 400, mathMatrix: "3x4", warmups: 1 },
    note: "Synchronous compiled-module probes hosted by Node. Duration is the event-loop block for that call. This does not measure exe-specific startup; bench:interactive covers both launch forms.",
  },
  thresholds,
  checks,
  listKey: list,
  renders: renderReports,
};

const target = process.env.BENCH_OUTPUT?.trim();
if (target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
