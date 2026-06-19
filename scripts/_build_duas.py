# -*- coding: utf-8 -*-
"""Build docs/data/duas.json: authored metadata + authentic Arabic/translation
pulled from the existing surah_N.json files. Source list of references:
quranwbw.com/duas (supplicationsFromQuran in their repo)."""
import json, sys, os
sys.stdout.reconfigure(encoding="utf-8")

# Each dua: id, title, theme, who, situation, and segments [[surah, start, end], ...]
DUAS = [
  {"id":"ibrahim-kaaba","title":"Accept this from us","theme":"Devotion",
   "who":"Prophet Ibrahim and his son Ismail",
   "situation":"As they raised the foundations of the Kaaba in Mecca, they asked God to accept their work and to make their descendants a community devoted to Him.",
   "segments":[[2,127,128]]},
  {"id":"good-both-worlds","title":"Good in this world and the next","theme":"Balance",
   "who":"Taught in the Qur'an as the prayer of the believer",
   "situation":"Revealed during the Hajj to contrast the believer, who asks for good in both worlds, with those who ask only for the gains of this life.",
   "segments":[[2,201,201]]},
  {"id":"talut-patience","title":"Pour patience upon us","theme":"Hardship",
   "who":"The soldiers of Talut (Saul)",
   "situation":"As the small band of believers faced the army of Jalut (Goliath), they prayed for patience, firm footing, and victory.",
   "segments":[[2,250,250]]},
  {"id":"end-baqarah","title":"Do not burden us beyond our capacity","theme":"Mercy",
   "who":"The believers — the closing verses of Surah al-Baqarah",
   "situation":"According to hadith these verses were given to the Prophet during the Night Journey. They affirm faith and ask God not to burden the believers beyond what they can bear.",
   "segments":[[2,285,286]]},
  {"id":"rooted-knowledge","title":"Let not our hearts deviate","theme":"Steadfastness",
   "who":"Those firmly grounded in knowledge",
   "situation":"After reading the Qur'an's clear and allegorical verses, the people of knowledge pray that their hearts not swerve after being guided.",
   "segments":[[3,8,9]]},
  {"id":"forgive-believers-imran","title":"Forgive us our sins","theme":"Forgiveness",
   "who":"The God-conscious believers",
   "situation":"Surah Aal Imran describes them as those who, amid the temptations of the world, turn to God admitting their faith and begging forgiveness.",
   "segments":[[3,16,16]]},
  {"id":"zakariya-offspring","title":"Grant me pure offspring","theme":"Family",
   "who":"Prophet Zakariya",
   "situation":"Seeing the miraculous provision God gave Maryam in the sanctuary, the aged Zakariya was moved to ask God for a righteous child.",
   "segments":[[3,38,38]]},
  {"id":"disciples-isa","title":"Write us among the witnesses","theme":"Faith",
   "who":"The disciples (Hawariyyun) of Prophet Isa",
   "situation":"Declaring their belief in the revelation and in following the messenger, they asked to be recorded among those who bear witness to the truth.",
   "segments":[[3,53,53]]},
  {"id":"fighters-firmness","title":"Forgive our excesses and make us firm","theme":"Steadfastness",
   "who":"The devoted men who fought alongside earlier prophets",
   "situation":"In the face of battle their only words were a prayer for forgiveness of their sins and excesses, for firm footing, and for victory over the disbelievers.",
   "segments":[[3,147,147]]},
  {"id":"ulul-albab","title":"You did not create this in vain","theme":"Reflection",
   "who":"The people of understanding (Ulul Albab)",
   "situation":"Those who remember God standing, sitting, and lying down, and who reflect on the creation of the heavens and earth until it moves them to this long, humble prayer.",
   "segments":[[3,191,194]]},
  {"id":"oppressed-town","title":"Rescue us from this town","theme":"Justice",
   "who":"The oppressed believers — men, women, and children",
   "situation":"The weak and persecuted in Mecca cried out to be delivered from a town whose people were unjust, and for a protector and helper from God.",
   "segments":[[4,75,75]]},
  {"id":"weeping-believers","title":"We believe, so record us","theme":"Faith",
   "who":"Sincere Christians who recognised the truth",
   "situation":"When they heard the Qur'an their eyes overflowed with tears; they asked God to write them down among those who testify to it.",
   "segments":[[5,83,83]]},
  {"id":"isa-table","title":"Send down a table spread","theme":"Provision",
   "who":"Prophet Isa",
   "situation":"At the request of his disciples for a sign, Isa asked God to send down a table of food from heaven that would be a festival and a proof for them.",
   "segments":[[5,114,114]]},
  {"id":"adam-repentance","title":"We have wronged ourselves","theme":"Repentance",
   "who":"Prophet Adam and his wife Hawwa",
   "situation":"After eating from the forbidden tree, in deep remorse, they turned to God with the first prayer of repentance — admitting their wrong and begging mercy.",
   "segments":[[7,23,23]]},
  {"id":"araf-people","title":"Do not place us with the wrongdoers","theme":"Hereafter",
   "who":"The people of the Heights (A'raf)",
   "situation":"Standing on the heights between Paradise and Hell, they pray not to be cast among the wrongdoing people.",
   "segments":[[7,47,47]]},
  {"id":"shuayb-decision","title":"Decide between us in truth","theme":"Justice",
   "who":"Prophet Shuayb",
   "situation":"When his people threatened to drive him and the believers out, he placed his trust in God and asked Him to judge between them justly.",
   "segments":[[7,89,89]]},
  {"id":"magicians-patience","title":"Let us die as Muslims","theme":"Steadfastness",
   "who":"Pharaoh's magicians, after they believed in Musa",
   "situation":"When Pharaoh threatened to torture and execute them for their new faith, they asked God only for patience and to take their souls in submission to Him.",
   "segments":[[7,126,126]]},
  {"id":"musa-brother","title":"Forgive me and my brother","theme":"Forgiveness",
   "who":"Prophet Musa",
   "situation":"On returning to find his people worshipping the calf, after his anger with Harun, he prayed for forgiveness for himself and his brother and for God's mercy.",
   "segments":[[7,151,151]]},
  {"id":"hasbunallah","title":"Allah is sufficient for us","theme":"Reliance",
   "who":"Taught as the response of the contented believer",
   "situation":"Set against those who were displeased with how charity was distributed, the Qur'an teaches the believer's reply: contentment with God's decree and trust in His bounty.",
   "segments":[[9,59,59]]},
  {"id":"musa-people-trial","title":"Do not make us a trial for the oppressors","theme":"Reliance",
   "who":"The believers among Musa's people",
   "situation":"Few dared follow Musa for fear of Pharaoh; those who did declared their reliance on God and asked not to be made a test in the hands of the wrongdoers.",
   "segments":[[10,85,86]]},
  {"id":"nuh-knowledge","title":"I seek refuge from asking in ignorance","theme":"Humility",
   "who":"Prophet Nuh",
   "situation":"After he pleaded for his drowning son and was gently corrected, Nuh sought refuge in God from ever again asking for something of which he had no knowledge.",
   "segments":[[11,47,47]]},
  {"id":"yusuf-muslim","title":"Let me die in submission to You","theme":"Gratitude",
   "who":"Prophet Yusuf",
   "situation":"Raised to power in Egypt and reunited with his family, at the height of his blessings he thanked God and asked to die a Muslim and be joined with the righteous.",
   "segments":[[12,101,101]]},
  {"id":"ibrahim-mecca","title":"Make this city safe","theme":"Family",
   "who":"Prophet Ibrahim",
   "situation":"Settling his family in the barren valley of Mecca, he prayed for the city's security, for his descendants to keep up prayer, and for forgiveness for himself, his parents, and all believers.",
   "segments":[[14,35,41]]},
  {"id":"mercy-parents","title":"Have mercy on my parents","theme":"Parents",
   "who":"Taught to every believer",
   "situation":"Alongside the command to be kind to one's parents in their old age, the Qur'an teaches this prayer of mercy for them, recalling how they raised us when we were small.",
   "segments":[[17,24,24]]},
  {"id":"sound-entry","title":"A truthful entrance and exit","theme":"Sincerity",
   "who":"The Prophet Muhammad",
   "situation":"Often linked to the Hijra from Mecca to Medina, this prayer asks God for a sound, sincere entry and exit and for a supporting authority from Him.",
   "segments":[[17,80,80]]},
  {"id":"cave-youths","title":"Grant us mercy and guidance","theme":"Refuge",
   "who":"The Youths of the Cave (Ashab al-Kahf)",
   "situation":"Fleeing a tyrant who would persecute their faith, the young believers took refuge in a cave and prayed for mercy and right guidance in their affair.",
   "segments":[[18,10,10],[18,14,14]]},
  {"id":"musa-chest","title":"Expand my chest and ease my task","theme":"Confidence",
   "who":"Prophet Musa",
   "situation":"Commanded to confront Pharaoh, he asked God to open his heart, make his mission easy, and loosen the knot in his tongue so people would understand him.",
   "segments":[[20,25,28]]},
  {"id":"musa-harun-fear","title":"We fear he will transgress","theme":"Protection",
   "who":"Prophet Musa and his brother Harun",
   "situation":"Sent together to Pharaoh, they confided their fear that he would strike at them or rage against them — and God reassured them that He was with them, hearing and seeing.",
   "segments":[[20,45,45]]},
  {"id":"increase-knowledge","title":"Increase me in knowledge","theme":"Knowledge",
   "who":"The Prophet Muhammad — and every seeker",
   "situation":"Taught directly to the Prophet, this is the one thing the Qur'an tells him to ask for more of: knowledge. It has become the seeker's prayer for learning.",
   "segments":[[20,114,114]]},
  {"id":"ayyub-affliction","title":"Adversity has touched me","theme":"Hardship",
   "who":"Prophet Ayyub (Job)",
   "situation":"After long years of illness and loss borne with patience, he turned to God with gentle, uncomplaining words — and God restored him and removed his suffering.",
   "segments":[[21,83,83]]},
  {"id":"yunus-whale","title":"There is no god but You","theme":"Distress",
   "who":"Prophet Yunus (Dhun-Nun)",
   "situation":"Swallowed by the great fish, in the layered darkness of the sea, he called out this prayer of God's oneness and his own wrongdoing — and was delivered. The Prophet said no distressed believer prays it without being answered.",
   "segments":[[21,87,87]]},
  {"id":"zakariya-not-alone","title":"Do not leave me childless","theme":"Family",
   "who":"Prophet Zakariya",
   "situation":"In old age and without an heir, he called upon God privately, asking not to be left alone and affirming that God is the best of inheritors.",
   "segments":[[21,89,89]]},
  {"id":"nuh-landing","title":"A blessed landing place","theme":"Journey",
   "who":"Prophet Nuh",
   "situation":"As he boarded the Ark with the believers, he asked God for a blessed place to come to rest, acknowledging Him as the best to bring people safely ashore.",
   "segments":[[23,29,29]]},
  {"id":"not-among-wrongdoers","title":"Do not place me among the wrongdoers","theme":"Protection",
   "who":"The Prophet Muhammad",
   "situation":"Taught to seek refuge, should punishment come upon a rejecting people, from being counted among the wrongdoers.",
   "segments":[[23,94,94]]},
  {"id":"refuge-whispers","title":"Refuge from the whispers of devils","theme":"Protection",
   "who":"The Prophet Muhammad",
   "situation":"A prayer to seek God's protection from the incitements of the devils and even from their mere presence around a person.",
   "segments":[[23,97,98]]},
  {"id":"mocked-believers","title":"Forgive us, You are the best of the merciful","theme":"Forgiveness",
   "who":"The believers who were ridiculed in the world",
   "situation":"A group of believers were mocked and laughed at for their faith; their humble prayer for forgiveness and mercy is recalled on the Day of Judgement.",
   "segments":[[23,109,109]]},
  {"id":"close-muminun","title":"Forgive and have mercy","theme":"Forgiveness",
   "who":"Taught at the close of Surah al-Mu'minun",
   "situation":"The final verse of the surah teaches this concise prayer for forgiveness and mercy, affirming God as the best of those who show mercy.",
   "segments":[[23,118,118]]},
  {"id":"ibad-rahman-hell","title":"Avert from us the punishment of Hell","theme":"Hereafter",
   "who":"The servants of the Most Merciful (Ibad ar-Rahman)",
   "situation":"Among the qualities of God's true servants is that they fear the Fire and earnestly ask God to turn its lasting punishment away from them.",
   "segments":[[25,65,66]]},
  {"id":"comfort-eyes","title":"Comfort of our eyes","theme":"Family",
   "who":"The servants of the Most Merciful (Ibad ar-Rahman)",
   "situation":"They pray for righteous spouses and children who will be a joy to behold, and to be made leaders for those who are mindful of God.",
   "segments":[[25,74,74]]},
  {"id":"sulayman-grateful","title":"Enable me to be grateful","theme":"Gratitude",
   "who":"Prophet Sulayman",
   "situation":"When he overheard and understood an ant warning its colony, he smiled and asked God to inspire him to be thankful for such favours and to act righteously.",
   "segments":[[27,19,19]]},
  {"id":"musa-wronged","title":"I have wronged myself, forgive me","theme":"Repentance",
   "who":"Prophet Musa",
   "situation":"After he struck and unintentionally killed an Egyptian, Musa immediately admitted his fault to God and sought forgiveness, which was granted.",
   "segments":[[28,16,16]]},
  {"id":"musa-flee","title":"Save me from the wrongdoers","theme":"Rescue",
   "who":"Prophet Musa",
   "situation":"Warned that the chiefs were plotting to kill him, he fled Egypt in fear, praying to be delivered from the unjust people.",
   "segments":[[28,21,21]]},
  {"id":"musa-need","title":"I am in need of any good You send","theme":"Need",
   "who":"Prophet Musa",
   "situation":"Arriving exhausted in Madyan, he watered the flocks of two women, then withdrew to the shade and admitted his utter need of whatever good God would provide.",
   "segments":[[28,24,24]]},
  {"id":"lut-corrupt","title":"Support me against the corrupt","theme":"Justice",
   "who":"Prophet Lut",
   "situation":"Faced with a people steeped in open wickedness who rejected him, he asked God to help him against the corrupting people.",
   "segments":[[29,30,30]]},
  {"id":"ibrahim-righteous-son","title":"Grant me a righteous child","theme":"Family",
   "who":"Prophet Ibrahim",
   "situation":"Having left his people for the sake of God, alone and without a child, he prayed for righteous offspring — and was given the forbearing Ismail.",
   "segments":[[37,100,100]]},
  {"id":"angels-throne","title":"The angels' prayer for the believers","theme":"Forgiveness",
   "who":"The angels who bear the Throne",
   "situation":"The mightiest angels, who carry and surround the Throne of God, are described constantly asking forgiveness for the believers and praying for their entry into Paradise with their righteous families.",
   "segments":[[40,7,9]]},
  {"id":"forty-grateful","title":"Make me grateful for Your favour","theme":"Gratitude",
   "who":"The believer who reaches maturity at forty",
   "situation":"On reaching full strength and forty years, the grateful believer asks to be inspired to thank God for His favours upon him and his parents, and to be granted righteous offspring.",
   "segments":[[46,15,15]]},
  {"id":"later-believers","title":"Forgive us and our brothers before us","theme":"Brotherhood",
   "who":"The believers of every later generation",
   "situation":"Those who came after the first believers pray for forgiveness for themselves and for those who preceded them in faith, asking God to leave no rancour in their hearts.",
   "segments":[[59,10,10]]},
  {"id":"ibrahim-reliance","title":"Upon You we rely","theme":"Reliance",
   "who":"Following the example of Prophet Ibrahim",
   "situation":"Held up as a beautiful example, Ibrahim and those with him declared their reliance and repentance to God and asked not to be made a trial in the hands of the disbelievers.",
   "segments":[[60,4,5]]},
  {"id":"perfect-our-light","title":"Perfect our light for us","theme":"Repentance",
   "who":"The believers, in the call to sincere repentance",
   "situation":"Alongside the command to turn to God in sincere repentance (tawbatan nasuha), the believers pray on the Day of Judgement that God complete their light and forgive them.",
   "segments":[[66,8,8]]},
  {"id":"asiya-house","title":"Build me a house with You in Paradise","theme":"Hereafter",
   "who":"Asiya, the wife of Pharaoh",
   "situation":"Held up as an example for all believers, she clung to her faith under her husband's torture and prayed for a home near God in Paradise and rescue from Pharaoh and his deeds.",
   "segments":[[66,11,11]]},
  {"id":"nuh-forgive-house","title":"Forgive me, my parents, and the believers","theme":"Family",
   "who":"Prophet Nuh",
   "situation":"At the close of his long mission, Nuh prayed for forgiveness for himself, his parents, everyone who entered his house as a believer, and all believing men and women.",
   "segments":[[71,28,28]]},
]

