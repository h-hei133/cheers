/** Supported import path; source ownership is the extension registry. */
import { changeSources, readSources } from "../../../extensions/registry/sources.js";
import type { ExtensionSource } from "../../../extensions/model.js";
export type MarketplaceSource = ExtensionSource;
export const getMarketplaceSources = readSources;
export function addMarketplaceSource(source: MarketplaceSource): boolean {
  return changeSources(sources => sources.some(entry => entry.name === source.name) ? undefined : [...sources, source]);
}
export function removeMarketplaceSource(name: string): boolean {
  return changeSources(sources => sources.some(entry => entry.name === name) ? sources.filter(entry => entry.name !== name) : undefined);
}
export function resetMarketplaceSources(): void { changeSources(() => []); }
