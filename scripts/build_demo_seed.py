"""מייצר את סקריפט ה-SQL שממלא את חשבון הדמו בנתונים.

למה סקריפט שמייצר SQL, ולא SQL כתוב ביד: הכתובות והקואורדינטות
נלקחות מ-data/addresses_beer_sheva.csv — אותו מאגר שהאפליקציה עצמה
מחפשת בו. כך נקודות הדמו הן בניינים אמיתיים בבאר שבע, ולא נקודות
מומצאות שנראות נכון על המפה ומתנהגות לא נכון בחישוב מסלול.

הבחירה דטרמיניסטית: לכל "משבצת" של כיוון ומרחק מהמסעדה נבחרת הכתובת
האמיתית הקרובה ביותר לנקודת היעד. הרצה חוזרת מחזירה בדיוק אותן כתובות,
כך שצילומי מסך ותיעוד לא מתיישנים.

*** כל הנתונים שנוצרים כאן מדומים. שמות הלקוחות והטלפונים אינם של אף
    אדם אמיתי. רק הכתובות אמיתיות, והן נבחרו כדי שהמרחקים יהיו נכונים. ***

שימוש:
    python scripts/build_demo_seed.py
    → כותב supabase/seed/demo_seed.sql
"""

import csv
import math
import os
import sys

CSV_PATH = os.path.join("data", "addresses_beer_sheva.csv")
OUT_PATH = os.path.join("supabase", "seed", "demo_seed.sql")

# ═══════════════ תיבה תוחמת של באר שבע ═══════════════
# 19 שורות במאגר מסומנות "באר שבע" אך יושבות במרכז הארץ — שמות רחוב
# שקיימים בכמה ערים ("נעמי שמר", "יפה ירקוני") שקיבלו עיר שגויה במקור.
# הן 0.09% מהשורות, אבל קואורדינטה במרחק 100 ק״מ הורסת מסלול שלם,
# ובדמו היא פשוט תיראה כבאג. מסננים אותן כאן.
BBOX = (31.20, 31.32, 34.72, 34.86)  # lat_min, lat_max, lng_min, lng_max

# ═══════════════ המסעדה ═══════════════
# העיר העתיקה — שם יושבות המסעדות בבאר שבע בפועל.
RESTAURANT_STREET = "סמילנסקי"

# ═══════════════ פריסת נקודות המשלוח ═══════════════
# (אזימוט במעלות, מרחק בק״מ). נבחרו כדי שהאצווה תהיה מעניינת לאלגוריתם:
# יש אשכול קרוב ויש שתי נקודות רחוקות. בפריסה אחידה כל סדר נראה סביר,
# וההבדל בין מינימום המתנה ל-TSP לא היה מתגלה לעין.
SLOTS = [
    (20, 0.7), (55, 1.1), (95, 0.9), (140, 1.6),
    (190, 2.3), (225, 1.2), (265, 3.1), (300, 1.8),
    (340, 2.6), (10, 4.2), (120, 3.6), (200, 0.6),
]

# שמות וטלפונים מדומים במפורש. הטלפונים בפורמט שnormalizePhone מייצר
# (05XXXXXXXX), אחרת חיפוש "לקוח חוזר" בטופס לא ימצא אותם.
CUSTOMERS = [
    ("דנה לוי", "0500000101"),
    ("יוסי כהן", "0500000102"),
    ("מירב אברהם", "0500000103"),
    ("איתי שרון", "0500000104"),
    ("נועה בר", "0500000105"),
    ("רון מזרחי", "0500000106"),
    ("שירה פרץ", "0500000107"),
    ("עומר דהן", "0500000108"),
    ("טל אזולאי", "0500000109"),
    ("ליאור חדד", "0500000110"),
    ("מאיה גל", "0500000111"),
    ("אורי נחום", "0500000112"),
]

ORDERS = [
    "פיצה משפחתית + שתייה", "2 המבורגר, צ׳יפס", "מרק עדשים, סלט",
    "שווארמה בלאפה", "פסטה ברוטב שמנת", "סושי 16 יח׳",
    "חומוס פול + פיתות", "סלט יווני, לחם", "שניצל בבאגט",
    "פאד תאי + אגרול", "כריך טונה, קפה", "3 מנות ילדים",
]


