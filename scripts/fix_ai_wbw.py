#!/usr/bin/env python3
"""
Fix the AI word-by-word (ai_wbw) Arabic font artifacts. These are sub-word
morpheme fragments (not full Quran words), so they can't be reconciled to a
canonical verse — instead apply the safe, context-free cleanup that removes the
font's dot-placeholder triggers:

  Persian/Urdu letter variants -> standard Arabic letter
    06A9 keheh, 06AA swash-kaf -> 0643 kaf ; 06C1 heh-goal, 06BE heh-doachashmee
    -> 0647 heh ; 06CC farsi-yeh -> 064A yeh ; 06D2 yeh-barree -> 0649 ; 0674 high-hamza -> 0621
  unsupported marks removed: 0615, 06DF, 0614, 06EB, and U+200B (ZWSP)

Applied only to the Arabic-bearing fields `ar`, `grammar`, `root`.

  python fix_ai_wbw.py            # dry run
  python fix_ai_wbw.py --apply
"""
import json, glob, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
AIWBW = os.path.join(HERE, '..', 'docs', 'data', 'ai_wbw')
FIELDS = {'ar', 'grammar', 'root'}
DET = {0x06A9: 'ك', 0x06AA: 'ك', 0x06C1: 'ه', 0x06BE: 'ه', 0x06CC: 'ي', 0x06D2: 'ى', 0x0674: 'ء'}
STRIP = {0x0615, 0x06DF, 0x0614, 0x06EB, 0x200b}
TRIGGER = set(DET) | STRIP

def fix(s):
    return ''.join(DET.get(ord(c), c) for c in s if ord(c) not in STRIP)

def walk(o, field, counter):
    if isinstance(o, dict):
        return {k: walk(v, k, counter) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v, field, counter) for v in o]
    if isinstance(o, str) and field in FIELDS:
        if any(ord(c) in TRIGGER for c in o):
            counter['fields'] += 1
            counter['chars'] += sum(1 for c in o if ord(c) in TRIGGER)
            return fix(o)
    return o

def main():
    apply = '--apply' in sys.argv
    counter = collections.Counter()
    files = sorted(glob.glob(os.path.join(AIWBW, '*.json')))
    for fn in files:
        d = json.load(open(fn, encoding='utf-8'))
        nd = walk(d, '', counter)
        if apply:
            with open(fn, 'w', encoding='utf-8') as wf:
                json.dump(nd, wf, ensure_ascii=False, separators=(',', ':'))
    print('=== ai_wbw cleanup ===')
    print(f'  files: {len(files)}')
    print(f'  fields fixed: {counter["fields"]}   trigger chars handled: {counter["chars"]}')
    print('\nAPPLIED.' if apply else '\nDRY RUN. Re-run with --apply.')

if __name__ == '__main__':
    main()
