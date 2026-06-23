#!/usr/bin/env python3
"""
Normalize the Quran waqf (pause) mark layer to the canonical qpc_uthmani_hafs text,
fixing two rendering bugs the dot-fix didn't touch:

  1. STACKED waqf marks  e.g. 2:2 has 06DB+06DA+06D6 on one letter (canonical: 06DB),
     2:266 has a stray 06D6+06DA on duʿafāʾ (canonical: none) -> overlap into "gibberish".
  2. U+200B (ZERO WIDTH SPACE) inserted before waqf marks detaches the combining mark
     from its base letter, so the browser draws it on a dotted-circle placeholder (the "◉").
     cleanArabic strips other invisibles but NOT 200B.

Fix per ayah: drop all 200B, drop all existing waqf marks (06D6..06DC), then re-insert the
canonical waqf marks at the matching letters (letter-skeleton alignment). Leaves harakat,
rub-el-hizb (06DE), sajda (06E9) and everything else untouched. Applied to BOTH
ayah['arabic'] and ayah['word_by_word'][*]['arabic'] (the reader renders word_by_word).

Validation: after the rewrite, the multiset of waqf marks in ours must equal canonical's.

  python fix_marks.py            # dry run + validation report
  python fix_marks.py --apply
"""
import json, glob, os, sys, difflib, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'docs', 'data')
CANON = json.load(open(os.path.join(HERE, '_canon_qpc.json'), encoding='utf-8'))
CANON = {int(k): v for k, v in CANON.items()}

WAQF = {0x06D6, 0x06D7, 0x06D8, 0x06D9, 0x06DA, 0x06DB, 0x06DC}
ZWSP = '​'
NBSP = 0x00A0

def is_letter(c):
    # real base letters only; tatweel (0640) is an extender, not a skeleton letter
    o = ord(c)
    return (0x0621 <= o <= 0x064A) or o in (0x0671, 0x066E, 0x0629, 0x0626)

def norm(c):
    o = ord(c)
    if o in (0x0627, 0x0671, 0x0622, 0x0623, 0x0625): return 'A'
    if o in (0x064A, 0x0649, 0x0626): return 'Y'
    if o in (0x0648, 0x0624): return 'W'
    if o in (0x0647, 0x0629): return 'H'
    return c

def letters(text):
    return [(i, c) for i, c in enumerate(text) if is_letter(c)]

def canon_waqf_anchors(canon):
    """[(canon_letter_skeleton_index, waqf_char)] for each waqf mark in canon."""
    out = []
    li = -1
    for c in canon:
        if is_letter(c):
            li += 1
        elif ord(c) in WAQF:
            out.append((li, c))   # anchored to the letter it follows
    return out

def build_c2o(ours, canon):
    ol = [norm(c) for _, c in letters(ours)]
    cl = [norm(c) for _, c in letters(canon)]
    sm = difflib.SequenceMatcher(a=ol, b=cl, autojunk=False)
    c2o = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and (i2 - i1) == (j2 - j1)):
            for k in range(i2 - i1):
                c2o[j1 + k] = i1 + k
        elif tag == 'replace':
            for k in range(min(i2 - i1, j2 - j1)):
                c2o[j1 + k] = i1 + k
    return c2o

def ours_anchors(ours, canon):
    """ours_letter_skeleton_index -> waqf_char (canonical), plus count we couldn't map."""
    c2o = build_c2o(ours, canon)
    anchors = collections.defaultdict(list)
    unmapped = 0
    for canon_li, ch in canon_waqf_anchors(canon):
        oi = c2o.get(canon_li)
        if oi is None:
            unmapped += 1
        else:
            anchors[oi].append(ch)   # a letter may carry >1 waqf mark (e.g. 36:52)
    return dict(anchors), unmapped

