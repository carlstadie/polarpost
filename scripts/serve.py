#!/usr/bin/env python3
"""Local preview: build the site, serve it at http://localhost:8777, and keep it
up to date while you work.

    python3 scripts/serve.py          (npm start and pixi run start call this)
    PORT=8778 python3 scripts/serve.py

Save config.toml, anything in data/ or i18n/, a cover or a file in site/assets/,
and the site is rebuilt and the open page reloads itself. Nothing is ever taken
from the browser's cache, so what you see is always what is on disk.

This is for your own computer only. GitHub Pages serves the built site/ folder
directly and never runs this file.
"""

from __future__ import annotations

import http.server
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
PORT = int(os.environ.get("PORT", "8777"))

# What a change to should trigger a rebuild, and what is only reloaded.
SOURCES = [ROOT / "config.toml", ROOT / "build.py", ROOT / "data", ROOT / "i18n", ROOT / "covers", ROOT / "refs"]
ASSETS = [SITE / "assets", SITE / "index.html"]
GENERATED = {SITE / "assets" / "css" / "tokens.css"}       # written by the build itself

version = str(time.time())          # the open page reloads whenever this changes


def files(paths):
    for p in paths:
        if p.is_file():
            yield p
        elif p.is_dir():
            yield from (f for f in p.rglob("*") if f.is_file())


def stamp(paths):
    return {f: f.stat().st_mtime for f in files(paths) if f not in GENERATED}


def build() -> bool:
    print("\n— building …", flush=True)
    done = subprocess.run([sys.executable, str(ROOT / "build.py")], cwd=ROOT)
    if done.returncode == 0:
        print(f"— ready: http://localhost:{PORT}  (save a file and the page reloads)", flush=True)
        return True
    print("— the build stopped (see above). The page keeps showing the last good build.", flush=True)
    return False


def watch():
    global version
    sources, assets = stamp(SOURCES), stamp(ASSETS)
    while True:
        time.sleep(0.7)
        now_sources, now_assets = stamp(SOURCES), stamp(ASSETS)
        if now_sources != sources:
            sources = now_sources
            if build():
                version = str(time.time())
            assets = stamp(ASSETS)                       # the build may have touched assets
        elif now_assets != assets:
            assets = now_assets
            print("— assets changed, reloading the page", flush=True)
            version = str(time.time())


# A few lines added to the page while previewing: ask every second whether
# anything changed, and reload if so.
RELOAD = b"""<script>
(() => { let seen = null;
  setInterval(async () => {
    try { const v = await (await fetch("/__version", { cache: "no-store" })).text();
          if (seen && v !== seen) location.reload(); seen = v; } catch {}
  }, 1000); })();
</script>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # never a stale copy
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].split("#")[0]
        if path == "/__version":
            return self.reply(version.encode(), "text/plain")
        if path in ("/", "/index.html"):
            page = (SITE / "index.html").read_bytes().replace(b"</body>", RELOAD + b"\n</body>")
            return self.reply(page, "text/html; charset=utf-8")
        super().do_GET()

    def reply(self, body: bytes, kind: str):
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):                       # keep the terminal for the build
        pass


def main():
    build()
    try:
        server = http.server.ThreadingHTTPServer(("", PORT), Handler)
    except OSError:
        sys.exit(f"\nPort {PORT} is already in use — probably an earlier `npm start` is still running\n"
                 f"in another window, maybe from another copy of this folder. Stop it there with\n"
                 f"Ctrl+C, or use another port:  PORT=8778 npm start")
    threading.Thread(target=watch, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
