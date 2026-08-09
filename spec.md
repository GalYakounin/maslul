# מערכת ניהול וייעול משלוחים — אפיון ותוכנית מימוש

> מסמך תכנון טכני. גרסה 1.0

---

## 1. מה המערכת עושה

מערכת SaaS למסעדות שמפעילות שליחים משלהן. שני סוגי משתמשים:

- **בעל עסק** — לוח בקרה בדפדפן: הזנת משלוחים, ניהול שליחים במשמרת, מפה, קיבוץ משלוחים למסלול והצמדתו לשליח.
- **שליח** — אפליקציה מינימלית בנייד: לאיזו מסעדה הוא משויך, מה המסלול שלו, וסימון מסירה.

**האילוץ העסקי המרכזי** (שאומת מול בתי עסק): שליח שיצא למסלול אינו חוזר לאסוף משלוח נוסף באמצע. כל יציאה היא **אצווה סגורה**. זה מפשט את הבעיה מבעיה דינמית לשתי בעיות סטטיות נפרדות.

---

## 2. ארכיטקטורה כללית

```
┌─────────────────────┐         ┌─────────────────────┐
│  דשבורד בעל עסק      │         │  אפליקציית שליח      │
│  React + Vite       │         │  PWA → Expo         │
│  Leaflet (מפה)      │         │  GPS ברקע           │
└──────────┬──────────┘         └──────────┬──────────┘
           │                                │
           │    Supabase JS Client          │
           │    (REST + Realtime WS)        │
           └────────────┬───────────────────┘
                        │
           ┌────────────▼────────────────┐
           │        SUPABASE             │
           │  ┌───────────────────────┐  │
           │  │ Auth (JWT)            │  │
           │  ├───────────────────────┤  │
           │  │ Postgres + PostGIS    │  │
           │  │ + Row Level Security  │  │
           │  ├───────────────────────┤  │
           │  │ Realtime (WebSocket)  │  │
           │  ├───────────────────────┤  │
           │  │ Edge Functions (Deno) │  │
           │  │  • geocode            │  │
           │  │  • optimize-route     │  │
           │  └───────────────────────┘  │
           └──────┬───────────────┬──────┘
                  │               │
        ┌─────────▼──────┐  ┌─────▼──────────┐
        │ Google         │  │ OSRM           │
        │ Geocoding API  │  │ (Docker, VPS)  │
        │ כתובת→נ״צ       │  │ מטריצת זמנים    │
        └────────────────┘  └────────────────┘
```

**עקרון מנחה:** רוב הלוגיקה יושבת ב-DB (אילוצים + RLS), לא בקוד הלקוח. שני ה-Edge Functions הם היחידים שמדברים עם שירותים חיצוניים.

---

## 3. סטאק טכנולוגי

| רכיב | בחירה | נימוק |
|---|---|---|
| שפה | TypeScript (Full-stack) | טיפוסים משותפים בין שרת ללקוח מונעים באגי חוזה |
| בסיס נתונים | Postgres 15 + PostGIS | הנתונים רלציוניים לחלוטין; PostGIS למרחקים גיאוגרפיים |
| Backend | Supabase | Auth + Realtime + RLS מהקופסה. חוסך ~3 שבועות תשתית |
| לוגיקת שרת | Supabase Edge Functions (Deno) | אותה שפה, פריסה מיידית |
| דשבורד | React 18 + Vite + TailwindCSS | |
| מפה | Leaflet + אריחי OpenStreetMap | חינם. Mapbox כשדרוג עיצובי |
| אפליקציית שליח | PWA (שלב 1) → Expo/React Native (שלב 2) | ראה §3.1 |
| גיאוקודינג | Google Geocoding API | הכי מדויק בישראל בפער ניכר |
| מטריצת זמנים | OSRM עצמי בדוקר | חינם ובלתי מוגבל אחרי התקנה |
| ניהול state | TanStack Query + Zustand | |

### 3.1 הערה קריטית על אפליקציית השליח

**iOS אינו מאפשר ל-PWA לדווח מיקום ברקע.** ברגע שהמסך ננעל, זרם המיקום נפסק. אין מסביב לזה דרך.

