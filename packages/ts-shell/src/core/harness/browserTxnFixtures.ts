import { pwFixtures, PW_STATIC_FIXTURE } from "./pwFixtures.js";
import type { PwFixture } from "../context/pwAdapter.js";

export const PW_TXN_REPAIR_FIXTURE = "local-fixture://txn/repair";
export const PW_TXN_TARGET_MISSING_FIXTURE = "local-fixture://txn/target-missing";
export const PW_TXN_STALE_FIXTURE = "local-fixture://txn/stale";

export const browserTxnFixtures: readonly PwFixture[] = [
  ...pwFixtures,
  {
    marker: PW_TXN_REPAIR_FIXTURE,
    html: [
      "<!doctype html><html><head><title>Route 129 Repair Fixture</title></head><body>",
      "<main>",
      "<h1>Route 129 Repair Fixture</h1>",
      "<p>Selector repair fixture ready</p>",
      "<button id=\"save\" onclick=\"document.querySelector('#status').textContent='Clicked Save draft after repair'\">Save draft</button>",
      "<p id=\"status\" role=\"status\">Waiting for repair</p>",
      "</main>",
      "</body></html>",
    ].join(""),
  },
  {
    marker: PW_TXN_TARGET_MISSING_FIXTURE,
    html: [
      "<!doctype html><html><head><title>Route 129 Missing Target</title></head><body>",
      "<main>",
      "<h1>Route 129 Missing Target</h1>",
      "<p>No safe action target is available</p>",
      "<p id=\"status\" role=\"status\">Still waiting</p>",
      "</main>",
      "</body></html>",
    ].join(""),
  },
  {
    marker: PW_TXN_STALE_FIXTURE,
    html: [
      "<!doctype html><html><head><title>Route 129 Stale Fixture</title></head><body>",
      "<main>",
      "<h1>Route 129 Stale Fixture</h1>",
      "<p>Initial stale observation</p>",
      "<button id=\"save\" onclick=\"document.querySelector('#status').textContent='Clicked Save draft after re-observe'\">Save draft</button>",
      "<p id=\"status\" role=\"status\">Waiting</p>",
      "</main>",
      "</body></html>",
    ].join(""),
  },
];

export const browserTxnFixtureMarkers = {
  static: PW_STATIC_FIXTURE,
  repair: PW_TXN_REPAIR_FIXTURE,
  targetMissing: PW_TXN_TARGET_MISSING_FIXTURE,
  stale: PW_TXN_STALE_FIXTURE,
} as const;

export const pwTxnFixtures = browserTxnFixtures;
