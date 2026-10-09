import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "name", kind: "text", required: true } as const;
export const marketplaceSyntax: CommandSyntax = {
  name: "marketplace", defaultAction: "list", flags: [],
  actions: [
    { name: "list", aliases: ["ls"], summary: "list saved source addresses" },
    { name: "add", summary: "save a source address; no catalogue is fetched", parameters: [target, { name: "url", kind: "text", required: true }] },
    { name: "remove", aliases: ["rm", "delete"], summary: "remove a saved source address", parameters: [target] },
    { name: 'trust', summary: 'review an independent Ed25519 public key', parameters: [target, { name: 'keyId', kind: 'text', required: true }, { name: 'public-key-file', kind: 'text', required: true }] },
    { name: 'search', summary: 'query one signed source page', parameters: [{ name: 'source', kind: 'text', required: true }, { name: 'query', kind: 'text', required: true }, { name: 'cursor', kind: 'text' }] },
    { name: 'details', summary: 'read exact signed package versions', parameters: [{ name: 'source', kind: 'text', required: true }, { name: 'package', kind: 'text', required: true }] },
  ],
};