- **שלב 1 (MVP):** PWA, בהנחה שהטלפון על מעמד והאפליקציה פתוחה. מספיק כדי להוכיח את הרעיון.
- **שלב 2:** מעבר ל-Expo עם `expo-location` במצב background. הקוד ב-React ניתן לשימוש חוזר ברובו.

### 3.2 הערה על OSRM

Google Distance Matrix מחייב **לפי תא במטריצה**. 6 נקודות = 36 תאים לכל חישוב מסלול. בעומס זה מתייקר מהר.

OSRM: מורידים את קובץ ה-OSM של ישראל (~200MB), מריצים בקונטיינר על VPS זול, ומקבלים מטריצות במילישניות ובחינם.

```bash
wget https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/motorcycle.lua /data/israel-and-palestine-latest.osm.pbf
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/israel-and-palestine-latest.osrm
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/israel-and-palestine-latest.osrm
docker run -t -i -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-routed --algorithm mld /data/israel-and-palestine-latest.osrm
```

**מגבלה:** אין תנועה בזמן אמת. למשלוחי אוכל באופנוע בתוך עיר — סביר לחלוטין.

---

## 4. מודל נתונים

### 4.1 סכימה

```sql
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ═══════════════ עסקים ═══════════════
create table businesses (
  business_id   uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text not null,
  lat           double precision not null,
  lng           double precision not null,
  phone         text,
  -- הגדרות אצווה שבעל העסק שולט בהן
  batch_max_size          int not null default 4,
  batch_max_wait_minutes  int not null default 8,
  created_at    timestamptz not null default now()
);

-- קישור משתמשי Auth לעסק (מאפשר כמה מנהלים לעסק אחד)
create table business_members (
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid not null references businesses(business_id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','dispatcher')),
  primary key (user_id, business_id)
);

-- ═══════════════ שליחים ═══════════════
create table couriers (
  courier_id        uuid primary key references auth.users(id) on delete cascade,
  name              text not null,
  phone             text not null,
  vehicle_type      text not null default 'motorcycle'
                    check (vehicle_type in ('motorcycle','scooter','car','bicycle')),
  last_lat          double precision,
  last_lng          double precision,
  last_location_at  timestamptz,
  created_at        timestamptz not null default now()
);

-- ═══════════════ משמרות ═══════════════
-- מחליף את Active + Current_Business_ID. שומר היסטוריה ומאפשר מצב "ממתין לאישור".
create table shifts (
  shift_id     uuid primary key default gen_random_uuid(),
  courier_id   uuid not null references couriers(courier_id) on delete cascade,
  business_id  uuid not null references businesses(business_id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','active','ended','rejected')),
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  ended_at     timestamptz
);

-- שליח לא יכול להיות במשמרת פעילה בשני עסקים במקביל
create unique index one_active_shift_per_courier
  on shifts (courier_id) where status = 'active';

-- ═══════════════ משלוחים ═══════════════
create table deliveries (
  delivery_id     uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(business_id) on delete cascade,

  order_details   text,
  customer_name   text,
  customer_phone  text not null,
  address         text not null,
  address_note    text,                    -- קומה, כניסה, קוד שער

  lat             double precision,
  lng             double precision,
  geocode_status  text not null default 'pending'
                  check (geocode_status in ('pending','ok','failed','manual')),

  price_agorot    integer not null default 0,   -- ★ אגורות, לא float
  payment_method  text not null default 'cash'
                  check (payment_method in ('cash','card_online','card_on_delivery')),
  paid            boolean not null default false,

  status          text not null default 'new'
                  check (status in ('new','ready','assigned','picked_up','delivered','cancelled')),

  -- ★ חותמות הזמן — הבסיס לכל מדידה ולכל אופטימיזציה
  created_at      timestamptz not null default now(),
  ready_at        timestamptz,   -- יצא מהמטבח
  picked_up_at    timestamptz,   -- השליח לקח
  delivered_at    timestamptz    -- נמסר ללקוח
);

-- ═══════════════ מסלולים ═══════════════
create table routes (
  route_id                    uuid primary key default gen_random_uuid(),
  business_id                 uuid not null references businesses(business_id) on delete cascade,
  courier_id                  uuid references couriers(courier_id),
  status                      text not null default 'draft'
                              check (status in ('draft','offered','dispatched','completed','cancelled')),
  estimated_duration_seconds  int,
  created_at                  timestamptz not null default now(),
  dispatched_at               timestamptz,
  completed_at                timestamptz
);

create table route_stops (
  route_id     uuid not null references routes(route_id) on delete cascade,
  delivery_id  uuid not null unique references deliveries(delivery_id) on delete cascade,
  sequence     int not null,          -- ★ פלט האלגוריתם
  eta          timestamptz,
  primary key (route_id, delivery_id)
);

-- ═══════════════ אינדקסים ═══════════════
create index idx_deliveries_open on deliveries (business_id, status)
  where status in ('new','ready');
create index idx_deliveries_created on deliveries (business_id, created_at desc);
create index idx_shifts_active on shifts (business_id) where status = 'active';
create index idx_shifts_courier on shifts (courier_id, status);
create index idx_routes_courier on routes (courier_id, status);
create index idx_route_stops_seq on route_stops (route_id, sequence);
```

