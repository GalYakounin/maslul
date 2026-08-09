-- תיקון: חיפוש "היילפרין ליפמן 18" החזיר גם את בתים 11, 13, 14, 15, 19.
--
-- word_similarity מודד דמיון על כל הטקסט, ושם הרחוב הוא רובו — מספר
-- הבית כמעט לא משפיע על הציון. הבית הנכון אמנם יצא ראשון, אבל מתוך
-- מקריות ולא מתוך כלל.
--
-- כאן מוציאים את המספר מהשאילתה ומדרגים לפיו במפורש: בית שמספרו
-- תואם עולה לראש הרשימה תמיד.
--
-- דירוג ולא סינון, במכוון: אם הוקלד בית שאינו במאגר, עדיף להראות את
-- שכניו מאשר רשימה ריקה — בשעת עומס אסור שהמערכת תיתקע. הבחירה
-- נשארת אצל בעל העסק, והיא מודעת.

create or replace function search_addresses(p_query text, p_limit int default 6)
returns table(label text, lat double precision, lng double precision)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with q as (
    select (regexp_match(p_query, '(\d+)'))[1] as wanted_number
  ),
  matched as (
    select
      a.street || ' ' || a.house_number || ', ' || a.city as m_label,
      a.lat as m_lat,
      a.lng as m_lng,
      word_similarity(p_query, a.search_text) as m_sim,
      -- מספר הבית עשוי לשאת סיומת אות ("12א"); משווים את הספרות בלבד
      ((regexp_match(a.house_number, '^(\d+)'))[1] is not distinct from (select wanted_number from q))
        and (select wanted_number from q) is not null as m_exact
    from public.addresses a
    where p_query <% a.search_text
  ),
  best as (
    select distinct on (round(m.m_lat::numeric, 5), round(m.m_lng::numeric, 5))
      m.m_label,
      m.m_lat,
      m.m_lng,
      m.m_sim,
      m.m_exact
    from matched m
    order by
      round(m.m_lat::numeric, 5),
      round(m.m_lng::numeric, 5),
      m.m_sim desc,
      length(m.m_label)
  )
  select b.m_label, b.m_lat, b.m_lng
  from best b
  order by b.m_exact desc, b.m_sim desc, length(b.m_label)
  limit least(coalesce(p_limit, 6), 20)
$$;
