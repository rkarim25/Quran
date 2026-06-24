#!/usr/bin/env python3
"""
Recover ai-wbw-pipeline analyses from a workflow run's agent transcripts when the
pipeline's agent-based part-file write step failed to persist. The draft/finalize
agents emit {words:[...]} via the StructuredOutput tool; we collect those (finalize
overrides draft, by form id) and write them as a part file in the surah dir.

  python recover_wbw.py <surah> <wf_run_dir> <out_part_path>
"""
import json, glob, sys

def scan(x):
    """Find a StructuredOutput tool_use input dict containing 'words'."""
    if isinstance(x, dict):
        if x.get('type') == 'tool_use' and x.get('name') == 'StructuredOutput' \
           and isinstance(x.get('input'), dict) and 'words' in x['input']:
            return x['input']
        for v in x.values():
            r = scan(v)
            if r is not None:
                return r
    elif isinstance(x, list):
        for v in x:
            r = scan(v)
            if r is not None:
                return r
    return None

def main():
    surah, wfdir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    drafts, finals = {}, {}
    for f in glob.glob(wfdir + '/agent-*.jsonl'):
        for ln in open(f, encoding='utf-8'):
            ln = ln.strip()
            if not ln:
                continue
            try:
                o = json.loads(ln)
            except Exception:
                continue
            inp = scan(o)
            if inp and isinstance(inp.get('words'), list):
                tgt = finals if 'changes_made' in inp else drafts
                for w in inp['words']:
                    if isinstance(w, dict) and 'id' in w:
                        tgt[w['id']] = w
    def complete(w):
        return bool(w and w.get('meaning') and w.get('parts') and w.get('grammar'))
    merged = {}
    for i in set(drafts) | set(finals):
        df, fn = drafts.get(i), finals.get(i)
        # prefer a COMPLETE finalize; else a complete draft; else whatever exists
        if complete(fn):
            merged[i] = fn
        elif complete(df):
            merged[i] = df
        else:
            merged[i] = fn or df
    analyses = [{
        'id': i,
        'entry': {
            'meaning': w.get('meaning', ''),
            'parts': w.get('parts', []),
            'grammar': w.get('grammar', ''),
            'root': w.get('root', ''),
        }
    } for i, w in sorted(merged.items())]
    with open(out, 'w', encoding='utf-8') as wf:
        json.dump(analyses, wf, ensure_ascii=False, separators=(',', ':'))
    print(f'surah {surah}: recovered {len(analyses)} analyses '
          f'(drafts {len(drafts)}, finalize-overrides {len(finals)}) -> {out}')

if __name__ == '__main__':
    main()