### 4.2 הערות תכן

| החלטה | נימוק |
|---|---|
| `price_agorot integer` | חשבון עשרוני בבינארי שבור. `0.1 + 0.2 ≠ 0.3` |
| `delivery_id unique` ב-`route_stops` | משלוח שייך למסלול אחד לכל היותר. ביטול מסלול מוחק את השורות ומשחרר את המשלוחים |
| `courier_id` על `couriers` = `auth.users.id` | חוסך JOIN בכל בדיקת הרשאה |
| `geocode_status` | כתובות בישראל נכשלות לעיתים. צריך מסלול תיקון ידני, לא כישלון שקט |
| `business_members` נפרד | מסעדה עם שני מנהלים היא מקרה רגיל |
| אין `Active` על שליח | נגזר מ-`shifts`. מקור אמת יחיד |

---

## 5. אבטחה — Row Level Security

הרעיון: ההרשאות נאכפות ב-DB, לא בקוד. גם אם יש באג בפרונט, אי אפשר לקרוא נתונים של עסק אחר.

```sql
-- פונקציית עזר: אילו עסקים שייכים למשתמש הנוכחי
create or replace function my_business_ids()
returns setof uuid language sql security definer stable as $$
  select business_id from business_members where user_id = auth.uid()
$$;

alter table deliveries enable row level security;
alter table routes     enable row level security;
alter table shifts     enable row level security;
alter table couriers   enable row level security;

-- בעל עסק: שליטה מלאה במשלוחים של העסק שלו
create policy biz_deliveries on deliveries
  for all using (business_id in (select my_business_ids()));

-- שליח: רואה רק משלוחים במסלול שהוצמד לו והופעל
create policy courier_deliveries on deliveries
  for select using (
    exists (
      select 1 from route_stops rs
      join routes r on r.route_id = rs.route_id
      where rs.delivery_id = deliveries.delivery_id
        and r.courier_id = auth.uid()
        and r.status in ('offered','dispatched')
    )
  );

-- שליח: מעדכן רק סטטוס מסירה של משלוחים שלו
create policy courier_update_delivery on deliveries
  for update using (
    exists (select 1 from route_stops rs join routes r using(route_id)
            where rs.delivery_id = deliveries.delivery_id
              and r.courier_id = auth.uid() and r.status = 'dispatched')
  );

-- משמרות: כל צד רואה את שלו
create policy shift_courier on shifts
  for select using (courier_id = auth.uid());
create policy shift_business on shifts
  for all using (business_id in (select my_business_ids()));
create policy shift_courier_respond on shifts
  for update using (courier_id = auth.uid() and status = 'pending');
```

**נקודה חשובה:** שליח לא רואה משלוח לפני שהמסלול הוצמד לו. אין דליפה של רשימת הלקוחות של המסעדה.

---

## 6. זרימות מרכזיות

### 6.1 פתיחת משמרת

