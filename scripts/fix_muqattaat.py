#!/usr/bin/env python3
"""
Reconcile the disjoined-letter (muqaṭṭaʿāt) openings to the canonical qpc_uthmani_hafs
text. The data adds non-standard marks to these letters — an extra shadda on the mīm of
الٓمٓ (it renders as a dense blob under the madda), a different madda glyph (06E4 vs 0653),
and extra dagger-alefs (0670) — none of which are in the standard Madinah/QPC text the
font is built for.

Fix = replace the FIRST space-delimited token (the disjoined letters) of each muqaṭṭaʿāt
ayah with canonical's first token, in both ayah['arabic'] and word_by_word's first word.
Everything after the letters is left untouched.

  python fix_muqattaat.py            # dry run
  python fix_muqattaat.py --apply
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'docs', 'data')
CANON = {int(k): v for k, v in json.load(open(os.path.join(HERE, '_canon_qpc.json'), encoding='utf-8')).items()}

MUQ_SURAHS = [2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32,
              36, 38, 40, 41, 42, 43, 44, 45, 46, 50, 68]
TARGETS = [(s, 1) for s in MUQ_SURAHS] + [(42, 2)]   # 42 has حم (1) and عسق (2)

def canon_clean(s):
    # drop the trailing ayah-number (NBSP + arabic-indic digits) and stray directional/space
    return ''.join(ch for ch in s
                   if not (0x0660 <= ord(ch) <= 0x0669)
                   and ord(ch) not in (0x00A0, 0x200f, 0x2002)).strip()

def first_token(s):
    return s.split(' ')[0]

def main():
    apply = '--apply' in sys.argv
    changes = []
    for sid, ay in sorted(TARGETS):
        path = os.path.join(DATA, f'surah_{sid}.json')
        d = json.load(open(path, encoding='utf-8'))
        a = [x for x in d['ayahs'] if x['ayah'] == ay][0]
        t = a['arabic']
        canon = CANON[sid][f'{sid}:{ay}']
        cf = first_token(canon_clean(canon))
        of = first_token(t)
        new_arabic = cf + t[len(of):]
        # word_by_word: first word is the disjoined-letter token
        wbw = a.get('word_by_word') or {}
        keys = list(wbw.keys()) if isinstance(wbw, dict) else []
        wbw_before = wbw[keys[0]].get('arabic', '') if keys else ''
        changed = (new_arabic != t) or (keys and wbw_before != cf)
        changes.append((f'{sid}:{ay}',
                        ' '.join('%04X' % ord(x) for x in of if not (0xE000 <= ord(x) <= 0xF8FF)),
                        ' '.join('%04X' % ord(x) for x in cf),
                        changed))
        if apply and changed:
            a['arabic'] = new_arabic
            if keys:
                wbw[keys[0]]['arabic'] = cf
            with open(path, 'w', encoding='utf-8') as wf:
                json.dump(d, wf, ensure_ascii=False, separators=(',', ':'))

    print(f"{'ref':8} {'changed':8} ours_first_token -> canon_first_token")
    for ref, of, cf, ch in changes:
        print(f"  {ref:7} {'YES' if ch else 'no':8} [{of}] -> [{cf}]")
    print(f"\n{sum(1 for *_ , ch in changes if ch)} of {len(changes)} openings reconciled.")
    print('APPLIED.' if apply else '\nDRY RUN — re-run with --apply.')

if __name__ == '__main__':
    main()
