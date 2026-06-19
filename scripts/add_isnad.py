"""Add isnad chain arrays to all hadith in hadith_index.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
f = ROOT / "docs" / "data" / "hadith_index.json"
data = json.loads(f.read_text(encoding="utf-8"))

ISNAD = {
  "h001": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Sa'id ibn al-Mu'alla (RA)", "type": "sahabi", "id": "abu-said-ibn-al-mualla"},
    {"name": "Hafs ibn Asim (Tabi'i)", "type": "tabi"},
    {"name": "Shu'bah ibn al-Hajjaj (d. 160 AH)", "type": "muhaddith"},
    {"name": "Sahih al-Bukhari · No. 4703", "type": "book"}
  ],
  "h002": [
    {"name": "Allah (Hadith Qudsi)", "type": "source"},
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Hurairah (RA)", "type": "sahabi", "id": "abu-hurairah"},
    {"name": "al-A'la ibn Abd al-Rahman (d. 132 AH)", "type": "tabi"},
    {"name": "Malik ibn Anas, Imam (d. 179 AH)", "type": "muhaddith"},
    {"name": "Sahih Muslim · No. 395", "type": "book"}
  ],
  "h003": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Sa'id al-Khudri (RA)", "type": "sahabi", "id": "abu-said-al-khudri"},
    {"name": "Ibn Abi Mulaykah (d. 117 AH)", "type": "tabi"},
    {"name": "Abu al-Amis al-Shaybani (d. 154 AH)", "type": "muhaddith"},
    {"name": "Sahih al-Bukhari · No. 5736", "type": "book"}
  ],
  "h004": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Hurairah (RA)", "type": "sahabi", "id": "abu-hurairah"},
    {"name": "Ibn Shihab al-Zuhri (d. 124 AH)", "type": "tabi"},
    {"name": "Malik ibn Anas, Imam (d. 179 AH)", "type": "muhaddith"},
    {"name": "Sahih al-Bukhari · No. 756", "type": "book"}
  ],
  "h005": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Hurairah (RA)", "type": "sahabi", "id": "abu-hurairah"},
    {"name": "Abu Salih al-Samman (d. 101 AH)", "type": "tabi"},
    {"name": "Yahya ibn Sa'id al-Qattan (d. 198 AH)", "type": "muhaddith"},
    {"name": "Sahih al-Bukhari · No. 780", "type": "book"}
  ],
  "h010": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Ubayy ibn Ka'b (RA)", "type": "sahabi", "id": "ubayy-ibn-kab"},
    {"name": "Zirr ibn Hubaysh (d. 82 AH)", "type": "tabi"},
    {"name": "Sulayman al-A'mash (d. 148 AH)", "type": "tabi"},
    {"name": "Sufyan al-Thawri (d. 161 AH)", "type": "muhaddith"},
    {"name": "Waki' ibn al-Jarrah (d. 197 AH)", "type": "muhaddith"},
    {"name": "Sahih Muslim · No. 810", "type": "book"}
  ],
  "h011": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Hurairah (RA)", "type": "sahabi", "id": "abu-hurairah"},
    {"name": "'Ata ibn Abi Rabah (d. 114 AH)", "type": "tabi"},
    {"name": "Ayyub al-Sakhtiyani (d. 131 AH)", "type": "tabi"},
    {"name": "Sahih al-Bukhari · No. 2311", "type": "book"}
  ],
  "h012": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Umamah al-Bahili (RA)", "type": "sahabi", "id": "abu-umamah-al-bahili"},
    {"name": "Muslim ibn Mishkam (Tabi'i)", "type": "tabi"},
    {"name": "Khalid ibn Ma'dan (d. 103 AH)", "type": "tabi"},
    {"name": "al-Nasai / al-Silsilah al-Sahihah · 972", "type": "book"}
  ],
  "h020": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Hurairah (RA)", "type": "sahabi", "id": "abu-hurairah"},
    {"name": "Abu Salama ibn Abd al-Rahman (d. 94 AH)", "type": "tabi"},
    {"name": "Suhayl ibn Abi Salih (d. 138 AH)", "type": "tabi"},
    {"name": "Sahih Muslim · No. 812", "type": "book"}
  ],
  "h021": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Anas ibn Malik (RA)", "type": "sahabi", "id": "anas-ibn-malik"},
    {"name": "Yahya ibn Sa'id al-Ansari (d. 143 AH)", "type": "tabi"},
    {"name": "Bishr ibn al-Mufaddal (d. 186 AH)", "type": "muhaddith"},
    {"name": "Sahih al-Bukhari · No. 7375", "type": "book"}
  ],
  "h022": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Aisha (RA)", "type": "sahabi", "id": "aisha-bint-abi-bakr"},
    {"name": "Masruq ibn al-Ajda' (d. 63 AH)", "type": "tabi"},
    {"name": "Ibn Shihab al-Zuhri (d. 124 AH)", "type": "tabi"},
    {"name": "Sahih al-Bukhari · No. 7374", "type": "book"}
  ],
  "h030": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Umar ibn al-Khattab (RA)", "type": "sahabi", "id": "umar-ibn-al-khattab"},
    {"name": "Abu 'Ubaydah ibn Hammam (Tabi'i)", "type": "tabi"},
    {"name": "Musnad Ahmad · No. 261", "type": "book"}
  ],
  "h031": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Abu Dharr al-Ghifari (RA)", "type": "sahabi", "id": "abu-dharr-al-ghifari"},
    {"name": "Abu Muslim al-Khawlani (d. 62 AH)", "type": "tabi"},
    {"name": "al-Tabarani / al-Silsilah al-Sahihah · 3410", "type": "book"}
  ],
  "h040": [
    {"name": "Prophet Muhammad", "type": "prophet", "id": "prophet-muhammad"},
    {"name": "Ibn Abbas (RA)", "type": "sahabi", "id": "ibn-abbas"},
    {"name": "Ikrimah (d. 105 AH)", "type": "tabi"},
    {"name": "al-Hakim · al-Mustadrak 1/544", "type": "book"}
  ]
}

for hid, chain in ISNAD.items():
    if hid in data:
        data[hid]["isnad"] = chain

f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Done - isnad added to {len(ISNAD)} hadith")
