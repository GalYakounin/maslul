-- שלב 2 — מאגר כתובות מקומי, במקום ספק חיצוני.
--
-- למה זה כאן ולא קריאה ל-API: אימות מול כתובות אמיתיות בבאר שבע הראה
-- ש-OSM לא מכיר שם מספרי בתים. "היילפרין ליפמן 18" לא נמצא כלל,
-- ו"שדרות רגר" חזר כנקודה אחת — בעוד שהרחוב באורך 2,889 מטר (נמדד).
-- קואורדינטה כזו הורסת בדיוק את ההבחנה שהאלגוריתם שלנו חי ממנה:
-- מינימום המתנה מסדר לפי מי קרוב ומי רחוק.
--
-- גוגל פסולה כל עוד המפה היא Leaflet — התנאים אוסרים לצרוך תוכן
-- גיאוקודינג של גוגל יחד עם מפה שאינה שלהם.
--
-- מקור: "רשימת כתובות בישראל עם קואורדינטות", odata.org.il, רישיון
-- CC-BY. קואורדינטות המקור ברשת ישראל החדשה (EPSG:2039) ומומרות
-- ל-WGS84 בשלב ההכנה — ראו scripts/build_addresses_csv.py.
-- חובת ייחוס: יש להציג קרדיט למקור במסך כלשהו לפני יציאה לשוק.

create extension if not exists pg_trgm;

create table addresses (
  address_id    bigserial primary key,
  city          text not null,
  street        text not null,
  house_number  text not null,
  neighbourhood text,
  lat           double precision not null,
  lng           double precision not null,
  -- שם הרחוב מופיע במקור בשתי צורות ("רגר יצחק" מול "יצחק רגר").
  -- שתיהן נכנסות לטקסט החיפוש כדי שכל דרך הקלדה תמצא.
  search_text   text generated always as (
                  street || ' ' || house_number || ' ' || city
                ) stored
);

-- word_similarity (האופרטור <%) מודד כמה טוב השאילתה מתאימה לקטע
-- מתוך היעד, ולא ליעד כולו — בדיוק מה שצריך כשהמשתמש מקליד
-- "רגר 40" מול "יצחק רגר 40 באר שבע".
create index idx_addresses_search on addresses using gin (search_text gin_trgm_ops);
create index idx_addresses_city on addresses (city);

-- RLS על כל טבלה חדשה, בלי יוצא מן הכלל (CLAUDE.md).
-- זה מאגר עזר ציבורי, ולכן כל משתמש מחובר רשאי לקרוא ממנו — ואיש
-- אינו רשאי לכתוב אליו. הטעינה נעשית בייבוא חד-פעמי, לא מהאפליקציה.
alter table addresses enable row level security;

create policy addresses_read on addresses
  for select to authenticated using (true);

-- ═══════════════ search_addresses ═══════════════
create or replace function search_addresses(p_query text, p_limit int default 6)
returns table(label text, lat double precision, lng double precision)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    a.street || ' ' || a.house_number || ', ' || a.city,
    a.lat,
    a.lng
  from public.addresses a
  where p_query <% a.search_text
  order by word_similarity(p_query, a.search_text) desc, length(a.search_text)
  limit least(coalesce(p_limit, 6), 20)
$$;

grant execute on function search_addresses(text, int) to authenticated;
