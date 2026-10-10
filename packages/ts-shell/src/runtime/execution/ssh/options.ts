import { hostKeyAlgorithm } from './profile.js';
import type { SshSelection } from './model.js';

/** Every native option is fixed; profile and command data never become SSH options. */
export function sshArguments(selection: SshSelection, key: string, knownHosts: string): string[] {
  const options = ['BatchMode=yes', 'IdentitiesOnly=yes', 'IdentityAgent=none', 'CertificateFile=none', 'AddKeysToAgent=no',
    'PreferredAuthentications=publickey', 'PasswordAuthentication=no', 'KbdInteractiveAuthentication=no', 'GSSAPIAuthentication=no',
    'HostbasedAuthentication=no', 'PubkeyAuthentication=yes', 'StrictHostKeyChecking=yes', 'UpdateHostKeys=no',
    `HostKeyAlgorithms=${hostKeyAlgorithm(selection.hostKey)}`, `UserKnownHostsFile=${sshPath(knownHosts)}`, 'GlobalKnownHostsFile=/dev/null',
    'VerifyHostKeyDNS=no', 'CheckHostIP=no', 'ControlMaster=no', 'ControlPath=none', 'ControlPersist=no', 'ClearAllForwardings=yes',
    'ForwardAgent=no', 'ForwardX11=no', 'ProxyCommand=none', 'ProxyJump=none', 'PermitLocalCommand=no', 'LocalCommand=none',
    'RemoteCommand=none', 'RequestTTY=no', 'EscapeChar=none', 'ConnectionAttempts=1', 'ConnectTimeout=5',
    'ServerAliveInterval=2', 'ServerAliveCountMax=2', 'LogLevel=ERROR'];
  return ['-F', 'none', '-T', ...options.flatMap(option => ['-o', option]), '-i', key.replace(/%/g, '%%'), '-p', String(selection.port),
    '-l', selection.user, '--', selection.host, '/usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C /usr/bin/bash --noprofile --norc -s'];
}
export function knownHostLine(selection: SshSelection): string {
  return `${selection.port === 22 ? selection.host : `[${selection.host}]:${selection.port}`} ${selection.hostKey}\n`;
}
function sshPath(value: string): string { return '"' + value.replace(/%/g, '%%').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
