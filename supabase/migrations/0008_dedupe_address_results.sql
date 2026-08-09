-- תיקון: חיפוש כתובת החזיר את אותו בניין כמה פעמים.
--
-- במאגר המקור אותו בניין מופיע בשני סדרי שם — "צבי אבידוב 5" וגם
-- "אבידוב צבי 5" — עם קואורדינטה זהה. נמדד: 1,959 בניינים בבאר שבע,
-- 9.9% מהשורות.
--
-- השורות הכפולות נשארות בטבלה בכוונה: כל צורה היא דרך לגיטימית
-- שמשתמש עשוי להקליד, ומחיקת אחת מהן תשבור חיפוש. האיחוד נעשה
-- בתוצאות בלבד — קבוצה לפי קואורדינטה מעוגלת (כחמישה ספרות אחרי
-- הנקודה, כמטר אחד), ומכל קבוצה חוזרת הצורה שהכי דומה לשאילתה.
-- כך מי שהקליד "אבידוב צבי" יראה את הסדר שהוא הקליד.

create or replace function search_addresses(p_query text, p_limit int default 6)
returns table(label text, lat double precision, lng double precision)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with matched as (
    select
      a.street || ' ' || a.house_number || ', ' || a.city as m_label,
      a.lat  as m_lat,
      a.lng  as m_lng,
      word_similarity(p_query, a.search_text) as m_sim
    from public.addresses a
    where p_query <% a.search_text
  ),
  best as (
    select distinct on (round(m.m_lat::numeric, 5), round(m.m_lng::numeric, 5))
      m.m_label,
      m.m_lat,
      m.m_lng,
      m.m_sim
    from matched m
    order by
      round(m.m_lat::numeric, 5),
      round(m.m_lng::numeric, 5),
      m.m_sim desc,
      length(m.m_label)
  )
  select b.m_label, b.m_lat, b.m_lng
  from best b
  order by b.m_sim desc, length(b.m_label)
  limit least(coalesce(p_limit, 6), 20)
$$;
