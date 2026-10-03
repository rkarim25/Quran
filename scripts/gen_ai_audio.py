#!/usr/bin/env python3
"""
Pre-generate high-fidelity neural audio MP3s for Quran AI Translations using Microsoft Edge Neural TTS.
Produces identical studio-quality narration across all devices (eliminating robotic browser speech synthesis).

Usage:
  python scripts/gen_ai_audio.py --surah 1
  python scripts/gen_ai_audio.py --surahs 1,67,108-114
  python scripts/gen_ai_audio.py --all
"""

import argparse
import asyncio
import json
import os
import re
import sys

try:
    import edge_tts
except ImportError:
    sys.exit("Please run: pip install edge_tts")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "docs", "data")
OUT_DIR = os.path.join(ROOT, "docs", "audio", "en_ai")

VOICE = "en-GB-RyanNeural"  # Dignified, calm British neural narrator

def clean_for_speech(text):
    if not text:
        return ""
    s = str(text)
    # Strip HTML and markdown
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"[*_`]", "", s)
    # Honorifics
    s = s.replace("ﷺ", ", peace be upon him, ")
    s = s.replace("ﷻ", ", the Exalted, ")
    # Replace dashes/colons with pauses
    s = re.sub(r"[—–]", ", ", s)
    s = s.replace("--", ", ")
    s = re.sub(r":\s+", ", ", s)
    # Remove bracketed references
    s = re.sub(r"\[\d+\]", " ", s)
    s = re.sub(r"\(\d+:\d+\)", " ", s)
    # Transliteration vowel clean
    s = s.replace("ā", "a").replace("ī", "ee").replace("ū", "oo")
    s = s.replace("ḥ", "h").replace("ṣ", "s").replace("ḍ", "d").replace("ṭ", "t").replace("ẓ", "z")
    s = re.sub(r"[ʿʾ`']", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

async def generate_ayah(surah_num, ayah_num, text, sem):
    out_file = os.path.join(OUT_DIR, f"{surah_num:03d}_{ayah_num:03d}.mp3")
    if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        return  # already generated

    cleaned = clean_for_speech(text)
    if not cleaned:
        return

    async with sem:
        try:
            comm = edge_tts.Communicate(cleaned, VOICE, rate="-2%")
            await comm.save(out_file)
            print(f"  [OK] {surah_num}:{ayah_num} ({len(cleaned)} chars) -> {os.path.basename(out_file)}")
        except Exception as e:
            print(f"  [ERR] {surah_num}:{ayah_num}: {e}")

async def process_surah(surah_num, sem):
    json_path = os.path.join(DATA_DIR, f"surah_{surah_num}.json")
    if not os.path.exists(json_path):
        print(f"Surah file not found: {json_path}")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    ayahs = data.get("ayahs", [])
    print(f"Processing Surah {surah_num} ({len(ayahs)} verses)...")
    tasks = []
    for a in ayahs:
        text = a.get("ai_translation") or a.get("translation", "")
        tasks.append(generate_ayah(surah_num, a["ayah"], text, sem))
    await asyncio.gather(*tasks)

def parse_surah_list(s):
    surahs = []
    for part in s.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-")
            surahs.extend(range(int(start), int(end) + 1))
        elif part:
            surahs.append(int(part))
    return sorted(list(set(surahs)))

async def main():
    parser = argparse.ArgumentParser(description="Generate neural audio for Quran AI translations")
    parser.add_argument("--surah", type=int, help="Single surah number")
    parser.add_argument("--surahs", type=str, help="Comma-separated surahs or ranges, e.g. 1,67,108-114")
    parser.add_argument("--all", action="store_true", help="Generate for all 114 surahs")
    parser.add_argument("--concurrency", type=int, default=5, help="Concurrent generation workers")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    sem = asyncio.Semaphore(args.concurrency)

    if args.surah:
        surah_list = [args.surah]
    elif args.surahs:
        surah_list = parse_surah_list(args.surahs)
    elif args.all:
        surah_list = list(range(1, 115))
    else:
        # Default: frequently recited surahs
        surah_list = [1, 67, 108, 109, 110, 111, 112, 113, 114]

    print(f"Target surahs: {surah_list}")
    for s_num in surah_list:
        await process_surah(s_num, sem)
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
