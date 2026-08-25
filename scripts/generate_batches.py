"""מייצר מערך אצוות מדומה למדידת קו הבסיס.

*** הנתונים האלה מדומים. אין פיילוט מאחוריהם. ***
הכתובות אמיתיות והמרחקים ביניהן אמיתיים; הביקוש עצמו מוגרל.

── למה בכלל מודדים על נתונים מדומים ──
שלב 5 (פיילוט אמיתי) חסום על מציאת מסעדה. בלי קו בסיס אי אפשר לומר
אם האופטימיזר עוזר, וכל שלב 6 הופך להצהרה במקום למדידה. מערך מדומה
נותן תשובה לשאלה אחת בלבד: **האם סדר מינימום-המתנה שונה מהותית ממה
שבעל עסק היה עושה, על גיאוגרפיה אמיתית.** הוא אינו אומר דבר על
האם בעל עסק ישתמש במערכת, על מהירות ההזנה בעומס, או על התנהגות שליחים.

── דגימת יעדים ──
היעדים נדגמים אחידה מתוך הכתובות האמיתיות ברדיוס המסירה. זה נראה
תמים אבל הוא מדויק: לכל בניין יש שורה במאגר, ולכן דגימה אחידה על
שורות היא דגימה **פרופורציונית לצפיפות הבנייה**. שכונה צפופה מקבלת
יותר הזמנות מאליה, בלי שנמציא משקלות.

── שני סוגי אצוות, ובכוונה ──
"sector" — בעל עסק שמקבץ הזמנות שנוסעות לאותו אזור. זה מה שאדם סביר
עושה, וזה הרוב.
"mixed"  — האצווה מורכבת ממה שהיה מוכן, בלי התחשבות בכיוון. קורה
בעומס, וקורה כשפשוט אין ממה לבחור.
מדווחים אותם בנפרד: שיפור ממוצע על תערובת של השניים מסתיר את השאלה
המעניינת, שהיא כמה השיפור תלוי בטיב ההרכבה.

שימוש:
    python scripts/generate_batches.py [--batches 500] [--seed 20260825]
    → כותב data/batches.json
"""

import csv
import json
import math
import os
import random
import sys
from datetime import datetime, timezone

CSV_PATH = os.path.join("data", "addresses_beer_sheva.csv")
OUT_PATH = os.path.join("data", "batches.json")

# אותה תיבה תוחמת כמו ב-build_demo_seed.py: 19 שורות במאגר מסומנות
# "באר שבע" ויושבות במרכז הארץ. קואורדינטה במרחק 100 ק״מ הייתה
# מייצרת אצווה חסרת פשר ומרעילה את המדידה.
BBOX = (31.20, 31.32, 34.72, 34.86)

# המסעדה — זהה ל-build_demo_seed.py כדי ששני המערכים יתארו אותו עסק.
RESTAURANT_STREET = "סמילנסקי"

DELIVERY_RADIUS_KM = 5.0

# batch_max_size ברירת המחדל בסכימה היא 4. אצוות של 3 עד 5.
BATCH_SIZES = [3, 3, 4, 4, 4, 5]

# batch_max_wait_minutes ברירת המחדל היא 8.
MAX_WAIT_MINUTES = 8

# רוב האצוות מורכבות בהיגיון גיאוגרפי; חלקן לא.
SECTOR_FRACTION = 0.7

# רדיוס האשכול באצוות מסוג sector — כמה "מרוכזת" הרכבה סבירה.
SECTOR_RADIUS_KM = 1.5


def haversine_km(a_lat, a_lng, b_lat, b_lng):
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def load_addresses():
    rows = []
    with open(CSV_PATH, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if not r["lat"] or not r["lng"]:
                continue
            lat, lng = float(r["lat"]), float(r["lng"])
            if not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lng <= BBOX[3]):
                continue
            rows.append({
                "label": f"{r['street'].strip()} {r['house_number'].strip()}",
                "lat": lat,
                "lng": lng,
            })
    return rows


