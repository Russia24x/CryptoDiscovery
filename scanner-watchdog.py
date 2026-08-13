#!/usr/bin/env python3
"""
Process watchdog for the crypto-scanner FastAPI service (port 3003).
Spawns uvicorn as a subprocess and restarts it if it dies.
Stays alive between bash commands (unlike bash watchdogs).
"""
import os
import signal
import subprocess
import sys
import time

PYTHON = "/home/z/.venv/bin/python"
APP_DIR = "/home/z/my-project/mini-services/crypto-scanner"
PORT = "3003"
LOG = "/home/z/my-project/scanner.log"
PID_FILE = "/home/z/my-project/scanner.pid"


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
    try:
        pid = os.fork()
        if pid > 0:
            os._exit(0)
    except OSError:
        pass

    # write our own pid
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    # kill any existing uvicorn
    subprocess.run(["pkill", "-f", "uvicorn main:app"], capture_output=True)
    time.sleep(1)

    while True:
        log_fp = open(LOG, "a")
        proc = subprocess.Popen(
            [
                PYTHON, "-m", "uvicorn", "main:app",
                "--host", "0.0.0.0",
                "--port", PORT,
                "--app-dir", APP_DIR,
                "--log-level", "info",
            ],
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            cwd=APP_DIR,
        )
        log_fp.write(f"[watchdog] scanner started pid={proc.pid}\n")
        log_fp.flush()
        rc = proc.wait()
        log_fp.write(f"[watchdog] scanner exited (code {rc}), restarting in 3s...\n")
        log_fp.flush()
        log_fp.close()
        time.sleep(3)


if __name__ == "__main__":
    main()
