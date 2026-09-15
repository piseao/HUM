"""Start/stop local-only development servers with logs and tracked PIDs."""
import argparse
import json
import os
import signal
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".run"


def port_free(port):
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "stop", "status"])
    args = parser.parse_args()
    STATE.mkdir(exist_ok=True)
    state_file = STATE / "servers.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    if args.action == "status":
        print(json.dumps(state, indent=2))
        return
    if args.action == "stop":
        for name, details in state.items():
            try:
                command = subprocess.check_output(["ps", "-p", str(details["pid"]), "-o", "command="], text=True)
                if "uvicorn" in command or "npm" in command:
                    os.killpg(details["pid"], signal.SIGTERM)
                    print(f"Stopped {name}")
            except (ProcessLookupError, subprocess.CalledProcessError):
                pass
        state_file.unlink(missing_ok=True)
        return
    backend_port = next(port for port in range(8000, 8010) if port_free(port))
    frontend_port = next(port for port in range(3000, 3010) if port_free(port))
    env = dict(os.environ, BACKEND_URL=f"http://127.0.0.1:{backend_port}", HUM_ALLOWED_ORIGINS=f"http://localhost:{frontend_port},http://127.0.0.1:{frontend_port}")
    commands = {
        "backend": ([str(ROOT / "backend/.venv/bin/python"), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)], ROOT / "backend", backend_port),
        "frontend": (["npm", "run", "dev", "--", "--port", str(frontend_port)], ROOT / "frontend", frontend_port),
    }
    if state:
        print("Existing server state found. Run status or stop before starting again.")
        sys.exit(1)
    for name, (command, cwd, port) in commands.items():
        with (STATE / f"{name}.log").open("ab") as log:
            process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        state[name] = {"pid": process.pid, "port": port, "url": f"http://localhost:{port}"}
        state_file.write_text(json.dumps(state, indent=2))
    print(json.dumps(state, indent=2))


if __name__ == "__main__":
    main()
