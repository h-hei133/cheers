import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCostCommand } from "./costCommandRuntime.js";
import { recordSessionUsage, resetSessionUsage } from "../../observability/usageTelemetry.js";
import { writeCatalogCache } from "../models/catalogStore.js";
import type { CommandContext } from "./types.js";
import * as catalogStore from "../models/catalogStore.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { reportText } from "./report/projection.js";
import { renderReport } from "../../presentation/tui/report/renderer.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import { getSessionUsage } from '../../observability/usageTelemetry.js';
import { costModel } from './cost/model.js';
import { costReport } from './cost/report.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import { Pager, pageLongOutput } from '../../presentation/tui/chrome/pager.js';
import { visibleWidth } from '../../presentation/tui/text/measure.js';

/**
 * `/cost` renders one table per model.
 *
 * The defect this replaced: a session kept a single flat record whose model field
 * was overwritten each turn, so the newest model's rate was applied to every token
 * ever spent. The output looked entirely normal, which is what made it worse than
 * reporting nothing.
 */

const tempDirs: string[] = [];

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cost-cmd-"));
  tempDirs.push(dir);
  return dir;
}

function contextFor(sessionId: string, cwd: string): CommandContext {
  return { cwd, sessionId } as CommandContext;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

describe("runCostCommand", () => {
  it('releases the actual cost reader without reacquiring or changing retained accounting', async () => {
    const cwd = workspace(), sessionId = 'cost-reader-lifetime'; resetSessionUsage(sessionId);
    recordSessionUsage(sessionId, { provider: 'fixture', model: 'reader', promptTokens: 100, completionTokens: 10 });
    const before = JSON.stringify(getSessionUsage(sessionId));
    const read = vi.fn(() => ({ config: {} as never, catalog: [] }));
    const pager = new Pager();
    for (let round = 0; round < 10; round++) {
      const result = await runCostCommand([], { cwd, sessionId, readConfiguration: read });
      expect(read).toHaveBeenCalledTimes(round + 1);
      expect(result.report?.facts).toMatchObject({ recordedTokens: 110, recordedTurns: 1, shownModels: 1 });
      const report = result.report!, snapshot = JSON.stringify(report), block = { text: result.output, report, collapsed: false };
      expect(pageLongOutput(pager, '/cost', block)).toBe(true); expect(block.collapsed).toBe(true);
      pager.handlePaste('tokens');
      for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
        const rows = pager.render(width, height, height);
        expect(rows.length).toBeLessThanOrEqual(height); expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
      }
      pager.handleKey('escape', undefined, 24);
      expect(pager.active).toBe(false); expect(pager.text).toBe('');
      expect(pager as unknown as { report?: unknown; rows: unknown[]; filter: string }).toMatchObject({ report: undefined, rows: [], filter: '' });
      expect(block.report).toBe(report); expect(JSON.stringify(block.report)).toBe(snapshot);
      expect(read).toHaveBeenCalledTimes(round + 1); expect(JSON.stringify(getSessionUsage(sessionId))).toBe(before);
    }
  });

  it.each(['before', 'admission', 'configuration'] as const)('withholds cost inspection cancelled at %s', async phase => {
    const controller = new AbortController();
    if (phase === 'before') controller.abort();
    const read = vi.fn(() => {
      if (phase === 'configuration') controller.abort();
      return { config: {} as never, catalog: [] };
    });
    await expect(runCostCommand([], { cwd: workspace(), signal: controller.signal, readConfiguration: read,
      admission: () => { if (phase === 'admission') controller.abort(); return undefined; },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledTimes(phase === 'configuration' ? 1 : 0);
  });

  it('scrubs legacy and captured metadata only after exact grouping and price lookup', async () => {
    const session = 'cost-safe-metadata'; resetSessionUsage(session);
    const names = ['sk-\x1b[31msynthetic-sensitive-one', 'sk-\x1b[32msynthetic-sensitive-two', '@usage:sk-\x1b[31msynthetic-sensitive-legacy'];
    const prices = names.map((id, index) => ({ id, cost: { promptPerMTok: index + 1, completionPerMTok: 0 } }));
    vi.spyOn(catalogStore, 'loadCatalog').mockReturnValue([{ id: 'fixture', models: prices }]);
    for (const model of names) recordSessionUsage(session, { model, provider: '', promptTokens: 1_000_000 });
    const attribution = captureUsageAttribution({ provider: 'password=synthetic-sensitive-provider', model: 'sk-\x1b[31msynthetic-sensitive-captured',
      baseUrl: 'https://fixture.invalid/v1?api_key=synthetic-never-copied', rates: { promptPerMTok: 4, completionPerMTok: 0 } });
    recordSessionUsage(session, { provider: attribution.provider, model: attribution.model, attribution, promptTokens: 1_000_000 });
    const telemetry = getSessionUsage(session), before = JSON.stringify(telemetry);
    const model = costModel(telemetry, [{ id: 'fixture', models: prices }]);
    const report = costReport(model), result = await runCostCommand([], { cwd: workspace(), sessionId: session });
    for (const output of [JSON.stringify(report), reportText(report), JSON.stringify(result)]) expect(output).not.toContain('synthetic-sensitive');
    expect(report.facts).toMatchObject({ recordedTokens: 4_000_000, recordedTurns: 4, estimate: { usd: 10 } });
    expect((report.facts.models as Array<{ estimate: { usd: number } }>).map(bucket => bucket.estimate.usd).sort()).toEqual([1, 2, 3, 4]);
    expect(model.buckets).toHaveLength(4); expect(model.modelCount).toBe(4);
    const projected = report.facts.models as Array<{ key: string; label: string }>;
    expect(new Set(projected.map(bucket => bucket.key)).size).toBe(4);
    expect(projected.every(bucket => /^redacted:[a-f0-9]{64}$/.test(bucket.key))).toBe(true);
    expect(costReport(model).facts.models).toEqual(report.facts.models);
    expect(model.buckets.some(bucket => bucket.model === names[0])).toBe(true);
    expect(JSON.stringify(telemetry)).toBe(before);
  });

  it('rejects an obsolete original admission before reading accounting configuration', async () => {
    const read = vi.fn(() => ({ config: getRuntimeConfig(), catalog: [] }));
    const result = await runCostCommand([], { cwd: workspace(), admission: () => 'original binding changed', readConfiguration: read });
    expect(result.output).toBe('original binding changed'); expect(result.report).toBeUndefined(); expect(read).not.toHaveBeenCalled();
  });

  it('uses the original command workspace for safe paths without changing ledger names', async () => {
    const cwd = workspace(), session = 'cost-report-path', name = `file://${cwd}/meter`;
    const attribution = captureUsageAttribution({ provider: 'fixture', model: name, baseUrl: 'https://fixture.invalid',
      rates: { promptPerMTok: 1, completionPerMTok: 0 } });
    resetSessionUsage(session); recordSessionUsage(session, { provider: attribution.provider, model: name, attribution, promptTokens: 1 });
    vi.spyOn(catalogStore, 'loadCatalog').mockReturnValue([]);
    const result = await runCostCommand([], { cwd, sessionId: session });
    expect(result.report?.facts.models).toMatchObject([{ model: '[project]/meter', attribution: { model: '[project]/meter' } }]);
    expect((result.report?.facts.models as Array<{ label: string }>)[0]?.label).toBe('fixture/[project]/meter · https://fixture.invalid · destination 1');
    expect(Object.values(getSessionUsage(session).byModel)[0]?.attribution?.model).toBe(name);
  });
  it('keeps a positive cache estimate visible below four decimal places', async () => {
    const session = 'tiny-cache'; resetSessionUsage(session);
    for (let index = 0; index < 2; index++) recordSessionUsage(session, { provider: 'priced', model: 'meter', promptTokens: 1025 });
    vi.spyOn(catalogStore, 'loadCatalog').mockReturnValue([{ id: 'priced', models: [{ id: 'meter', cost: { promptPerMTok: 0.001, completionPerMTok: 1, cacheReadPerMTok: 0 } }] }]);
    const result = await runCostCommand([], { cwd: workspace(), sessionId: session });
    expect(result.output).toContain('Estimated extra cost against a cache read: <$0.0001');
    expect(result.output).not.toContain('$0.0000');
    const cache = result.report!.facts.cache as { waste: { totals: { missedCost: number } } };
    expect(cache.waste.totals.missedCost).toBeGreaterThan(0);
    expect(cache.waste.totals.missedCost).toBeCloseTo(0.000001025, 12);
  });

  it('uses one accepted catalog for every provider bucket and retains report provenance', async () => {
    const session = 'cost-accepted'; resetSessionUsage(session);
    recordSessionUsage(session, { provider: 'a', model: 'same', promptTokens: 1_000_000 });
    recordSessionUsage(session, { provider: 'b', model: 'same', promptTokens: 2_000_000 });
    const disk = vi.spyOn(catalogStore, 'loadCatalog').mockReturnValue([{ id: 'a', models: [{ id: 'same', cost: { promptPerMTok: 99, completionPerMTok: 99 } }] }]);
    const read = vi.fn(() => ({ config: getRuntimeConfig(), catalog: [
      { id: 'a', models: [{ id: 'same', cost: { promptPerMTok: 1, completionPerMTok: 2 } }] },
      { id: 'b', models: [{ id: 'same', cost: { promptPerMTok: 3, completionPerMTok: 4 } }] },
    ] }));
    const result = await runCostCommand([], { cwd: workspace(), sessionId: session, readConfiguration: read });
    expect(read).toHaveBeenCalledOnce(); expect(disk).not.toHaveBeenCalled();
    expect(result.report?.facts).toMatchObject({ recordedTokens: 3_000_000, estimate: { usd: 7, everyRatePublished: true }, models: [
      { key: 'a/same', estimate: { usd: 1 }, rateSource: 'published' }, { key: 'b/same', estimate: { usd: 6 }, rateSource: 'published' },
    ] });
    expect(result.output).toBe(reportText(result.report!));
    expect(JSON.stringify(result.report)).not.toContain('\\u001b');
    const narrow = stripAnsi(renderReport(result.report!, 30).join('\n'));
    expect(narrow).toContain('Estimated USD: $6.0000'); expect(narrow).toContain('b/same');
  });

  it.each([
    { name: 'total-only', usage: { totalTokens: 42 }, rates: { promptPerMTok: 1, completionPerMTok: 2 }, usd: null, coverage: 'partial' },
    { name: 'unpriced-cache', usage: { cacheReadTokens: 42 }, rates: { promptPerMTok: 1, completionPerMTok: 2 }, usd: null, coverage: 'partial' },
    { name: 'published-free', usage: { promptTokens: 42 }, rates: { promptPerMTok: 0, completionPerMTok: 0 }, usd: 0, coverage: 'complete' },
    { name: 'partial-subtotal', usage: { promptTokens: 1_000_000, cacheReadTokens: 100_000 }, rates: { promptPerMTok: 1, completionPerMTok: 2 }, usd: 1, coverage: 'partial' },
  ])('keeps $name distinct from an unsupported zero estimate', async ({ name, usage, rates, usd, coverage }) => {
    resetSessionUsage(name); recordSessionUsage(name, { ...usage, provider: 'priced', model: 'meter' });
    vi.spyOn(catalogStore, 'loadCatalog').mockReturnValue([{ id: 'priced', models: [{ id: 'meter', cost: rates }] }]);
    const result = await runCostCommand([], { cwd: workspace(), sessionId: name });
    expect(result.report?.facts.estimate).toMatchObject({ usd, coverage });
    if (usd === null) { expect(result.output).toContain('unknown'); expect(result.output).not.toContain('$0.0000'); }
    else expect(result.output).toContain(`$${usd.toFixed(4)}`);
    if (name === 'partial-subtotal') {
      expect(result.output).toContain('unknown');
      expect(result.report?.facts.models).toMatchObject([{ estimate: { usd: 1, unpricedTokens: 100_000, coverage: 'partial' } }]);
    }
  });

  it('does not price cache comparisons when the cache-read rate is missing', async () => {
    const session = 'cache-unpriced'; resetSessionUsage(session);
    for (let index = 0; index < 2; index++) recordSessionUsage(session, { provider: 'priced', model: 'meter', promptTokens: 99_999, cacheWriteTokens: 1 });
    vi.spyOn(catalogStore, 'loadCatalog').mockReturnValue([{ id: 'priced', models: [{ id: 'meter', cost: { promptPerMTok: 3, completionPerMTok: 15 } }] }]);
    const result = await runCostCommand([], { cwd: workspace(), sessionId: session });
    expect(result.output).toContain('Prompt cache hit rate: 0.0%'); expect(result.output).not.toContain('Estimated extra cost');
    expect(result.report?.facts.cache).toMatchObject({ waste: { totals: { missCount: 0 } } });
  });

  it("says there is nothing to count when nothing was recorded", async () => {
    const session = "sess_cost_empty";
    resetSessionUsage(session);
    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("nothing to count");
  });

  it("keeps totals complete while bounding model detail to an explicit partial window", () => {
    const session = 'cost-bounded-model-detail';
    resetSessionUsage(session);
    for (let index = 0; index < 70; index += 1) {
      recordSessionUsage(session, { provider: 'fixture', model: `model-${String(index).padStart(2, '0')}`, promptTokens: 1 });
    }
    const report = costReport(costModel(getSessionUsage(session), []));
    expect(report.facts).toMatchObject({
      totalModels: 70,
      shownModels: 64,
      omittedModels: 6,
      coverage: 'partial',
    });
    expect(reportText(report)).toContain('6 usage groups omitted');
  });

  it("names the model when only one answered", async () => {
    const session = "sess_cost_one";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000_000, completionTokens: 0, model: "solo" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("Model solo");
    expect(result.output).toContain("1,000,000 tokens");
    expect(result.output).toContain("$0.1400");
    // No session total row: with one model it would repeat the table's own total.
    expect(result.output).not.toContain("Session total");
  });

  it("gives each model its own table and totals them", async () => {
    const session = "sess_cost_two";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000_000, completionTokens: 0, model: "cheap" });
    recordSessionUsage(session, { promptTokens: 2_000_000, completionTokens: 0, model: "dear" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("2 models");
    expect(result.output).toContain("#### cheap");
    expect(result.output).toContain("#### dear");
    // Each model's own figure, and the sum.
    expect(result.output).toContain("$0.1400");
    expect(result.output).toContain("$0.2800");
    expect(result.output).toContain("Session total estimate: $0.4200");
    // The session-level token figure is the sum across buckets.
    expect(result.output).toContain("3,000,000 tokens");
  });

  it("does not apply one model's tokens to another's table", async () => {
    // Stated as the bug: the 9,000,000-token model must not carry the other's
    // figure, and vice versa. Written without assuming which section comes first,
    // because the ordering is alphabetical and not the point of this test.
    const session = "sess_cost_split";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000_000, completionTokens: 0, model: "small" });
    recordSessionUsage(session, { promptTokens: 9_000_000, completionTokens: 0, model: "large" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    const sections = result.output.split(/#### (small|large) ·/).filter(Boolean);
    // sections: ["...header...", "large", "...large body...", "small", "...small body..."]
    const bodyOf = (model: string): string => {
      const index = sections.indexOf(model);
      return sections[index + 1] ?? "";
    };
    expect(bodyOf("large")).toContain("9,000,000");
    expect(bodyOf("large")).not.toContain("1,000,000");
    expect(bodyOf("small")).toContain("1,000,000");
    expect(bodyOf("small")).not.toContain("9,000,000");
  });

  it("says the rates are estimates when no model publishes prices", async () => {
    // Every shipped model relies on the fallback today, so this is the normal
    // path and the wording has to be honest about it.
    const session = "sess_cost_rates";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 1_000, completionTokens: 0, model: "unpublished" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("estimates at a fixed fallback");
  });

  /**
   * The cache report is a comparison between one request and the one before it,
   * so what it can say depends on both being visible. The rates come from the
   * catalog, and a model with no published prices cannot have a cost computed for
   * it — so this publishes prices for one model to exercise the arithmetic.
   */
  it("reports prompt that was sent again and billed in full", async () => {
    const home = workspace();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    writeCatalogCache([
      {
        id: "priced",
        models: [{ id: "meter", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } }],
      },
    ]);

    const session = "sess_cost_cache";
    resetSessionUsage(session);
    // Two requests of the same 100k prompt with nothing read from cache: the
    // second should have been a read, and was not.
    recordSessionUsage(session, { promptTokens: 99_999, cacheWriteTokens: 1, completionTokens: 0, model: "meter", provider: "priced" });
    recordSessionUsage(session, { promptTokens: 99_999, cacheWriteTokens: 1, completionTokens: 0, model: "meter", provider: "priced" });
    const result = await runCostCommand([], contextFor(session, workspace()));

    expect(result.output).toContain("Prompt cache hit rate: 0.0%");
    expect(result.output).toContain("Prompt cache");
    expect(result.output).toContain("100,000 prompt tokens");
    // 3.00 - 0.30 per million over 100k tokens.
    expect(result.output).toContain("$0.2700");
  });

  it("says nothing about the cache when every request reused it", async () => {
    const home = workspace();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    writeCatalogCache([
      {
        id: "priced",
        models: [{ id: "meter", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } }],
      },
    ]);

    const session = "sess_cost_nocache";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 100_000, completionTokens: 0, model: "meter", provider: "priced" });
    recordSessionUsage(session, {
      promptTokens: 100_000,
      completionTokens: 0,
      model: "meter",
      provider: "priced",
      cacheReadTokens: 100_000,
    });

    const result = await runCostCommand([], contextFor(session, workspace()));
    // The waste story stays silent — no misses, so nothing to fix — but the hit
    // rate is the session's own efficiency and is worth reporting on its own.
    // The recorded prompt is the whole one (raw input plus cache read plus
    // write premium), so 100k read against a 200k whole prompt is 50%.
    expect(result.output).toContain("Prompt cache hit rate: 50.0%");
    expect(result.output).not.toContain("prompt tokens were sent again");
  });

  it("reports a perfect hit rate rather than nothing", async () => {
    const home = workspace();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    writeCatalogCache([
      {
        id: "priced",
        models: [{ id: "meter", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } }],
      },
    ]);

    const session = "sess_cost_allhits";
    resetSessionUsage(session);
    // The whole prompt served from cache: no fresh input tokens at all. The
    // completion tokens are what keep the report out of its empty-session
    // early return — a cached-prompt turn still produced an answer.
    recordSessionUsage(session, {
      promptTokens: 0,
      completionTokens: 50,
      model: "meter",
      provider: "priced",
      cacheReadTokens: 100_000,
    });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("Prompt cache hit rate: 100.0%");
    expect(result.output).not.toContain("prompt tokens were sent again");
  });

  /**
   * The headline figure sums two different things. Tokens a model switch re-sent
   * could never have been cache reads for the new model, so the report has to say
   * so rather than leaving a reader to conclude the cache failed.
   */
  it("says a model switch could not have been a cache read, not that it should have been", async () => {
    const home = workspace();
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    writeCatalogCache([
      {
        id: "priced",
        models: [
          { id: "meter", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } },
          { id: "other", cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 } },
        ],
      },
    ]);

    const session = "sess_cost_switch";
    resetSessionUsage(session);
    recordSessionUsage(session, { promptTokens: 100_000, completionTokens: 0, model: "meter", provider: "priced" });
    recordSessionUsage(session, { promptTokens: 100_000, completionTokens: 0, model: "other", provider: "priced" });

    const result = await runCostCommand([], contextFor(session, workspace()));
    expect(result.output).toContain("Prompt cache");
    expect(result.output).toContain("could not have been cache reads at all");
    // And it is not also reported as an idle-gap failure, which is a different cause.
    expect(result.output).not.toContain("idle gap");
  });
});
