#!/usr/bin/env python3
"""Post-process AI tafsir files for consistency."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AI_DIR = ROOT / "docs" / "data" / "ai_tafsir"
MAX_CHARS = 900


def _truncate(text: str, max_chars: int = MAX_CHARS) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    for sep in (". ", "! ", "? ", "\n\n"):
        idx = cut.rfind(sep)
        if idx > max_chars // 2:
            return cut[: idx + len(sep.rstrip())].rstrip() + ""
    return cut.rstrip() + ""

REPLACEMENTS = (
    (re.compile(r"\bGod\b(?!-conscious)"), "Allah"),
    (re.compile(r"\bgod\b(?!-conscious)"), "Allah"),
    (re.compile(r"\bdisbelievers?\b", re.I), "those who reject the truth"),
    (re.compile(r"\bMost Merciful\b", re.I), "ar-Rahim"),
    (re.compile(r"\bMost Gracious\b", re.I), "ar-Rahman"),
    (re.compile(r"\s+\.\s+\."), "."),
    (re.compile(r"\n{3,}"), "\n\n"),
)


def fix_text(text: str) -> str:
    for pat, repl in REPLACEMENTS:
        text = pat.sub(repl, text)
    return _truncate(text.strip())


def main() -> int:
    fixed = 0
    for path in sorted(AI_DIR.glob("surah_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for key, text in data.get("ayahs", {}).items():
            new = fix_text(text)
            if new != text:
                data["ayahs"][key] = new
                changed = True
                fixed += 1
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Fixed {fixed} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
