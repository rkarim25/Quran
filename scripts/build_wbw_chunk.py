import json, sys
out_path, dest = sys.argv[1], sys.argv[2]
raw = open(out_path, encoding="utf-8").read()
def find_result(s):
    d = json.loads(s)
    if isinstance(d, dict) and "result" in d:
        r = d["result"]; return json.loads(r) if isinstance(r, str) else r
    return d
res = find_result(raw)
if isinstance(res, str): res = json.loads(res)
chunk = {}
for item in res:
    if not item or "ayah" not in item: continue
    chunk[str(item["ayah"])] = item.get("words", {})
json.dump(chunk, open(dest, "w", encoding="utf-8"), ensure_ascii=False)
print("chunk ayahs:", ",".join(sorted(chunk, key=lambda x:int(x))), "| words:", sum(len(v) for v in chunk.values()))