```
בעל עסק                      DB                        שליח
   │                          │                          │
   │─ הזמן שליח ──────────────▶│                          │
   │                    INSERT shifts                     │
   │                    status='pending'                  │
   │                          │──── Realtime push ───────▶│
   │                          │                    "הזמנה ממסעדת X"
   │                          │◀──── אישור ───────────────│
   │                    UPDATE status='active'            │
   │◀──── Realtime ───────────│                          │
   │  מופיע ברשימת הפעילים      │                          │
```

### 6.2 מהזמנה למסירה

```
1. הזנת משלוח       → INSERT deliveries (status='new', geocode='pending')
                     → טריגר קורא ל-Edge Function geocode
                     → UPDATE lat/lng, geocode_status='ok'

2. יצא מהמטבח       → UPDATE ready_at=now(), status='ready'   ★ קריטי

3. קיבוץ במפה       → בעל העסק מסמן 3-4 משלוחים
                     → INSERT routes (status='draft') + route_stops

4. חישוב סדר        → Edge Function optimize-route
                     → UPDATE route_stops.sequence + eta

5. הצמדה לשליח      → UPDATE routes.courier_id, status='offered'
                     → Realtime push לשליח

6. יציאה            → status='dispatched', dispatched_at=now()
                     → deliveries.picked_up_at=now(), status='picked_up'

7. מסירה            → השליח לוחץ "נמסר" בכל תחנה
                     → deliveries.delivered_at=now(), status='delivered'

8. סיום             → כל התחנות נמסרו → routes.status='completed'
                     → השליח חוזר לזמין
```

---

## 7. ערוצי Realtime

| ערוץ | מנוי | טריגר | פעולה בלקוח |
|---|---|---|---|
| `shifts:courier_id=eq.{id}` | שליח | INSERT pending | התראה + מסך אישור |
| `shifts:business_id=eq.{id}` | דשבורד | UPDATE status | רענון רשימת פעילים |
| `deliveries:business_id=eq.{id}` | דשבורד | INSERT/UPDATE | רענון טבלה ומפה |
| `routes:courier_id=eq.{id}` | שליח | UPDATE status='offered' | הצגת מסלול חדש |
| `couriers:business_id` (Broadcast) | דשבורד | דיווח מיקום | הזזת סיכה במפה |

**מיקומי שליחים:** דיווח כל 10-15 שניות. **אל תשמור ב-DB** בתדירות הזו — זה יכתוב מיליוני שורות ביום. השתמש ב-Supabase Broadcast (זיכרון בלבד), ושמור ב-`couriers.last_lat/lng` רק פעם בדקה כגיבוי.

---

## 8. האלגוריתם

### 8.1 שתי השכבות

| שכבה | מה מחליטים | מתי |
|---|---|---|
| **א׳ — סידור** | באיזה סדר לנסוע בין נקודות האצווה | אוטומטי, מיידי |
| **ב׳ — הרכבה** | אילו משלוחים לצרף, ומתי לצאת | ידני ב-MVP; המלצה בהמשך |

### 8.2 שכבה א׳ — פונקציית המטרה

**זו לא בעיית TSP.** TSP ממזער אורך מסלול כולל. ללקוח לא אכפת כמה השליח נסע — אכפת לו מתי **הוא** קיבל.

מה שממזערים הוא **סכום זמני ההמתנה של הלקוחות**, משוקלל לפי כמה זמן האוכל כבר מחכה:

```
minimize   Σᵢ ( arrival_timeᵢ − ready_atᵢ )
```

זו בעיה בשם **Minimum Latency Problem** (Traveling Repairman). היא נבדלת מ-TSP: המסלול האופטימלי שלה עשוי להיות **ארוך יותר** במרחק, כי משתלם לקטוף נקודות קרובות מוקדם.

מנה שהמתינה 6 דקות על הדלפק מקבלת עדיפות אוטומטית — ה-`ready_at` המוקדם מגדיל את תרומתה לפונקציה.

### 8.3 מימוש — Edge Function

