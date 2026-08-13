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
ENV_FILE = os.path.join(APP_DIR, ".env")


def load_env_file(path: str) -> dict[str, str]:
    """Parse a .env file into a dict. Returns empty dict if file is missing."""
    env = {}
    if not os.path.exists(path):
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip("'\"")
                if key:
                    env[key] = val
    return env


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

    # Load .env file (CMC_API_KEY, CRYPTOPANIC_TOKEN, etc.) so the scanner
    # process has access to optional API keys without needing start.sh.
    env_overrides = load_env_file(ENV_FILE)
    child_env = os.environ.copy()
    child_env.update(env_overrides)

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
            env=child_env,
        )
        log_fp.write(f"[watchdog] scanner started pid={proc.pid} (env keys: {', '.join(env_overrides.keys()) or 'none'})\n")
        log_fp.flush()
        rc = proc.wait()
        log_fp.write(f"[watchdog] scanner exited (code {rc}), restarting in 3s...\n")
        log_fp.flush()
        log_fp.close()
        time.sleep(3)


if __name__ == "__main__":
    main()
