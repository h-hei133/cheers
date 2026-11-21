import { hostKeyAlgorithm } from './profile.js';
import type { SshSelection } from './model.js';

const remoteShell = '/usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C /usr/bin/bash --noprofile --norc -s';

/** Every native option is fixed; profile and command data never become SSH options. */
export function sshArguments(selection: SshSelection, mode: 'master' | 'channel'): string[] {
  // OpenSSH tries a new connection when the mux request fails. A failing local
  // proxy command keeps a channel incapable of opening its own network socket.
  const master = mode === 'master';
  const options = ['BatchMode=yes', 'IdentitiesOnly=yes', 'IdentityAgent=none', 'CertificateFile=none', 'AddKeysToAgent=no',
    'PreferredAuthentications=publickey', 'PasswordAuthentication=no', 'KbdInteractiveAuthentication=no', 'GSSAPIAuthentication=no',
    'HostbasedAuthentication=no', 'PubkeyAuthentication=yes', 'StrictHostKeyChecking=yes', 'UpdateHostKeys=no',
    `HostKeyAlgorithms=${hostKeyAlgorithm(selection.hostKey)}`, 'UserKnownHostsFile=./known_hosts', 'GlobalKnownHostsFile=/dev/null',
    'VerifyHostKeyDNS=no', 'CheckHostIP=no', `ControlMaster=${master ? 'yes' : 'no'}`, 'ControlPersist=no', 'ClearAllForwardings=yes',
    'ForwardAgent=no', 'ForwardX11=no', `ProxyCommand=${master ? 'none' : '/bin/false'}`, 'ProxyJump=none', 'PermitLocalCommand=no', 'LocalCommand=none',
    'RemoteCommand=none', 'RequestTTY=no', 'EscapeChar=none', 'ConnectionAttempts=1', 'ConnectTimeout=5',
    'ServerAliveInterval=2', 'ServerAliveCountMax=2', 'LogLevel=ERROR'];
  // A private cwd allows a short relative socket path even for deeply nested sessions.
  return ['-F', 'none', '-T', '-S', './socket', ...options.flatMap(option => ['-o', option]),
    ...(master ? ['-N', '-i', './identity'] : []), '-p', String(selection.port), '-l', selection.user, '--', selection.host,
    ...(!master ? [remoteShell] : [])];
}
export function knownHostLine(selection: SshSelection): string {
  return `${selection.port === 22 ? selection.host : `[${selection.host}]:${selection.port}`} ${selection.hostKey}\n`;
}