```typescript
// supabase/functions/optimize-route/index.ts

async function optimizeRoute(depot: LatLng, stops: Stop[]) {
  // 1. מטריצת זמנים מ-OSRM (כולל המסעדה כנקודת מוצא)
  const coords = [depot, ...stops.map(s => s.coords)]
    .map(c => `${c.lng},${c.lat}`).join(';');
  const res = await fetch(`${OSRM_URL}/table/v1/driving/${coords}`);
  const { durations } = await res.json();   // durations[0] = מהמסעדה

  // 2. n ≤ 8 → 40,320 תמורות. ברוט-פורס, זמן ריצה ~20ms
  let best = null, bestCost = Infinity;
  for (const perm of permutations(stops.map((_, i) => i + 1))) {
    let t = 0, prev = 0, cost = 0;
    for (const idx of perm) {
      t += durations[prev][idx];
      const waitedBefore = (Date.now() - stops[idx - 1].readyAt) / 1000;
      cost += t + waitedBefore;              // ← פונקציית המטרה
      prev = idx;
    }
    if (cost < bestCost) { bestCost = cost; best = perm; }
  }
  return { order: best, cost: bestCost };
}
```

**אל תגרור OR-Tools לפני שיש משתמשים.** ב-n≤8 ברוט-פורס נותן תוצאה **אופטימלית מוכחת** במילישניות. OR-Tools הוא Python, כלומר שירות נפרד לפרוס ולתחזק — עלות שלא מוצדקת בשלב הזה.

מעל n=10, החלף ל-Held-Karp (תכנון דינמי, O(n²·2ⁿ)).

### 8.4 שכבה ב׳ — הרכבת אצוות (שלב מאוחר)

היוריסטיקה שעובדת בפועל:

1. חלק את המפה ל-6 **סקטורים זוויתיים** של 60° סביב המסעדה.
2. משלוחים באותו סקטור הם מועמדים לאיגוד.
3. שלח כשמתקיים אחד מ: האצווה הגיעה ל-`batch_max_size`, **או** המשלוח הוותיק ביותר ממתין מעל `batch_max_wait_minutes`.
4. שני המספרים האלה הם סליידרים בהגדרות העסק — לא קבועים בקוד.

**חלון ההשהיה:** השליח לא חוזר באמצע, אבל עוד לא יצא. אם מנה יוצאת מהתנור לכתובת שכבר על המסלול — שווה לעצור אותו ל-30 שניות. כפתור: *"המתן 90 שניות — מנה נוספת בכיוון שלך"*. זו הכנסה כמעט חינם.

---

## 9. תוכנית מימוש

עקרון: **שלבים 1-5 הם מוצר עובד ומכיר בלי שורת אופטימיזציה אחת.** זה מכוון — אם בעל העסק לא משתמש בשלב 5, שלב 6 חסר משמעות.

### שלב 0 — תשתית (3-4 ימים)
- פרויקט Supabase, מיגרציות, RLS
- מונורפו: `apps/dashboard`, `apps/courier`, `packages/shared-types`
- Auth: הרשמה כעסק / כשליח

### שלב 1 — משמרות (3-4 ימים)
- דשבורד: רשימת שליחים, כפתור הזמנה
- אפליקציית שליח: מסך קבלת הזמנה, אישור/דחייה
- Realtime בשני הכיוונים
- **בדיקה:** שני מכשירים, ההזמנה מגיעה בפחות מ-2 שניות

### שלב 2 — משלוחים + גיאוקודינג (4-5 ימים)
- טופס הזנת משלוח
- Edge Function לגיאוקודינג + מסלול תיקון ידני לכשלים
- טבלת משלוחים פעילים
- כפתור **"מוכן"** שכותב `ready_at` ← אל תדלג על זה
- **בדיקה:** 20 כתובות אמיתיות ממסעדה בפ״ת. מה אחוז ההצלחה?

### שלב 3 — מפה (4-5 ימים)
- Leaflet: המסעדה, משלוחים פתוחים, שליחים חיים
- דיווח מיקום מהשליח דרך Broadcast
- **בדיקה:** נסיעה אמיתית ברחוב, מעקב במקביל בדשבורד

