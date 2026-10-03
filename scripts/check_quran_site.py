#!/usr/bin/env python3
"""
check_quran_site.py — Python-native health, data & notes diagnostic tool for rkarim25.github.io/Quran.
Can be invoked by any AI system or CI workflow.
"""

import os
import sys
import json
import urllib.request
import urllib.error
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def report(status, title, details=""):
    mark = "[PASS]" if status == "PASS" else ("[WARN]" if status == "WARN" else "[FAIL]")
    msg = f"  {mark}  {title}"
    if details:
        msg += f" — {details}"
    print(msg)


def check_url(url, timeout=5):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 QuranHealthCheck/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status == 200, res.status
    except urllib.error.HTTPError as e:
        return False, e.code
    except Exception as e:
        return False, 0


def main():
    print("\n" + "=" * 64)
    print("      QURAN SITE PYTHON HEALTH & AUDIT DIAGNOSTIC TOOL")
    print("=" * 64 + "\n")

    # 1. Code Invariants
    print("1. Code & Frontend Invariants")
    idx_path = os.path.join(DOCS, "index.html")
    if os.path.exists(idx_path):
        with open(idx_path, "r", encoding="utf-8") as f:
            cnt = f.read().count("__BUILD_ID__")
        if cnt == 2:
            report("PASS", "index.html holds exactly 2 __BUILD_ID__ placeholders")
        else:
            report("FAIL", "index.html __BUILD_ID__ count", f"Expected 2, found {cnt}")

    sw_path = os.path.join(DOCS, "sw.js")
    if os.path.exists(sw_path):
        with open(sw_path, "r", encoding="utf-8") as f:
            sw_txt = f.read()
        hosts = ["everyayah.com", "verses.quran.com", "audio.qurancdn.com", "cdn.islamic.network"]
        missing = [h for h in hosts if h not in sw_txt]
        if not missing:
            report("PASS", "sw.js: all streaming audio CDNs in NETWORK_ONLY_HOSTS")
        else:
            report("FAIL", "sw.js: missing audio CDNs", ", ".join(missing))

    # 2. Audio CDNs
    print("\n2. Audio CDN Recitation Health")
    endpoints = [
        ("Mishary Alafasy Arabic (Primary)", "https://everyayah.com/data/Alafasy_128kbps/001001.mp3"),
        ("Ibrahim Walk English (Primary 192kbps)", "https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/001001.mp3"),
        ("Ibrahim Walk English (Fallback CDN)", "https://cdn.islamic.network/quran/audio/192/en.walk/1.mp3"),
    ]
    for label, url in endpoints:
        ok, code = check_url(url)
        if ok:
            report("PASS", f"{label} [HTTP {code}]")
        else:
            report("WARN", f"{label} [HTTP {code}]")

    # 3. Translation & Data
    print("\n3. Quran Data & Tafsir Coverage")
    try:
        res = subprocess.run([sys.executable, "scripts/validate_ai_translations.py"], cwd=ROOT, capture_output=True, text=True)
        if "6236 / 6236" in res.stdout:
            report("PASS", "Translation coverage: 6,236 / 6,236 verses complete")
        else:
            report("WARN", "Translation validator output", res.stdout.strip())
    except Exception as e:
        report("WARN", "Could not run validate_ai_translations.py", str(e))

    # 4. Notes check
    print("\n4. User AI Notes Check")
    notes_file = os.path.join(DOCS, "sync", "user-data.json")
    if os.path.exists(notes_file):
        try:
            with open(notes_file, "r", encoding="utf-8") as f:
                d = json.load(f)
            tadabbur = d.get("tadabburNotes", [])
            ai_notes = [n for n in tadabbur if n.get("forAi") or n.get("target") == "ai" or "ai" in n.get("tags", [])]
            if ai_notes:
                report("PASS", f"Found {len(ai_notes)} user notes addressed to AI in sync bundle")
            else:
                print("  ℹ INFO  No pending AI notes in sync bundle.")
        except Exception as e:
            report("WARN", "Parsing user-data.json", str(e))
    else:
        print("  ℹ INFO  No local sync bundle found.")

    print("\n" + "=" * 64)
    print("Audit Complete.")
    print("=" * 64 + "\n")


if __name__ == "__main__":
    main()