# Collapse the fine-grained themes into a small set for the UI filter.
THEME_MAP = {
  "Forgiveness":"Forgiveness", "Repentance":"Forgiveness", "Mercy":"Forgiveness",
  "Family":"Family & parents", "Parents":"Family & parents",
  "Hardship":"Hardship & distress", "Distress":"Hardship & distress",
  "Rescue":"Hardship & distress", "Need":"Hardship & distress",
  "Reliance":"Trust & gratitude", "Gratitude":"Trust & gratitude", "Humility":"Trust & gratitude",
  "Steadfastness":"Faith & firmness", "Faith":"Faith & firmness",
  "Sincerity":"Faith & firmness", "Confidence":"Faith & firmness", "Devotion":"Faith & firmness",
  "Protection":"Protection & justice", "Refuge":"Protection & justice", "Justice":"Protection & justice",
  "Hereafter":"Hereafter & reflection", "Reflection":"Hereafter & reflection", "Balance":"Hereafter & reflection",
  "Knowledge":"Guidance & provision", "Provision":"Guidance & provision",
  "Journey":"Guidance & provision", "Brotherhood":"Guidance & provision",
}
for _d in DUAS:
    _d["theme"] = THEME_MAP.get(_d["theme"], _d["theme"])

# ---- load surah files and pull arabic + translation ----
SURAH_CACHE = {}
def load_surah(n):
    if n not in SURAH_CACHE:
        path = f"docs/data/surah_{n}.json"
        SURAH_CACHE[n] = json.load(open(path, encoding="utf-8"))
    return SURAH_CACHE[n]

