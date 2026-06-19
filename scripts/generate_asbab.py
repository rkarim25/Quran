#!/usr/bin/env python3
"""
Generate docs/data/asbab_nuzul.json from Ibn Kathir tafsir (CDN).

Sources (no auth required):
  Ibn Kathir tafsir: cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/en-tafisr-ibn-kathir/{surah}.json
  Surah metadata:    docs/data/index.json  (local, already in repo)
  Revelation order:  docs/data/timeline.json (local, already in repo)

Optional high-quality extraction:
  pip install anthropic
  set ANTHROPIC_API_KEY=sk-...
  python scripts/generate_asbab.py --use-claude

Usage:
  python scripts/generate_asbab.py            # all 114 surahs (regex extraction)
  python scripts/generate_asbab.py --surah 2  # single surah only
  python scripts/generate_asbab.py --use-claude  # Claude API for cleaner output
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "docs" / "data" / "index.json"
TIMELINE = ROOT / "docs" / "data" / "timeline.json"
OUT = ROOT / "docs" / "data" / "asbab_nuzul.json"

CDN = "https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir"
IBN_KATHIR_SLUG = "en-tafisr-ibn-kathir"
USER_AGENT = "QuranProject/1.0"

REVELATION_RE = re.compile(
    r"(?:reason for (?:the )?revelation|"
    r"this (?:ayah|verse|surah|passage) was revealed|"
    r"(?:ayah|verse|surah) (?:was|were) revealed|"
    r"was revealed (?:when|after|about|concerning|regarding|in|upon|to)|"
    r"revealed (?:when|after|about|concerning|regarding|in|upon|to|following)|"
    r"occasion of revelation|"
    r"following (?:incident|event|story)|"
    r"afterwards,? this (?:ayah|verse) was revealed|"
    r"period of revelation|"
    r"beginning of revelation|"
    r"circumstances (?:in|of|surrounding) which|"
    r"sent down (?:when|after|in response|because|following))",
    re.IGNORECASE,
)

# Period context — deterministic, derived from surah metadata
PERIOD_CONTEXT: dict[tuple[str, str], str] = {
    ("makkah", "early"): (
        "Revealed in the earliest years of the Prophetic mission in Makkah (~610–612 CE), "
        "when the community of believers was small and largely from among the weak and marginalized. "
        "The Quraysh had begun to mock and ostracize the Muslims, but open persecution had not yet begun."
    ),
    ("makkah", "mid"): (
        "Revealed during the middle Makkan period (~613–617 CE), as the message spread publicly "
        "and persecution intensified. Weaker companions were tortured, the economic boycott of Banu "
        "Hashim was imposed, and the Prophet's wife Khadijah and uncle Abu Talib passed away in the Year of Grief."
    ),
    ("makkah", "late"): (
        "Revealed during the final chapter of the Makkan struggle (~618–622 CE), as the Prophet "
        "prepared for migration (Hijra) to Madinah. The Night Journey and Ascension (Isra and Mi'raj) "
        "occurred in this period, and small delegations from Madinah began accepting Islam at Aqabah."
    ),
    ("madinah", "early"): (
        "Revealed in Madinah during the early Medinan period (1–3 AH / 622–624 CE), when the Muslim "
        "community was being established for the first time as a political and social entity. The Prophet "
        "drafted the Constitution of Madinah, the direction of prayer (qibla) was changed to Makkah, "
        "and the Battle of Badr — the first major military engagement — took place."
    ),
    ("madinah", "mid"): (
        "Revealed in Madinah during the middle Medinan period (3–7 AH / 625–628 CE), as the Muslim "
        "community faced the Battles of Uhud and al-Khandaq (Trench), dealt with hypocrites within its "
        "ranks, and consolidated its social and legal institutions. The Treaty of Hudaybiyyah was concluded "
        "near the end of this period."
    ),
    ("madinah", "late"): (
        "Revealed in Madinah during the mature Medinan period (7–10 AH / 628–632 CE), as the Muslim "
        "state grew in strength. The conquest of Makkah (8 AH), the campaigns to the north, and the "
        "Farewell Pilgrimage (10 AH) all occurred in this period. The Quran was approaching completion."
    ),
}


def fetch_json(url: str, retries: int = 4) -> Any:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception as exc:
            if attempt == retries - 1:
                raise RuntimeError(f"Failed {url}: {exc}") from exc
            time.sleep(1.5 * (attempt + 1))
    return None


def index_by_ayah(entries: Any) -> dict[int, str]:
    if not isinstance(entries, list):
        return {}
    result: dict[int, str] = {}
    for e in entries:
        ayah = e.get("ayah") or e.get("verse_number") or e.get("id")
        text = e.get("text", "")
        if ayah and text:
            cleaned = re.sub(r"<[^>]+>", " ", text)
            cleaned = re.sub(r"\s+", " ", cleaned).strip()
            result[int(ayah)] = cleaned
    return result


def is_arabic_heavy(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    return sum(1 for c in letters if "؀" <= c <= "ۿ") / len(letters) > 0.4


def paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n|\n(?=[A-Z])", text) if p.strip()]


def truncate_at_sentence(text: str, max_chars: int = 650) -> str:
    if len(text) <= max_chars:
        return text.strip()
    cut = text[:max_chars]
    for sep in (". ", "! ", "? "):
        idx = cut.rfind(sep)
        if idx > max_chars // 2:
            return cut[: idx + 1].rstrip()
    return cut.rstrip() + "…"


def extract_occasion(tafsir_text: str) -> str | None:
    found: list[str] = []
    for para in paragraphs(tafsir_text):
        if is_arabic_heavy(para):
            continue
        cleaned = re.sub(r"\s+", " ", para).strip()
        if len(cleaned) < 60:
            continue
        if REVELATION_RE.search(cleaned):
            found.append(cleaned)
            if len(found) >= 2:
                break
    if not found:
        return None
    return truncate_at_sentence(" ".join(found))


def period_key_and_label(revelation_place: str, revelation_order: int) -> tuple[str, str, str]:
    """Return (context_key, place_display, setting_label)."""
    if revelation_place.lower() == "madinah":
        place = "Madinah"
        ah = max(1, min(10, round(1 + (revelation_order - 87) * 9 / 27)))
        year_ce = 621 + ah
        tier = "early" if ah <= 3 else ("mid" if ah <= 7 else "late")
        key = ("madinah", tier)
        label = f"{ah} AH · {year_ce} CE · Madinah"
    else:
        place = "Makkah"
        if revelation_order <= 20:
            tier, year_ce = "early", 609 + max(1, round(revelation_order * 3 / 20))
        elif revelation_order <= 60:
            tier, year_ce = "mid", 612 + round((revelation_order - 20) * 6 / 40)
        else:
            tier, year_ce = "late", 618 + round((revelation_order - 60) * 4 / 26)
        key = ("makkah", tier)
        label = f"{tier.title()} Makkah · ~{year_ce} CE"
    return key, place, label


# ---------- optional Claude extraction ----------

def claude_extract_occasions(
    surah: int,
    surah_name: str,
    ayah_texts: dict[int, str],
    client: Any,
) -> dict[int, str | None]:
    if not ayah_texts:
        return {}

    blocks = "\n\n".join(
        f"--- Ayah {a} ---\n{t[:2500]}" for a, t in sorted(ayah_texts.items())
    )
    prompt = (
        f"Extract the Occasion of Revelation (Asbab al-Nuzul) from Ibn Kathir's Tafsir below.\n"
        f"Surah {surah} ({surah_name}) — source: Ibn Kathir, Tafsir al-Quran al-Adhim.\n\n"
        "Rules:\n"
        "1. Extract ONLY existing text — no invention, no paraphrase\n"
        "2. Include: who asked/did what, and how the verse was revealed in response\n"
        "3. Max 3 sentences per ayah\n"
        "4. If no specific occasion documented, return null for that ayah\n\n"
        f"{blocks}\n\n"
        'Return ONLY JSON: [{"ayah": N, "occasion": "text or null"}]'
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        raw = json.loads(msg.content[0].text)
        return {int(e["ayah"]): e.get("occasion") for e in raw}
    except Exception:
        return {}


# ---------- main ----------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--surah", type=int, help="Process one surah only")
    parser.add_argument("--use-claude", action="store_true", help="Use Claude API for cleaner extraction (requires ANTHROPIC_API_KEY)")
    parser.add_argument("--force", action="store_true", help="Re-process even if entry already exists")
    args = parser.parse_args()

    # Load local metadata
    index_data = json.loads(INDEX.read_text(encoding="utf-8"))
    surahs_meta = {s["id"]: s for s in index_data["surahs"]}

    timeline_data = json.loads(TIMELINE.read_text(encoding="utf-8"))
    rev_order_by_surah = {int(k): int(v) for k, v in timeline_data["surah_revelation_order"].items()}

    # Load existing output (resume-safe)
    out: dict[str, Any] = {}
    if OUT.exists():
        out = json.loads(OUT.read_text(encoding="utf-8"))

    # Claude client (optional)
    claude_client = None
    if args.use_claude:
        try:
            import anthropic
            claude_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
            print("Claude API enabled for extraction.")
        except ImportError:
            print("anthropic package not found. Run: pip install anthropic", file=sys.stderr)
            return 1

    surah_range = [args.surah] if args.surah else range(1, 115)
    total_occasions = 0

    for surah in surah_range:
        surah_meta = surahs_meta[surah]
        rev_order = rev_order_by_surah.get(surah, 50)
        context_key, place_display, setting_label = period_key_and_label(
            surah_meta["revelation_place"], rev_order
        )
        setting_context = PERIOD_CONTEXT.get(context_key, "")

        # Build / update surah-level setting entry
        surah_setting_key = f"__setting_{surah}"
        out[surah_setting_key] = {"label": setting_label, "context": setting_context}

        # Skip ayah processing if already done (unless --force)
        existing_keys = {k for k in out if k.startswith(f"{surah}:") and not k.startswith(f"{surah}:__")}
        if existing_keys and not args.force:
            print(f"Surah {surah:3d} — {len(existing_keys):3d} existing entries (skip; use --force to redo)")
            total_occasions += len(existing_keys)
            continue

        print(f"Surah {surah:3d} — fetching Ibn Kathir…", end=" ", flush=True)
        try:
            entries = fetch_json(f"{CDN}/{IBN_KATHIR_SLUG}/{surah}.json")
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            continue

        ibn = index_by_ayah(entries)
        if not ibn:
            print("no data")
            continue

        # Pre-screen with regex
        detected: dict[int, str] = {
            ayah: text for ayah, text in ibn.items() if REVELATION_RE.search(text)
        }

        if claude_client and detected:
            # High-quality extraction via Claude
            extracted = claude_extract_occasions(surah, surah_meta["name_simple"], detected, claude_client)
            occasion_by_ayah = {a: t for a, t in extracted.items() if t}
        else:
            # Regex extraction (faithful to source, no API needed)
            occasion_by_ayah = {}
            for ayah, text in detected.items():
                occ = extract_occasion(text)
                if occ:
                    occasion_by_ayah[ayah] = occ

        # Write occasion entries
        for ayah, occasion in occasion_by_ayah.items():
            out[f"{surah}:{ayah}"] = {
                "occasion": occasion,
                "source": "Ibn Kathir, Tafsir al-Quran al-Adhim",
                "has_occasion": True,
            }

        print(f"{len(detected):3d} detected -> {len(occasion_by_ayah):3d} occasions extracted")
        total_occasions += len(occasion_by_ayah)

        # Save after each surah (resume-safe)
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        time.sleep(0.25)  # polite CDN usage

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. {total_occasions} total occasion entries → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
