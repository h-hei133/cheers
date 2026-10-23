import type { StorageIdentity } from './store/paths.js';

export interface ExtensionManifest {
  readonly schema: 1;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly permissions: { readonly workspace: 'read' | 'write'; readonly network: 'none' };
  readonly skills: readonly { readonly path: string }[];
  readonly scripts: readonly { readonly name: string; readonly path: string }[];
  readonly commands: readonly { readonly name: string; readonly aliases?: readonly string[]; readonly description: string; readonly script: string }[];
  readonly tools: readonly { readonly name: string; readonly description: string; readonly script: string }[];
}
export interface TrustAnchor {
  readonly keyId: string;
  readonly publicKey: string;
  readonly fingerprint: string;
  readonly provenance: string;
}
export interface ExtensionSource {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly isDefault?: boolean;
  readonly trust?: TrustAnchor;
}
export interface Release {
  readonly manifest: ExtensionManifest;
  readonly digest: string;
  readonly url: string;
}
export interface CatalogPage {
  readonly protocol: 'extension-registry/v1';
  readonly packages: readonly { readonly name: string; readonly description?: string; readonly versions: readonly string[] }[];
  readonly nextCursor: string | null;
}
export interface VersionRecord extends Release {
  readonly source: string;
  readonly sourceIdentity: string;
  readonly trustFingerprint: string;
  readonly files: Readonly<Record<string, string>>;
  readonly directories: readonly string[];
  readonly storage: StorageIdentity;
}
export interface Activation { readonly enabled: boolean; readonly grants: readonly string[]; readonly workspaceIdentity: string }
export interface PackageRecord {
  readonly name: string;
  readonly active: VersionRecord;
  readonly history: readonly VersionRecord[];
  readonly activation: Readonly<Record<string, Activation>>;
}
export interface ExtensionState {
  readonly schema: 1;
  readonly revision: number;
  readonly packages: readonly PackageRecord[];
  readonly imports: readonly { readonly name: string; readonly spec: string; readonly version: string; readonly status: 'unresolved' }[];
}
export interface EffectOutcome { readonly effect: 'published' | 'removed' | 'saved' | 'executed'; readonly durability: 'confirmed' | 'unknown'; readonly detail: string }
