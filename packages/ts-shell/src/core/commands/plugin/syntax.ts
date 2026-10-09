import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "name", kind: "text", required: true } as const;
export const pluginSyntax: CommandSyntax = {
  name: "plugin", defaultAction: "list", flags: [],
  actions: [
    { name: "list", aliases: ["ls"], summary: "list extension registrations" },
    { name: "add", summary: "legacy registration import; grants no runtime authority", parameters: [{ name: "path-or-package", kind: "text", required: true }] },
    { name: 'install', summary: 'review and install an exact signed release', parameters: [{ name: 'source:name@version', kind: 'text', required: true }] },
    { name: "remove", aliases: ["rm", "uninstall"], summary: "remove a registration", parameters: [target] },
    { name: "enable", summary: "mark a registration enabled", parameters: [target] },
    { name: "disable", summary: "mark a registration disabled", parameters: [target] },
    { name: "search", aliases: ["find"], summary: "explain catalogue availability", parameters: [{ name: "query", kind: "text", rest: true }] },
    { name: 'details', summary: 'inspect installed manifest and provenance', parameters: [target] },
    { name: 'update', summary: 'review another exact release; clears grants', parameters: [target, { name: 'source:name@version', kind: 'text', required: true }] },
    { name: 'rollback', summary: 'review a retained exact version; clears grants', parameters: [target, { name: 'version', kind: 'text', required: true }] },
    { name: 'grant', summary: 'review one separate capability grant', parameters: [target, { name: 'capability', kind: 'text', required: true }] },
    { name: 'revoke', summary: 'revoke one capability grant', parameters: [target, { name: 'capability', kind: 'text', required: true }] },
    { name: 'run', summary: 'approve and run a granted isolated script', parameters: [target, { name: 'script', kind: 'text', required: true }, { name: 'args', kind: 'text', rest: true }] },
    { name: 'reload', summary: 'unload and rebuild reviewed capabilities' },
    { name: 'cancel', summary: 'cancel and drain live extension calls' },
    { name: 'migrate', summary: 'import legacy registrations explicitly as unresolved' },
  ],
};
