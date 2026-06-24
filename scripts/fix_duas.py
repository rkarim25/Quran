#!/usr/bin/env python3
"""
Fix the Duas page Arabic the same way as the main Quran: reconcile each dua's
per-token `ar` (and the flat `arabic`) to the canonical qpc_uthmani_hafs text,
preserving every token's `d` (dua-portion marker, for the green underline),
`tr`, `en`, and `ai` fields.

Each dua's `words` is one group per ayah; each group's tokens cover that full
verse, so we distribute canonical chars into the existing token buckets
(reusing fix_canonical.distribute). Strong validation: the rebuilt tokens'
letters must equal the canonical verse's letters.

  python fix_duas.py            # dry run
  python fix_duas.py --apply
"""
import json, os, sys, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fc', os.path.join(HERE, 'fix_canonical.py'))
fc = importlib.util.module_from_spec(spec); spec.loader.exec_module(fc)
DUAS = os.path.join(HERE, '..', 'docs', 'data', 'duas.json')

DET = {0x06A9: 'ك', 0x06AA: 'ك', 0x06C1: 'ه', 0x06BE: 'ه', 0x06CC: 'ي', 0x06D2: 'ى', 0x0674: 'ء'}
STRIP = {0x0615, 0x06DF, 0x0614, 0x06EB, 0x200b}

def det_fix(s):
    return ''.join(DET.get(ord(c), c) for c in s if ord(c) not in STRIP)

def main():
    apply = '--apply' in sys.argv
    duas = json.load(open(DUAS, encoding='utf-8'))
    flags = []; n_grp = 0; n_distrib = 0; n_fallback = 0; maxdiff = 0
    for x in duas:
        sid = x['surah']
        verses = []
        for grp in x.get('words', []):
            a = grp['a']
            cv = fc.strip_num(fc.CANON[sid][f'{sid}:{a}'])
            verses.append(cv)
            toks = [t.get('ar', '') for t in grp.get('t', [])]
            diff = abs(len(fc.skel(''.join(toks))) - len(fc.skel(cv)))
            maxdiff = max(maxdiff, diff)
            n_grp += 1
            if diff <= 6:                       # full verse (orthographic diffs only)
                new = fc.distribute(cv, toks)
                if fc.skel(''.join(new)) == fc.skel(cv):
                    n_distrib += 1
                    if apply:
                        for t, na in zip(grp['t'], new): t['ar'] = na
                    continue
            # fallback: partial verse or alignment issue -> safe deterministic cleanup
            n_fallback += 1
            flags.append(f"{x['id']} {sid}:{a} (skel diff {diff}) -> deterministic fallback")
            if apply:
                for t in grp['t']: t['ar'] = det_fix(t.get('ar', ''))
        if apply:
            x['arabic'] = ' '.join(verses)

    if apply and not [f for f in flags if 'diff' in f and int(f.split('diff ')[1].split(')')[0]) > 6]:
        with open(DUAS, 'w', encoding='utf-8') as wf:
            json.dump(duas, wf, ensure_ascii=False, separators=(',', ':'))

    print('=== dua reconciliation ===')
    print(f'  dua verse-groups: {n_grp}')
    print(f'    via canonical distribution: {n_distrib}')
    print(f'    via deterministic fallback: {n_fallback}')
    print(f'  max skeleton diff between dua tokens and canonical verse: {maxdiff}')
    if flags:
        print(f'  notes ({len(flags)}):')
        for f in flags[:30]: print('   ', f)
    print('\nAPPLIED.' if apply else '\nDRY RUN. Re-run with --apply.')

if __name__ == '__main__':
    main()
