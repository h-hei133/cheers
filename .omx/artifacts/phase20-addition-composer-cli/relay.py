#!/usr/bin/env python3
"""Relay a command through a PTY when the parent stdin is not a terminal."""

import json
import copy
import time
import codecs
import pyte
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


class Screen(pyte.Screen):
    def report_device_status(self, mode, **kwargs):
        if not kwargs.get("private"): super().report_device_status(mode)

    def report_device_attributes(self, mode=0, **kwargs):
        if not kwargs.get("private"): super().report_device_attributes(mode)

    def set_mode(self, *modes, **kwargs):
        if kwargs.get("private") and 1049 in modes and getattr(self, "main", None) is None:
            self.main = {key: copy.deepcopy(getattr(self, key)) for key in ("buffer", "cursor", "margins", "mode", "savepoints")}
            self.reset()
        super().set_mode(*modes, **kwargs)

    def reset_mode(self, *modes, **kwargs):
        super().reset_mode(*modes, **kwargs)
        if kwargs.get("private") and 1049 in modes and getattr(self, "main", None) is not None:
            for key, value in self.main.items(): setattr(self, key, value)
            self.main = None
            self.ensure_hbounds(); self.ensure_vbounds()


def set_size(fd, rows=60, columns=120):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))


def relay(fd, child):
    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    stdin_open = True
    screen = Screen(120, 60)
    screen.cursor_position(int(os.environ.get("CHEERS_PROBE_INITIAL_ROW", "0")) + 1, 1)
    stream = pyte.Stream(screen)
    decoder = codecs.getincrementaldecoder("utf8")("replace")
    sequence = 0
    output_bytes = 0
    control = os.environ["CHEERS_PROBE_CONTROL"]
    def save_screen():
        with open(os.environ["CHEERS_PROBE_SCREEN"], "w") as record:
            json.dump({"columns": screen.columns, "rows": screen.lines, "cursor": {"row": screen.cursor.y, "column": screen.cursor.x},
                       "display": screen.display, "sequence": sequence, "outputBytes": output_bytes}, record)
    while True:
        try:
            with open(control) as request: size = json.load(request)
            if size["sequence"] != sequence:
                sequence = size["sequence"]
                screen.resize(lines=size["rows"], columns=size["columns"])
                screen.ensure_hbounds(); screen.ensure_vbounds()
                set_size(fd, size["rows"], size["columns"])
                os.kill(child, signal.SIGWINCH)
                save_screen()
        except (FileNotFoundError, json.JSONDecodeError): pass
        ready, _, _ = select.select([fd] + ([stdin_fd] if stdin_open else []), [], [], 0.05)
        if fd in ready:
            try:
                data = os.read(fd, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            output_bytes += len(data)
            stream.feed(decoder.decode(data))
            save_screen()
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

    for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, forward)
    return relay(fd, child)


if __name__ == "__main__":
    raise SystemExit(main())