def rebuild(text, start_li, anchors):
    """Drop 200B + existing waqf; insert anchors[global_letter_idx] after that letter's harakat.
    Returns (new_text, end_li)."""
    out = []
    li = start_li
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == ZWSP or ord(c) in WAQF:
            i += 1
            continue
        if is_letter(c):
            out.append(c)
            cur = li
            li += 1
            i += 1
            # emit this letter's trailing harakat (combining marks), skipping ZWSP / old waqf
            while i < n:
                d = text[i]
                if d == ZWSP or ord(d) in WAQF:
                    i += 1
                    continue
                if is_letter(d) or d == ' ' or ord(d) == NBSP:
                    break
                out.append(d)
                i += 1
            if cur in anchors:
                out.extend(anchors[cur])
        else:
            out.append(c)
            i += 1
    return ''.join(out), li

def waqf_multiset(text):
    return collections.Counter(c for c in text if ord(c) in WAQF)

def process(apply):
    files = sorted(glob.glob(os.path.join(DATA, 'surah_*.json')))
    stats = collections.Counter()
    flags = []
    touched_ayahs = 0
    for fn in files:
        d = json.load(open(fn, encoding='utf-8'))
        sid = d['id']
        changed = False
        for a in d.get('ayahs', []):
            t = a.get('arabic', '')
            canon = CANON.get(sid, {}).get(f"{sid}:{a['ayah']}", '')
            if not canon:
                if any(ord(c) in WAQF for c in t) or ZWSP in t:
                    flags.append(f"{sid}:{a['ayah']} NO CANONICAL (left as-is)")
                continue
            anchors, unmapped = ours_anchors(t, canon)
            if unmapped:
                flags.append(f"{sid}:{a['ayah']} {unmapped} canonical waqf could not be mapped")
            new_arabic, _ = rebuild(t, 0, anchors)
            # validate: ours waqf multiset == canonical waqf multiset
            want = waqf_multiset(canon)
            got = waqf_multiset(new_arabic)
            if got != want:
                flags.append(f"{sid}:{a['ayah']} waqf mismatch got={dict((hex(ord(k)),v) for k,v in got.items())} want={dict((hex(ord(k)),v) for k,v in want.items())}")
            # word_by_word: rebuild sequentially with a global letter counter
            wbw = a.get('word_by_word')
            words = list(wbw.values()) if isinstance(wbw, dict) else (wbw or [])
            new_words = []
            li = 0
            for w in words:
                wa = (w or {}).get('arabic', '')
                nw, li = rebuild(wa, li, anchors)
                new_words.append((w, nw))

            stat_before = sum(1 for c in t if c == ZWSP or ord(c) in WAQF)
            stat_after = sum(1 for c in new_arabic if ord(c) in WAQF)
            if new_arabic != t or any(nw != (w or {}).get('arabic', '') for w, nw in new_words):
                touched_ayahs += 1
                stats['zwsp_removed'] += t.count(ZWSP)
                stats['waqf_before'] += sum(1 for c in t if ord(c) in WAQF)
                stats['waqf_after'] += stat_after
                changed = True
                if apply:
                    a['arabic'] = new_arabic
                    for w, nw in new_words:
                        if isinstance(w, dict):
                            w['arabic'] = nw
        if apply and changed and not flags:
            with open(fn, 'w', encoding='utf-8') as wf:
                json.dump(d, wf, ensure_ascii=False, separators=(',', ':'))
    return stats, flags, touched_ayahs

def main():
    apply = '--apply' in sys.argv
    stats, flags, touched = process(apply=False)  # always plan + validate first
    print('=== mark-normalization plan ===')
    print('ayahs touched   :', touched)
    print('ZWSP removed     :', stats['zwsp_removed'])
    print('waqf marks before:', stats['waqf_before'], ' after:', stats['waqf_after'],
          f"(net {stats['waqf_after']-stats['waqf_before']:+d})")
    if flags:
        print(f'\n!!! FLAGS ({len(flags)}):')
        for f in flags[:60]:
            print('   ', f)
    else:
        print('\nNo flags — every ayah\'s waqf marks match canonical exactly.')
    if apply:
        if flags:
            print('\nNOT APPLIED — resolve flags first.')
            sys.exit(1)
        process(apply=True)
        print('\nAPPLIED.')
    else:
        print('\nDRY RUN. Re-run with --apply once the plan looks right.')

if __name__ == '__main__':
    main()
