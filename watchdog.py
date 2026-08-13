"""
Process watchdog for the Next.js dev server.
Runs as a daemon, spawns next-server as a subprocess, and restarts it
if it dies. Stays alive between bash commands (unlike bash watchdogs).
"""
import os
import signal
import subprocess
import sys
import time

NEXT_BIN = "/home/z/my-project/node_modules/.bin/next"
PROJECT_DIR = "/home/z/my-project"
PORT = "3000"
DEV_LOG = "/home/z/my-project/dev.log"
PID_FILE = "/home/z/my-project/dev-server.pid"


def is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def main() -> None:
    # detach from controlling terminal
    try:
        pid = os.fork()
        if pid > 0:
            os._exit(0)
    except OSError:
        pass

    os.setsid()
    # second fork to fully daemonize
    try:
        pid = os.fork()
        if pid > 0:
            os._exit(0)
    except OSError:
        pass

    os.chdir("/")
    os.umask(0)

    # redirect stdio
    sys.stdout.flush()
    sys.stderr.flush()
    with open("/dev/null", "rb") as f:
        os.dup2(f.fileno(), 0)
    log_fd = os.open(DEV_LOG, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)

    # write our own pid
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    env = os.environ.copy()
    env["NODE_OPTIONS"] = "--max-old-space-size=384"

    while True:
        print(f"[watchdog {time.strftime('%H:%M:%S')}] starting next dev...", flush=True)
        proc = subprocess.Popen(
            [NEXT_BIN, "dev", "-p", PORT],
            cwd=PROJECT_DIR,
            env=env,
            stdout=None,
            stderr=None,
            stdin=subprocess.DEVNULL,
        )
        print(f"[watchdog] next dev pid={proc.pid}", flush=True)

        # wait for it to exit
        rc = proc.wait()
        print(f"[watchdog] next dev exited (rc={rc}), restarting in 3s...", flush=True)
        time.sleep(3)


if __name__ == "__main__":
    # kill any existing watchdog
    try:
        with open(PID_FILE) as f:
            old_pid = int(f.read().strip())
        if is_running(old_pid):
            os.kill(old_pid, signal.SIGTERM)
            time.sleep(1)
    except (FileNotFoundError, ValueError, OSError):
        pass

    # also kill any existing next-server
    subprocess.run(["pkill", "-f", "next dev -p 3000"], capture_output=True)
    subprocess.run(["pkill", "-f", "next-server"], capture_output=True)
    time.sleep(2)

    main()