def main() -> int:
    args = sys.argv[1:]
    n_batches, seed = 500, 20260825
    sizes, out_path = list(BATCH_SIZES), OUT_PATH
    i = 0
    while i < len(args):
        if args[i] == "--batches":
            n_batches = int(args[i + 1]); i += 2
        elif args[i] == "--seed":
            seed = int(args[i + 1]); i += 2
        elif args[i] == "--sizes":
            # לניתוח רגישות: האם השיפור גדל עם גודל האצווה
            sizes = [int(x) for x in args[i + 1].split(",")]; i += 2
        elif args[i] == "--out":
            out_path = args[i + 1]; i += 2
        else:
            print(f"ארגומנט לא מוכר: {args[i]}"); return 1

    if not os.path.exists(CSV_PATH):
        print(f"לא נמצא {CSV_PATH}", file=sys.stderr)
        return 1

    rows = load_addresses()
    depot_options = [a for a in rows if a["label"].startswith(RESTAURANT_STREET)]
    if not depot_options:
        print(f"רחוב המסעדה '{RESTAURANT_STREET}' לא נמצא", file=sys.stderr)
        return 1
    depot = sorted(depot_options, key=lambda a: a["label"])[0]

    candidates = [
        a for a in rows
        if 0.1 < haversine_km(depot["lat"], depot["lng"], a["lat"], a["lng"]) <= DELIVERY_RADIUS_KM
    ]
    if len(candidates) < 100:
        print("פחות מדי כתובות ברדיוס המסירה", file=sys.stderr)
        return 1

    rng = random.Random(seed)
    batches = []

    for batch_id in range(1, n_batches + 1):
        size = rng.choice(sizes)
        kind = "sector" if rng.random() < SECTOR_FRACTION else "mixed"

        if kind == "sector":
            # מתחילים מהזמנה אחת ומצרפים אליה הזמנות מאותו אזור.
            seed_stop = rng.choice(candidates)
            near = [
                a for a in candidates
                if haversine_km(seed_stop["lat"], seed_stop["lng"], a["lat"], a["lng"])
                <= SECTOR_RADIUS_KM
            ]
            # שכונה דלילה עלולה לא לספק מספיק שכנים; אז האצווה מתרחבת
            # מאליה, וזה מצב אמיתי ולא תקלה.
            pool = near if len(near) >= size else candidates
            stops = rng.sample(pool, size)
        else:
            stops = rng.sample(candidates, size)

        # זמני הכנה: כל מנה מוכנה בנקודה כלשהי בחלון ההמתנה, והשליח
        # יוצא כשהאחרונה מוכנה. ההיסט הוא כמה זמן כל מנה כבר חיכתה
        # ברגע היציאה — הקבוע שמצטרף לזמן הנסיעה בפונקציית המטרה.
        ready = [rng.uniform(0, MAX_WAIT_MINUTES * 60) for _ in stops]
        dispatch = max(ready)

        batches.append({
            "id": batch_id,
            "kind": kind,
            "stops": [
                {
                    "label": s["label"],
                    "lat": s["lat"],
                    "lng": s["lng"],
                    "readyOffsetSeconds": round(dispatch - r, 1),
                }
                for s, r in zip(stops, ready)
            ],
        })

    payload = {
        "note": "SIMULATED DEMAND. Addresses are real; orders are generated.",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": seed,
        "restaurant": {"label": depot["label"], "lat": depot["lat"], "lng": depot["lng"]},
        "params": {
            "deliveryRadiusKm": DELIVERY_RADIUS_KM,
            "batchSizes": sizes,
            "maxWaitMinutes": MAX_WAIT_MINUTES,
            "sectorFraction": SECTOR_FRACTION,
            "sectorRadiusKm": SECTOR_RADIUS_KM,
            "addressPool": len(candidates),
        },
        "batches": batches,
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)

    sector = sum(1 for b in batches if b["kind"] == "sector")
    stop_counts = [len(b["stops"]) for b in batches]
    print(f"נכתב {out_path}")
    print(f"  מסעדה: {depot['label']}")
    print(f"  כתובות ברדיוס {DELIVERY_RADIUS_KM} ק\"מ: {len(candidates):,}")
    print(f"  אצוות: {len(batches)}  ({sector} sector, {len(batches) - sector} mixed)")
    print(f"  עצירות: {sum(stop_counts)}  (ממוצע {sum(stop_counts) / len(stop_counts):.2f} לאצווה)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
