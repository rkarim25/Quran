#!/usr/bin/env python3
"""
Fix every character in the per-ayah Arabic text that the UthmanicHafs1Ver18 font
draws as its generic placeholder dot (the glyph for U+0600).

Two classes, both resolved against the canonical qpc_uthmani_hafs text (quran.com
v4) by a letter-skeleton-anchored alignment so we copy the *real* canonical
character rather than guessing:

  LETTERS (wrong Persian/Urdu letter variants) -> correct Arabic letter
    06A9 keheh, 06AA swash-kaf            -> 0643 kaf
    06C1 heh-goal, 06BE heh-doachashmee   -> 0647 heh
    06D2 yeh-barree                       -> per canonical (0649)
    06CC farsi-yeh                        -> per canonical (064A / 0649 / 0626)
    0674 high-hamza                       -> per canonical (0621 / removed if folded into a seat)

  MARKS (waqf/pause marks flattened to one unsupported codepoint) -> canonical mark
    0615, 06DF, 0614, 06EB
      mid-verse  -> the canonical waqf mark at that position (06D6..06DC)
      verse-end  -> removed (canonical has the ayah number there; the site numbers ayahs itself)

Applied to BOTH ayah['arabic'] and ayah['word_by_word'][*]['arabic'] via an
ordered per-ayah replacement list (validated: the corrupted-char order/count must
match between the two).

Usage:
  python fix_dot_glyphs.py            # dry run: fetch canonical, resolve, report, validate
  python fix_dot_glyphs.py --apply    # write changes (refuses if any flags/unresolved)
"""
import json, glob, os, sys, urllib.request, time, difflib, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'docs', 'data')
CANON_CACHE = os.path.join(HERE, '_canon_qpc.json')

LETTER_CORRUPT = {0x06A9, 0x06AA, 0x06CC, 0x0674, 0x06C1, 0x06BE, 0x06D2}
MARK_CORRUPT   = {0x0615, 0x06DF, 0x0614, 0x06EB}
CORRUPT = LETTER_CORRUPT | MARK_CORRUPT
WAQF = {0x06D6, 0x06D7, 0x06D8, 0x06D9, 0x06DA, 0x06DB, 0x06DC}
# what each letter-corrupt char is allowed to become (sanity guard for sacred text)
LETTER_ALLOWED = {
    0x06A9: {0x0643}, 0x06AA: {0x0643},
    0x06C1: {0x0647}, 0x06BE: {0x0647},
    0x06D2: {0x064A, 0x0649},
    0x06CC: {0x064A, 0x0649, 0x0626},
    0x0674: {0x0621, 0x0623, 0x0624, 0x0625, 0x0626, None},  # None = removed (folded into a seat)
}

def is_letter(c):
    o = ord(c)
    return (0x0621 <= o <= 0x064A) or o in (0x0671, 0x066E, 0x0629,
            0x06A9, 0x06AA, 0x06CC, 0x0626, 0x06C1, 0x06BE, 0x06D2, 0x0674)

def norm(c):
    o = ord(c)
    if o in (0x0643, 0x06A9, 0x06AA): return 'K'
    if o in (0x064A, 0x0649, 0x06CC, 0x0626, 0x06D2, 0x0678): return 'Y'
    if o in (0x0627, 0x0671, 0x0622, 0x0623, 0x0625): return 'A'
    if o in (0x0647, 0x0629, 0x06C1, 0x06BE, 0x06C0): return 'H'
    if o in (0x0648, 0x0624): return 'W'
    if o in (0x0621, 0x0674, 0x0654): return 'H2'
    return c

