#!/usr/bin/env python3
"""Relay a command through a PTY with a caller-chosen window size."""
import errno, fcntl, os, pty, select, signal, struct, sys, termios

def exit_code(status):
    if os.WIFEXITED(status): return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status): return 128 + os.WTERMSIG(status)
    return 1

def main():
    if len(sys.argv) < 5 or sys.argv[1] != '--':
        print('usage: relay.py -- <cols> <rows> command [args...]', file=sys.stderr); return 2
    cols, rows = int(sys.argv[2]), int(sys.argv[3])
    command = sys.argv[4:]
    child, fd = pty.fork()
    if child == 0:
        try: os.execvpe(command[0], command, os.environ)
        except OSError as error:
            print(f'relay.py: {error}', file=sys.stderr); os._exit(127)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    def forward(signum, _frame):
        try: os.kill(child, signum)
        except ProcessLookupError: pass
    for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, forward)
    stdin_fd, stdout_fd, stdin_open = sys.stdin.fileno(), sys.stdout.fileno(), True
    while True:
        ready, _, _ = select.select([fd] + ([stdin_fd] if stdin_open else []), [], [])
        if fd in ready:
            try: data = os.read(fd, 65536)
            except OSError as error:
                if error.errno == errno.EIO: break
                raise
            if not data: break
            os.write(stdout_fd, data)
        if stdin_open and stdin_fd in ready:
            data = os.read(stdin_fd, 65536)
            if not data: stdin_open = False; continue
            os.write(fd, data)
    _, status = os.waitpid(child, 0)
    return exit_code(status)

if __name__ == '__main__':
    raise SystemExit(main())
