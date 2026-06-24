#!/usr/bin/env python3
"""
Propagate the canonical Arabic (verse text + each word) from the already-fixed
docs/data/surah_*.json into the MARKDOWN SOURCE (Quran-obs/Surah_N/Ayah_M.md
frontmatter: arabic_ayat + word_by_word[*].arabic).

This is the real source of truth — build_site.py rebuilds docs/data from these .md
files on every deploy, so a fix applied only to docs/data is overwritten at deploy
time. Only arabic_ayat and each word's `arabic` are changed; translations,
transliterations, sentence_translation, and the body (tafsir/sections) are left
byte-identical (frontmatter re-dump is idempotent with these yaml settings).

  python fix_source_md.py            # dry run (counts + sample)
  python fix_source_md.py --apply
"""
import json, glob, os, sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'docs', 'data')
SOURCE = os.path.join(HERE, '..', 'Quran-obs')

def main():
    apply = '--apply' in sys.argv
    files = sorted(glob.glob(os.path.join(DATA, 'surah_*.json')))
    n_files = n_ayah = n_changed = n_missing = 0
    for fn in files:
        d = json.load(open(fn, encoding='utf-8'))
        sid = d['id']
        for a in d.get('ayahs', []):
            ay = a['ayah']
            mdp = os.path.join(SOURCE, f'Surah_{sid}', f'Ayah_{ay}.md')
            if not os.path.exists(mdp):
                n_missing += 1
                continue
            n_ayah += 1
            text = open(mdp, encoding='utf-8').read()
            if not text.startswith('---'):
                continue
            _, fmtext, body = text.split('---', 2)
            fm = yaml.safe_load(fmtext)
            before = (fm.get('arabic_ayat'),
                      tuple((k, (w.get('arabic') if isinstance(w, dict) else None))
                            for k, w in (fm.get('word_by_word') or {}).items()))
            # canonical verse
            fm['arabic_ayat'] = a['arabic']
            # canonical per-word arabic (preserve translation/transliteration)
            jwbw = a.get('word_by_word') or {}
            for k, w in (fm.get('word_by_word') or {}).items():
                jw = jwbw.get(str(k))
                if jw and isinstance(w, dict) and isinstance(jw, dict) and 'arabic' in jw:
                    w['arabic'] = jw['arabic']
            after = (fm.get('arabic_ayat'),
                     tuple((k, (w.get('arabic') if isinstance(w, dict) else None))
                           for k, w in (fm.get('word_by_word') or {}).items()))
            if before != after:
                n_changed += 1
                if apply:
                    newfm = yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False)
                    with open(mdp, 'w', encoding='utf-8') as wf:
                        wf.write('---\n' + newfm + '---' + body)
        n_files += 1
    print(f'surah json files: {n_files}')
    print(f'ayah .md files seen: {n_ayah}   missing .md: {n_missing}')
    print(f'ayah .md {"updated" if apply else "that WOULD change"}: {n_changed}')
    print('APPLIED.' if apply else 'DRY RUN — re-run with --apply.')

if __name__ == '__main__':
    main()
