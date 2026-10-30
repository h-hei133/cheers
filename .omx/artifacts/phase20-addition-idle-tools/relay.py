#!/usr/bin/env python3
"""Relay a command through a PTY when the parent stdin is not a terminal."""

import json
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def exit_code(status):
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


def geometry():
    with open(os.environ["CHEERS_PROBE_GEOMETRY"]) as source:
        value = json.load(source)
    return int(value["height"]), int(value["width"])


def set_size(fd):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", *geometry(), 0, 0))


def relay(fd, child):
    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    stdin_open = True
    while True:
        ready, _, _ = select.select([fd] + ([stdin_fd] if stdin_open else []), [], [])
        if fd in ready:
            try:
                data = os.read(fd, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            os.write(stdout_fd, data)
        if stdin_open and stdin_fd in ready:
            data = os.read(stdin_fd, 65536)
            if not data:
                stdin_open = False
                os.write(fd, b"\x04")
            else:
                os.write(fd, data)
    _, status = os.waitpid(child, 0)
    try:
        flags = termios.tcgetattr(fd)[3]
        required = termios.ICANON | termios.ECHO | termios.ISIG
        record = {"cookedFlagsRestored": (flags & required) == required}
    except OSError:
        record = {"cookedFlagsRestored": False, "readbackUnavailable": True}
    with open(os.environ["CHEERS_PROBE_DEVICE"], "w") as receipt:
        json.dump(record, receipt)
    os.close(fd)
    return exit_code(status)


def main():
    if len(sys.argv) < 3 or sys.argv[1] != "--":
        print("usage: relay.py -- command [args...]", file=sys.stderr)
        return 2
    command = sys.argv[2:]
    child, fd = pty.fork()
    if child == 0:
        try:
            os.execvpe(command[0], command, os.environ)
        except OSError as error:
            print(f"relay.py: {error}", file=sys.stderr)
            os._exit(127)
    set_size(fd)

    def forward(signum, _frame):
        try:
            os.kill(child, signum)
        except ProcessLookupError:
            pass

    def resize(_signum, _frame):
        set_size(fd)
        forward(signal.SIGWINCH, None)

    signal.signal(signal.SIGUSR1, resize)

    for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, forward)
    return relay(fd, child)


if __name__ == "__main__":
    raise SystemExit(main())