def haversine_km(a_lat, a_lng, b_lat, b_lng):
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def offset(lat, lng, bearing_deg, distance_km):
    """נקודת יעד במרחק ובכיוון נתונים. משמשת רק כדי לחפש לידה כתובת אמיתית."""
    r = 6371.0
    b = math.radians(bearing_deg)
    p1 = math.radians(lat)
    l1 = math.radians(lng)
    p2 = math.asin(math.sin(p1) * math.cos(distance_km / r)
                   + math.cos(p1) * math.sin(distance_km / r) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(distance_km / r) * math.cos(p1),
                         math.cos(distance_km / r) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), math.degrees(l2)


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
                "street": r["street"].strip(),
                "house": r["house_number"].strip(),
                "lat": lat,
                "lng": lng,
            })
    return rows


def q(text):
    """מצטט מחרוזת ל-SQL. שמות רחוב ישראליים מכילים גרש."""
    return "'" + text.replace("'", "''") + "'"


def label(a):
    return f"{a['street']} {a['house']}, באר שבע"


def main():
    if not os.path.exists(CSV_PATH):
        print(f"לא נמצא {CSV_PATH}", file=sys.stderr)
        return 1

    rows = load_addresses()
    if not rows:
        print("לא נמצאו כתובות בתוך התיבה התוחמת", file=sys.stderr)
        return 1

    # ═══ המסעדה ═══
    candidates = [a for a in rows if a["street"] == RESTAURANT_STREET]
    if not candidates:
        print(f"רחוב המסעדה '{RESTAURANT_STREET}' לא נמצא", file=sys.stderr)
        return 1
    depot = sorted(candidates, key=lambda a: (a["house"], a["lat"]))[0]

    # ═══ נקודות המשלוח ═══
    picked = []
    used = set()
    for bearing, dist in SLOTS:
        t_lat, t_lng = offset(depot["lat"], depot["lng"], bearing, dist)
        best = None
        for a in rows:
            key = (a["street"], a["house"])
            if key in used:
                continue
            d = haversine_km(t_lat, t_lng, a["lat"], a["lng"])
            if best is None or d < best[0]:
                best = (d, a)
        used.add((best[1]["street"], best[1]["house"]))
        picked.append(best[1])

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as fh:
        write_sql(fh, depot, picked)

    print(f"נכתב {OUT_PATH}")
    print(f"מסעדה: {label(depot)}")
    for i, a in enumerate(picked):
        d = haversine_km(depot["lat"], depot["lng"], a["lat"], a["lng"])
        print(f"  {i + 1:2d}. {label(a):<38} {d:.2f} ק״מ")
    return 0