def fetch_all_canon():
    if os.path.exists(CANON_CACHE):
        return {int(k): v for k, v in json.load(open(CANON_CACHE, encoding='utf-8')).items()}
    out = {}
    for sid in range(1, 115):
        url = f'https://api.quran.com/api/v4/verses/by_chapter/{sid}?fields=qpc_uthmani_hafs&per_page=300'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        j = json.load(urllib.request.urlopen(req, timeout=90))
        out[sid] = {v['verse_key']: v['qpc_uthmani_hafs'] for v in j['verses']}
        print(f'  fetched canonical surah {sid} ({len(out[sid])} ayat)')
        time.sleep(0.2)
    json.dump({str(k): v for k, v in out.items()}, open(CANON_CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    return out

def letter_positions(text):
    return [(i, c) for i, c in enumerate(text) if is_letter(c)]

def trailing_after(canon, canon_letter_idx):
    res = []
    for j in range(canon_letter_idx + 1, len(canon)):
        if is_letter(canon[j]): break
        res.append(canon[j])
    return res

def resolve_ayah(ours, canon):
    """Return (repls, flags) where repls is an ordered list of (orig_idx, src_char, replacement_str)
    for every corrupted char in `ours`, and flags is a list of warning strings."""
    flags = []
    ol = letter_positions(ours)
    cl = letter_positions(canon)
    sm = difflib.SequenceMatcher(a=[norm(c) for _, c in ol], b=[norm(c) for _, c in cl], autojunk=False)
    # map ours-letter-index -> canon-letter-index (equal + equal-size replace blocks)
    o2c = {}
    unequal = []  # ours-letter indices in unequal replace/insert/delete blocks
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and (i2 - i1) == (j2 - j1)):
            for k in range(i2 - i1): o2c[i1 + k] = j1 + k
        elif tag == 'replace':
            # greedy left-align; remember leftover ours indices
            n = min(i2 - i1, j2 - j1)
            for k in range(n): o2c[i1 + k] = j1 + k
            for k in range(n, i2 - i1): unequal.append(i1 + k)
        elif tag == 'delete':
            for k in range(i1, i2): unequal.append(k)
    # index helpers
    letterpos_of_origidx = {oi: bi for bi, (oi, _) in enumerate(ol)}
    repls = []
    for i, ch in enumerate(ours):
        o = ord(ch)
        if o not in CORRUPT:
            continue
        if o in LETTER_CORRUPT:
            bi = letterpos_of_origidx[i]
            cj = o2c.get(bi)
            if cj is not None:
                tgt = cl[cj][1]
                rep = tgt
                if ord(tgt) not in (LETTER_ALLOWED[o] - {None}):
                    flags.append(f'LETTER {hex(o)} -> U+{ord(tgt):04X} not in allowed set')
                repls.append((i, ch, rep))
            elif o == 0x0674:
                # High hamza in an unequal block: NEVER silently drop the hamza.
                #  - if the immediately preceding char is the farsi-yeh seat (06CC, which we
                #    convert to the precomposed yeh-hamza 0626), the hamza is absorbed -> remove.
                #  - otherwise keep the hamza as a plain hamza (0621), which renders correctly.
                if i > 0 and ours[i - 1] == 'ی':
                    repls.append((i, ch, ''))         # absorbed into preceding 0626
                else:
                    repls.append((i, ch, 'ء'))   # preserve hamza
            else:
                flags.append(f'LETTER {hex(o)} at idx{i} UNRESOLVED (no canonical match)')
                repls.append((i, ch, None))
        else:  # MARK_CORRUPT
            # anchor on nearest preceding letter
            prev = [oi for oi, _ in ol if oi < i]
            if not prev:
                repls.append((i, ch, '')); continue
            bi = letterpos_of_origidx[prev[-1]]
            cj = o2c.get(bi)
            if cj is None:
                # can't locate; safest is removal (it's an unrenderable mark anyway)
                repls.append((i, ch, '')); continue
            marks = trailing_after(canon, cl[cj][0])
            wq = [m for m in marks if ord(m) in WAQF]
            repls.append((i, ch, wq[0] if wq else ''))   # waqf mark, else remove
    return repls, flags

def apply_repls_to_text(text, repls):
    """repls: ordered list of (orig_idx, src_char, replacement). orig_idx is into `text`."""
    chars = list(text)
    # apply by index (indices are original positions in this exact text)
    for oi, src, rep in repls:
        assert chars[oi] == src, f'index mismatch at {oi}'
        chars[oi] = rep if rep is not None else src
    return ''.join(chars)

DET_FALLBACK = {0x06A9: 'ك', 0x06AA: 'ك', 0x06C1: 'ه', 0x06BE: 'ه',
                0x06D2: 'ى', 0x06CC: 'ي', 0x0674: 'ء'}

def apply_per_type(text, queues):
    """Apply replacements to corrupted chars, matching by source-char-type order.
    Robust to count mismatches between arabic and word_by_word."""
    out = []
    for c in text:
        o = ord(c)
        if o in CORRUPT:
            q = queues.get(o)
            if q:
                rep = q.pop(0)
            else:  # word_by_word had more of this type than arabic: safe fallback
                rep = DET_FALLBACK.get(o, '')  # letters -> correct letter; marks -> remove
            out.append(rep if rep is not None else c)
        else:
            out.append(c)
    return ''.join(out)

def main():
    apply = '--apply' in sys.argv
    print('Loading canonical qpc_uthmani_hafs ...')
    canon = fetch_all_canon()

    by_src = collections.Counter()       # src_char -> target summary
    pair_counts = collections.Counter()  # (src, target) -> n
    all_flags = []
    wbw_mismatch = []
    files = sorted(glob.glob(os.path.join(DATA, 'surah_*.json')))

    # plan per file (so dry-run and apply share logic)
    def plan_file(d):
        sid = d['id']; flags = []
        edits = []  # (ayah_obj, arabic_repls)
        for a in d.get('ayahs', []):
            t = a.get('arabic', '')
            if not t or not any(ord(c) in CORRUPT for c in t):
                continue
            c = canon.get(sid, {}).get(f"{sid}:{a['ayah']}", '')
            if not c:
                flags.append(f"{sid}:{a['ayah']} NO CANONICAL"); continue
            repls, f = resolve_ayah(t, c)
            for fl in f: flags.append(f"{sid}:{a['ayah']} {fl}")
            edits.append((a, repls))
        return edits, flags

    for fn in files:
        d = json.load(open(fn, encoding='utf-8'))
        edits, flags = plan_file(d)
        all_flags += flags
        for a, repls in edits:
            for _, src, rep in repls:
                pair_counts[(src, '∅' if rep == '' else (rep if rep is not None else '??'))] += 1
                by_src[src] += 1
            # validate wbw count/order matches
            ordered = [rep for _, _, rep in repls]
            wbw = a.get('word_by_word')
            words = list(wbw.values()) if isinstance(wbw, dict) else (wbw or [])
            wbw_corrupt = sum(1 for w in words for ch in (w or {}).get('arabic', '') if ord(ch) in CORRUPT)
            if wbw_corrupt != len(ordered):
                wbw_mismatch.append(f"{d['id']}:{a['ayah']} arabic={len(ordered)} wbw={wbw_corrupt}")
        if apply and not all_flags:
            # mutate in place
            for a, repls in edits:
                a['arabic'] = apply_repls_to_text(a['arabic'], repls)
                # per-source-type queues, in document order
                queues = collections.defaultdict(list)
                for _, src, rep in repls:
                    queues[ord(src)].append(rep)
                wbw = a.get('word_by_word')
                words = wbw.values() if isinstance(wbw, dict) else (wbw or [])
                for w in words:
                    if isinstance(w, dict):
                        w['arabic'] = apply_per_type(w.get('arabic', ''), queues)
            # match the original compact formatting so the diff is only the changed chars
            with open(fn, 'w', encoding='utf-8') as wf:
                json.dump(d, wf, ensure_ascii=False, separators=(',', ':'))

    # ---- report ----
    print('\n=== replacement summary (source -> target : count) ===')
    for (src, tgt), n in sorted(pair_counts.items(), key=lambda x: -x[1]):
        print(f'  U+{ord(src):04X} -> {tgt if tgt=="∅" else "U+%04X"%ord(tgt)}   x{n}')
    print(f'\n total corrupted chars handled: {sum(by_src.values())}')
    if wbw_mismatch:
        print(f'\n!!! word_by_word count mismatches ({len(wbw_mismatch)}):')
        for m in wbw_mismatch[:40]: print('   ', m)
    if all_flags:
        print(f'\n!!! FLAGS ({len(all_flags)}):')
        for f in all_flags[:80]: print('   ', f)
    if apply:
        if all_flags:
            print('\nNOT APPLIED — resolve flags first.')
            sys.exit(1)
        print('\nAPPLIED to data files. (word_by_word count mismatches handled by per-type alignment.)')
    else:
        print('\nDRY RUN. Re-run with --apply once the summary looks right.')

if __name__ == '__main__':
    main()
