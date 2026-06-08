#!/usr/bin/env python3
"""Local dev server: serves the site and syncs edits back to markdown files."""

from __future__ import annotations

import json
import mimetypes
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_site import load_ai_tafsir, load_ai_translations
from md_io import ayah_path, read_ayah, to_json_ayah, write_ayah


def enrich_ayah(row: dict, surah: int) -> dict:
    if not row.get("ai_translation", "").strip():
        ai_map = load_ai_translations(surah)
        if row["ayah"] in ai_map:
            row["ai_translation"] = ai_map[row["ayah"]]
    if not row.get("ai_tafsir", "").strip():
        tafsir_map = load_ai_tafsir(surah)
        if row["ayah"] in tafsir_map:
            row["ai_tafsir"] = tafsir_map[row["ayah"]]
    return row

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
PORT = 8080


def rebuild_surah(surah: int) -> None:
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "build_site.py"), "--surah", str(surah)],
        check=True,
        cwd=str(ROOT),
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        api = re.match(r"^/api/ayah/(\d+)/(\d+)$", parsed.path)
        if parsed.path == "/api/health":
            self._json(200, {"sync": True, "source": "local"})
            return
        if api:
            surah, ayah = int(api.group(1)), int(api.group(2))
            path = ayah_path(surah, ayah)
            if not path.exists():
                self._json(404, {"error": "not found"})
                return
            self._json(200, enrich_ayah(to_json_ayah(read_ayah(path)), surah))
            return
        self._serve_static(parsed.path)

    def do_PUT(self) -> None:
        api = re.match(r"^/api/ayah/(\d+)/(\d+)$", urlparse(self.path).path)
        if not api:
            self._json(404, {"error": "not found"})
            return
        surah, ayah = int(api.group(1)), int(api.group(2))
        length = int(self.headers.get("Content-Length", 0))
        payload = json.loads(self.rfile.read(length).decode("utf-8"))

        path = ayah_path(surah, ayah)
        existing = read_ayah(path) if path.exists() else {"surah": surah, "ayah": ayah}

        for key in (
            "arabic", "translation", "word_by_word", "context",
            "tafsir_summary", "tafsir_ibn_kathir", "maarif_ul_quran",
            "ai_translation", "ai_tafsir", "personal_reflections",
        ):
            if key in payload:
                existing[key] = payload[key]

        write_ayah(path, existing)
        rebuild_surah(surah)
        self._json(200, {"ok": True, "ayah": enrich_ayah(to_json_ayah(existing), surah)})

    def _json(self, code: int, data: object) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, path: str) -> None:
        if path in ("/", ""):
            path = "/index.html"
        file_path = (DOCS / unquote(path.lstrip("/"))).resolve()
        if not str(file_path).startswith(str(DOCS.resolve())) or not file_path.is_file():
            self.send_error(404)
            return
        content = file_path.read_bytes()
        ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def main() -> None:
    if not DOCS.exists():
        print("Run build_site.py first.", file=sys.stderr)
        sys.exit(1)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Quran sync server: http://127.0.0.1:{PORT}")
    print("Edits save to Quran-obs/*.md and rebuild site data automatically.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