def write_sql(fh, depot, picked):
    w = fh.write
    w("""-- ═══════════════════════════════════════════════════════════════
-- נתוני דמו למסלול — נוצר על ידי scripts/build_demo_seed.py
-- אל תערכו קובץ זה ידנית; ערכו את הסקריפט והריצו אותו מחדש.
--
-- *** כל הנתונים כאן מדומים. ***
-- שמות הלקוחות והטלפונים אינם של אף אדם אמיתי. הכתובות אמיתיות
-- ונלקחו ממאגר הכתובות הפתוח, כדי שהמרחקים יהיו נכונים.
--
-- ── לפני ההרצה ──────────────────────────────────────────────────
-- 1. הירשמו דרך הדשבורד כעסק, ודרך אפליקציית השליח כשליח.
-- 2. עדכנו את שני האימיילים בבלוק שלמטה.
-- 3. הדביקו את כל הקובץ ל-SQL editor של Supabase והריצו.
--
-- הסקריפט אידמפוטנטי: הרצה חוזרת מוחקת את נתוני הדמו הקודמים ובונה
-- אותם מחדש. זו גם דרך לאפס את הדמו אחרי שמישהו התנסה בו.
-- הוא נוגע אך ורק בעסק של אימייל הדמו. חשבונות אחרים אינם מושפעים.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  -- ── עדכנו את שני אלה ──
  v_biz_email     text := 'demo@maslul.local';
  v_courier_email text := 'courier@maslul.local';

  v_biz_user  uuid;
  v_courier   uuid;
  v_business  uuid;
  v_route     uuid;
  v_now       timestamptz := now();
begin
  select id into v_biz_user from auth.users where email = v_biz_email;
  if v_biz_user is null then
    raise exception 'לא נמצא משתמש עם האימייל %. הירשמו קודם דרך הדשבורד.', v_biz_email;
  end if;

  select id into v_courier from auth.users where email = v_courier_email;
  if v_courier is null then
    raise exception 'לא נמצא שליח עם האימייל %. הירשמו קודם דרך אפליקציית השליח.', v_courier_email;
  end if;

  select business_id into v_business from business_members where user_id = v_biz_user limit 1;
  if v_business is null then
    raise exception 'המשתמש % אינו משויך לעסק. נרשמתם כשליח במקום כעסק?', v_biz_email;
  end if;

  -- ═══════════════ המסעדה ═══════════════
""")
    w(f"""  update businesses set
    name    = 'פלאפל הנגב (דמו)',
    address = {q(label(depot))},
    lat     = {depot['lat']:.6f},
    lng     = {depot['lng']:.6f},
    phone   = '0500000100'
  where business_id = v_business;

""")
    w("""  -- ═══════════════ ניקוי הרצה קודמת ═══════════════
  -- route_stops נמחקות ב-cascade עם המסלולים.
  delete from routes     where business_id = v_business;
  delete from deliveries where business_id = v_business;
  delete from shifts     where business_id = v_business;

  -- ═══════════════ משמרת פעילה ═══════════════
  -- one_active_shift_per_courier מונע שתי משמרות פעילות לאותו שליח,
  -- ולכן סוגרים משמרת קודמת אצל עסק אחר לפני הפתיחה.
  update shifts set status = 'ended', ended_at = v_now
  where courier_id = v_courier and status = 'active';

  update couriers set name = 'אבי (שליח דמו)', phone = '0500000200'
  where courier_id = v_courier;

  insert into shifts (courier_id, business_id, status, invited_at, accepted_at)
  values (v_courier, v_business, 'active', v_now - interval '3 hours', v_now - interval '3 hours');

""")

    # ── תפקידי המשלוחים ─────────────────────────────────────────
    # 0-3   : אצווה פעילה על מסלול ששוגר (2 נמסרו, 2 בדרך)
    # 4-7   : פתוחים ומוכנים — המועמדים למסלול הבא
    # 8     : חדש, טרם יצא מהמטבח
    # 9     : מוכן אך בלי קואורדינטות → המונה על לשונית המפה
    # 10-11 : היסטוריה שנמסרה, ממסלול שנסגר
    w("  -- ═══════════════ משלוחים ═══════════════\n")
    w("  -- כל השורות מדומות. ראו הכותרת.\n")

    def delivery(i, status, ready_min, extra_cols="", extra_vals="", coords=True):
        a = picked[i]
        name, phone = CUSTOMERS[i]
        lat = f"{a['lat']:.6f}" if coords else "null"
        lng = f"{a['lng']:.6f}" if coords else "null"
        # בלי קואורדינטות הסטטוס הוא pending — הצעה ברמת רחוב שממתינה
        # לאדם. זה מה שמדליק את המונה על לשונית המפה.
        geo = "'ok'" if coords else "'pending'"
        ready = "null" if ready_min is None else f"v_now - interval '{ready_min} minutes'"
        created_min = 25 if ready_min is None else ready_min + 25
        paid = "true" if i % 3 == 0 else "false"
        method = "'card_online'" if i % 3 == 0 else "'cash'"
        return (
            "  insert into deliveries (business_id, customer_name, customer_phone, address,\n"
            "    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,\n"
            f"    status, created_at, ready_at{extra_cols})\n"
            f"  values (v_business, {q(name)}, {q(phone)}, {q(label(a))},\n"
            f"    {q(ORDERS[i])}, {lat}, {lng}, {geo}, {6500 + i * 850}, {method}, {paid},\n"
            f"    '{status}', v_now - interval '{created_min} minutes', {ready}{extra_vals});\n\n"
        )

    # 0-3: על מסלול פעיל
    for i, (status, ready, delivered) in enumerate([
        ("delivered", 52, 21), ("delivered", 47, 12),
        ("picked_up", 44, None), ("picked_up", 41, None),
    ]):
        cols = ", picked_up_at" + (", delivered_at" if delivered else "")
        vals = ", v_now - interval '30 minutes'" + (
            f", v_now - interval '{delivered} minutes'" if delivered else "")
        w(delivery(i, status, ready, cols, vals))

    # 4-6: מוכנים, ומשובצים למסלול *טיוטה* למטה
    # 7: מוכן ופנוי, כדי שבונה-המסלולים לא יהיה ריק
    for i, ready in [(4, 14), (5, 11), (6, 7), (7, 4)]:
        w(delivery(i, "ready", ready))

    # 8: טרם מוכן
    w(delivery(8, "new", None))

    # 9: מוכן בלי מיקום — מדגים את המונה ואת הנעיצה הידנית
    w(delivery(9, "ready", 9, coords=False))

    # 10-11: היסטוריה
    for i, (ready, delivered) in [(10, (190, 158)), (11, (185, 149))]:
        w(delivery(i, "delivered", ready,
                   ", picked_up_at, delivered_at",
                   f", v_now - interval '170 minutes', v_now - interval '{delivered} minutes'"))

    # העצירות נבחרות לפי customer_phone ולא לפי סטטוס או זמן: הטלפונים
    # נקבעים כאן בסקריפט ולכן הם מזהה יציב, בעוד תנאי על סטטוס היה
    # מתפרק ברגע שמישהו ילחץ "נמסר" בדמו.
    active = ", ".join(q(CUSTOMERS[i][1]) for i in (0, 1, 2, 3))
    history = ", ".join(q(CUSTOMERS[i][1]) for i in (10, 11))

    # ═══ מסלול הטיוטה — הוא קיים כדי שהדמו יראה את שלב 6 ═══
    # כפתור "חשב סדר אופטימלי" מופיע רק בטיוטה, כי מסלול משוגר קופא.
    # בלי טיוטה בזרע, מבקר שנכנס לתשעים שניות לא יראה את הפיצ'ר
    # המרכזי של הפרויקט בכלל.
    #
    # הסדר ההתחלתי נקבע **מהרחוק לקרוב במכוון**. זה הסדר הגרוע ביותר
    # למינימום המתנה: הוא גורר את השליח לקצה ומשאיר שני לקוחות
    # לחכות לחזרה. כך הלחיצה על הכפתור מייצרת שיפור נראה לעין
    # במקום "לא היה מה לשפר".
    draft_order = sorted(
        (4, 5, 6),
        key=lambda i: -haversine_km(depot["lat"], depot["lng"], picked[i]["lat"], picked[i]["lng"]),
    )
    draft_stops = "\n".join(
        "  insert into route_stops (route_id, delivery_id, sequence)\n"
        f"  select v_route, d.delivery_id, {seq}\n"
        "  from deliveries d\n"
        f"  where d.business_id = v_business and d.customer_phone = {q(CUSTOMERS[i][1])};"
        for seq, i in enumerate(draft_order, start=1)
    )

    w(f"""  -- ═══════════════ מסלול פעיל ═══════════════
  -- הסדר כאן ידני — כפי שבעל העסק היה מסדר בשלב 4. זו נקודת הייחוס
  -- שמולה שלב 6 יצטרך להוכיח שיפור.
  insert into routes (business_id, courier_id, status, created_at, dispatched_at)
  values (v_business, v_courier, 'dispatched', v_now - interval '35 minutes',
          v_now - interval '30 minutes')
  returning route_id into v_route;

  insert into route_stops (route_id, delivery_id, sequence)
  select v_route, d.delivery_id, row_number() over (order by d.created_at)
  from deliveries d
  where d.business_id = v_business
    and d.customer_phone in ({active});

  -- ═══════════════ מסלול היסטורי שנסגר ═══════════════
  insert into routes (business_id, courier_id, status, created_at, dispatched_at, completed_at)
  values (v_business, v_courier, 'completed', v_now - interval '180 minutes',
          v_now - interval '172 minutes', v_now - interval '145 minutes')
  returning route_id into v_route;

  insert into route_stops (route_id, delivery_id, sequence)
  select v_route, d.delivery_id, row_number() over (order by d.created_at)
  from deliveries d
  where d.business_id = v_business
    and d.customer_phone in ({history});

  -- ═══════════════ מסלול טיוטה — כאן רואים את שלב 6 ═══════════════
  -- כפתור "חשב סדר אופטימלי" מופיע רק בטיוטה, כי מסלול משוגר קופא.
  -- בלי טיוטה בזרע, מבקר שנכנס לתשעים שניות לא יראה את הפיצ'ר
  -- המרכזי של הפרויקט בכלל.
  --
  -- הסדר ההתחלתי הוא **מהרחוק לקרוב במכוון** — הסדר הגרוע ביותר
  -- למינימום המתנה. הוא גורר את השליח לקצה ומשאיר שניים לחכות
  -- לחזרתו, כך שהלחיצה על הכפתור מייצרת שיפור נראה לעין במקום
  -- "הסדר שהיה כבר היה הטוב ביותר".
  insert into routes (business_id, courier_id, status, created_at)
  values (v_business, v_courier, 'draft', v_now - interval '4 minutes')
  returning route_id into v_route;

{draft_stops}
  raise notice 'נתוני הדמו נטענו לעסק %', v_business;
end $$;
""")


if __name__ == "__main__":
    raise SystemExit(main())