def get_ayah(surah, num):
    d = load_surah(surah)
    for a in d["ayahs"]:
        if a.get("ayah") == num:
            return a
    raise KeyError(f"{surah}:{num} not found")

out = []
problems = []
for dua in DUAS:
    arabic_parts = []
    trans_parts = []
    ref_strs = []
    for (surah, start, end) in dua["segments"]:
        nums = list(range(start, end + 1))
        for n in nums:
            a = get_ayah(surah, n)
            ar = (a.get("arabic") or "").strip()
            tr = (a.get("translation") or "").strip()
            if not ar or not tr:
                problems.append(f"{dua['id']} {surah}:{n} missing arabic/translation")
            arabic_parts.append(ar)
            trans_parts.append(f"({n}) {tr}" if len(nums) > 1 or len(dua["segments"]) > 1 else tr)
        if start == end:
            ref_strs.append(f"{surah}:{start}")
        else:
            ref_strs.append(f"{surah}:{start}-{end}")
    first = dua["segments"][0]
    out.append({
        "id": dua["id"],
        "title": dua["title"],
        "theme": dua["theme"],
        "who": dua["who"],
        "situation": dua["situation"],
        "ref": ", ".join(ref_strs),
        "surah": first[0],
        "ayah": first[1],
        "arabic": "  ".join(arabic_parts),
        "translation": " ".join(trans_parts),
    })

os.makedirs("docs/data", exist_ok=True)
json.dump(out, open("docs/data/duas.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

themes = {}
for d in out:
    themes[d["theme"]] = themes.get(d["theme"], 0) + 1
print(f"Wrote {len(out)} duas to docs/data/duas.json")
print("Themes:", json.dumps(themes, ensure_ascii=False))
if problems:
    print("PROBLEMS:")
    for p in problems:
        print("  ", p)
else:
    print("All arabic/translation present.")
