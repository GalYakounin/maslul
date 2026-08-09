"""מפצל CSV כתובות לחלקים בגודל שממשק הייבוא של Supabase מעכל.

השורות ממוינות מהיישוב הגדול לקטן לפני הפיצול, כך שהחלקים הראשונים
מכסים את הערים הגדולות. אפשר לייבא כמה חלקים ולעצור — הכיסוי יורד
בהדרגה במקום להיחתך באמצע עיר.

--skip-city מדלג על יישובים שכבר טעונים, כדי לא לייצר כפילויות.

שימוש:
    python scripts/split_addresses_csv.py <input.csv> <out_dir> [--rows 40000] [--skip-city "באר שבע"]
"""

import csv
import collections
import os
import sys

HEADER = ["city", "street", "house_number", "neighbourhood", "lat", "lng"]


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 1

    src, out_dir = args[0], args[1]
    rows_per_chunk = 40000
    skip: set[str] = set()

    i = 2
    while i < len(args):
        if args[i] == "--rows":
            rows_per_chunk = int(args[i + 1])
            i += 2
        elif args[i] == "--skip-city":
            skip.add(args[i + 1])
            i += 2
        else:
            print(f"ארגומנט לא מוכר: {args[i]}")
            return 1

    with open(src, encoding="utf-8") as handle:
        rows = [r for r in csv.DictReader(handle) if r["city"] not in skip]

    sizes = collections.Counter(r["city"] for r in rows)
    rows.sort(key=lambda r: (-sizes[r["city"]], r["city"]))

    os.makedirs(out_dir, exist_ok=True)
    chunks = (len(rows) + rows_per_chunk - 1) // rows_per_chunk

    for index in range(chunks):
        part = rows[index * rows_per_chunk : (index + 1) * rows_per_chunk]
        path = os.path.join(out_dir, f"addresses_{index + 1:02d}.csv")
        with open(path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=HEADER)
            writer.writeheader()
            writer.writerows(part)

        cities = collections.Counter(r["city"] for r in part)
        top = ", ".join(city for city, _ in cities.most_common(3))
        mb = os.path.getsize(path) / (1024 * 1024)
        print(f"{os.path.basename(path)}  {len(part):>6,} שורות  {mb:5.1f}MB  ({top})")

    if skip:
        print(f"\nדולגו יישובים שכבר טעונים: {', '.join(sorted(skip))}")
    print(f"סך הכל {len(rows):,} שורות ב-{chunks} קבצים")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