### שלב 4 — מסלולים ידניים (5-6 ימים)
- בחירה מרובה במפה → "צור מסלול"
- הצמדה לשליח → push
- מסך שליח: רשימה מסודרת + ניווט + "נמסר"
- **כאן יש מוצר מלא.** אפשר להתחיל פיילוט אמיתי.

### שלב 5 — פיילוט (שבועיים, בלי קוד חדש)
מסעדה אחת, שימוש יומיומי. אוספים נתונים ומודדים. תקנו רק מה ששובר.

### שלב 6 — אופטימיזציה (5-6 ימים)
- התקנת OSRM
- Edge Function `optimize-route`
- כפתור "חשב סדר אופטימלי" + ETA
- **מדידה:** השווה `delivered_at − ready_at` לפני ואחרי. אם אין שיפור מדיד — הבעיה בשכבה ב׳, לא בשכבה א׳.

### שלב 7 — המלצות אצווה + אנליטיקס
- סקטורים והצעת קיבוץ
- דוח שבועי לבעל העסק
- כפתור השהיה

---

## 10. עלויות (מסעדה אחת, ~100 משלוחים ליום)

| שירות | עלות חודשית |
|---|---|
| Supabase | $0 (Free) → $25 (Pro, כשעוברים 500MB) |
| VPS ל-OSRM (2GB RAM) | ~$6 |
| Google Geocoding | ~$15 (3,000 קריאות) |
| Vercel (דשבורד) | $0 |
| **סה״כ** | **~$20-45** |

בקנה מידה של 50 מסעדות, ה-OSRM לא מתייקר כלל (אותו שרת) והגיאוקודינג הוא הפריט הדומיננטי — כדאי לשמור מטמון של כתובות חוזרות.

---

## 11. סיכונים

| סיכון | חומרה | מענה |
|---|---|---|
| **הזנה ידנית של הזמנות** — אם בעל העסק צריך להקליד 8 כתובות, לא ישתמש | 🔴 גבוה | אינטגרציה לקופות ישראליות. בטווח קצר: הדבקה מוואטסאפ + פענוח |
| **גיאוקודינג נכשל בישראל** | 🟠 בינוני | מסלול תיקון ידני חובה; מטמון כתובות |
| **סוללת השליח** | 🟠 בינוני | הורדת תדירות ל-30 שניות בעצירה; המלצה למעמד+מטען |
| **תמריצים הפוכים** — שליח שמשולם לפי משלוח מרוויח מאי-יעילות | 🟠 בינוני | הצג לשליח *"יותר משלוחים במשמרת"*, לא *"פחות ק״מ"* |
| PWA ללא GPS ברקע ב-iOS | 🟡 ידוע | מתוכנן: מעבר ל-Expo בשלב 2 |
| אין תנועה בזמן אמת ב-OSRM | 🟡 נמוך | מקדם תיקון לפי שעה; Google בהמשך |

---

## 12. מבנה הפרויקט

```
delivery-optimizer/
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql
│   │   ├── 0002_rls.sql
│   │   └── 0003_triggers.sql
│   └── functions/
│       ├── geocode/index.ts
│       └── optimize-route/index.ts
├── packages/
│   └── shared/              # טיפוסים משותפים מהסכימה
│       └── src/types.ts
├── apps/
│   ├── dashboard/           # React + Vite
│   │   └── src/
│   │       ├── features/{deliveries,couriers,map,routes}/
│   │       └── lib/supabase.ts
│   └── courier/             # PWA → Expo
│       └── src/
│           ├── screens/{ShiftInvite,ActiveRoute}/
│           └── lib/location.ts
└── infra/
    └── osrm/docker-compose.yml
```

---

## 13. שלוש החלטות שכדאי לא לשנות

1. **`ready_at` נכתב בכל משלוח.** בלעדיו אין מדידה, אין פונקציית מטרה, ואין הוכחה שהמערכת עוזרת.
2. **הכל עובר דרך `routes`.** אל תצמיד `courier_id` ישירות למשלוח — זה מוחק את הסדר, שהוא כל המוצר.
3. **פיילוט לפני אופטימיזציה.** שלב 5 קודם לשלב 6. הנתונים מהפיילוט יגידו לך אם השקעת במקום הנכון.
