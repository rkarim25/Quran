import os
import json
import glob
import re

hmap = json.load(open('docs/data/hadith_map.json', encoding='utf-8'))
hidx = json.load(open('docs/data/hadith_index.json', encoding='utf-8'))
asbab = json.load(open('docs/data/asbab_nuzul.json', encoding='utf-8'))

passage_files = sorted(
    glob.glob('docs/data/passage_tafsir/surah_*.json'),
    key=lambda p: int(os.path.basename(p).split('_')[1].split('.')[0])
)

total_passages = 0
passages_with_hadith = 0
passages_with_asbab_data = 0
passages_mentioning_context = 0
passages_with_event_heading = 0

surah_stats = []

for pf in passage_files:
    snum = int(os.path.basename(pf).split('_')[1].split('.')[0])
    with open(pf, encoding='utf-8') as f:
        data = json.load(f)
    passages = data.get('passages', [])
    
    s_hadith_count = 0
    s_asbab_count = 0
    s_context_count = 0
    
    for p in passages:
        total_passages += 1
        s_start = p.get('start', 1)
        s_end = p.get('end', s_start)
        
        # Check hadith map
        has_h = any(f"{snum}:{a}" in hmap for a in range(s_start, s_end + 1))
        if has_h:
            passages_with_hadith += 1
            s_hadith_count += 1
            
        # Check asbab data
        has_a = any(f"{snum}:{a}" in asbab and asbab[f"{snum}:{a}"].get('has_occasion') for a in range(s_start, s_end + 1))
        if has_a:
            passages_with_asbab_data += 1
            s_asbab_count += 1
            
        # Check text in passage tafsir
        t = p.get('tafsir', '')
        has_heading = bool(re.search(r'##\s*(The event behind|Background|Historical|Occasion|Context)', t, re.I))
        has_kw = bool(re.search(r'\b(revealed when|revealed concerning|revealed about|occasion of revelation|sabab|bukhari|muslim|hudaybiy|badr|uhud|khandaq|tabuk|hijrah)\b', t, re.I))
        if has_heading:
            passages_with_event_heading += 1
        if has_heading or has_kw:
            passages_mentioning_context += 1
            s_context_count += 1
            
    surah_stats.append({
        'surah': snum,
        'total': len(passages),
        'hadith_passages': s_hadith_count,
        'asbab_passages': s_asbab_count,
        'context_in_tafsir': s_context_count
    })

print(f"Total Passages across 114 Surahs: {total_passages}")
print(f"Passages with mapped Hadiths: {passages_with_hadith} ({passages_with_hadith/total_passages*100:.1f}%)")
print(f"Passages with Asbab Nuzul flag in db: {passages_with_asbab_data} ({passages_with_asbab_data/total_passages*100:.1f}%)")
print(f"Passages where AI Tafsir mentions historical context/hadith: {passages_mentioning_context} ({passages_mentioning_context/total_passages*100:.1f}%)")
print(f"Passages with explicit '## The event behind...' heading: {passages_with_event_heading} ({passages_with_event_heading/total_passages*100:.1f}%)")

# Top 15 Surahs by context density
surah_stats.sort(key=lambda s: s['context_in_tafsir'] / s['total'] if s['total'] else 0, reverse=True)
print("\nTop 15 Surahs by Historical Context Density:")
for s in surah_stats[:15]:
    pct = (s['context_in_tafsir'] / s['total']) * 100 if s['total'] else 0
    print(f"Surah {s['surah']:3d}: {s['context_in_tafsir']:2d}/{s['total']:2d} passages ({pct:.0f}%) | Hadith: {s['hadith_passages']}")

# Bottom Surahs (0 context)
zero_context = [s for s in surah_stats if s['context_in_tafsir'] == 0]
print(f"\nSurahs with ZERO historical/hadith context in AI Tafsir: {len(zero_context)} Surahs")
zero_snums = [str(s['surah']) for s in zero_context[:10]]
print("Sample zero-context Surahs:", ", ".join(zero_snums))
