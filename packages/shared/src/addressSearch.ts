import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// ═══════════════ ספק הצעות כתובת ═══════════════
// כל התלות בספקי כתובות מרוכזת בקובץ הזה.
//
// המקור הראשי הוא טבלת addresses שלנו — מאגר הכתובות הישראלי הפתוח,
// טעון אצלנו. הסיבה שהוא ראשי ולא גיבוי היא מדידה, לא העדפה:
// "היילפרין ליפמן 18" בבאר שבע לא נמצא ב-OSM בכלל, ו"שדרות רגר"
// חזר משם כנקודה אחת — כשהרחוב באורך 2,889 מטר. במאגר המקומי שתי
// הכתובות קיימות ברמת בניין.
//
// Photon הוא הגיבוי: OSM חזק בגוש דן, וכיסויו רחב יותר גיאוגרפית
// מהמאגר שטענו (שכרגע מכיל עיר אחת). הוא גם מכסה כתובות חדשות
// שהצילום מנובמבר 2024 לא מכיר.
//
// גוגל פסולה כל עוד המפה היא Leaflet — התנאים אוסרים לצרוך תוכן
// גיאוקודינג שלה יחד עם מפה שאינה שלה. Nominatim הציבורי אוסר
// השלמה אוטומטית. GovMap אינו מחזיר קואורדינטות כלל.

export interface AddressSuggestion {
  label: string; // מה שמוצג למשתמש
  lat: number;
  lng: number;
  // precise=false אומר שההצעה היא ברמת רחוב בלבד: OSM לא מכיר את מספר
  // הבית, והקואורדינטה שחוזרת היא מרכז הרחוב — יכולה להיות רחוקה מאות
  // מטרים מהיעד. אימות מול כתובות בבאר שבע החזיר כמעט רק תוצאות כאלה.
  //
  // זו ההבחנה החשובה בקובץ הזה: קואורדינטה שגויה בשקט גרועה מהיעדר
  // קואורדינטה, כי היא נראית תקינה עד שהשליח עומד במקום הלא נכון.
  precise: boolean;
}

// תיבה תוחמת גסה של ישראל — מונעת הצעות מרחבי העולם על שאילתה קצרה.
const ISRAEL_BBOX = '34.2,29.4,35.95,33.4';
const PHOTON_URL = 'https://photon.komoot.io/api';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    postcode?: string;
  };
}

function toLabel(p: PhotonFeature['properties']): string {
  const street = p.street ?? p.name ?? '';
  const line = [street, p.housenumber].filter(Boolean).join(' ');
  const place = p.city ?? p.district ?? '';
  return [line, place].filter(Boolean).join(', ');
}

// ═══════════════ המאגר המקומי ═══════════════
// כל שורה בטבלה היא בניין עם מספר בית, ולכן כל תוצאה משם היא precise.
async function searchLocal(
  supabase: SupabaseClient,
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const { data, error } = await supabase
    .rpc('search_addresses', { p_query: query, p_limit: 6 })
    .abortSignal(signal as AbortSignal);

  if (error) throw error;

  return ((data ?? []) as Array<{ label: string; lat: number; lng: number }>).map((row) => ({
    label: row.label,
    lat: row.lat,
    lng: row.lng,
    precise: true,
  }));
}

async function searchPhoton(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  // lang=default מחזיר את השם המקומי — כלומר עברית בישראל. בלי הפרמטר
  // Photon הולך לפי Accept-Language של הדפדפן ומחזיר תעתיק אנגלי
  // ("Ibn Gabirol 30"), מה שהופך את השדה לחסר שימוש לבעל עסק ישראלי.
  // lang=he אינו נתמך ומחזיר 400 — אימתתי. אל תחליפו אותו בזה.
  const url = `${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=6&lang=default&bbox=${ISRAEL_BBOX}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`photon ${response.status}`);

  const body = (await response.json()) as { features?: PhotonFeature[] };

  return (body.features ?? [])
    .map((feature) => ({
      label: toLabel(feature.properties),
      lng: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
      precise: Boolean(feature.properties.housenumber),
    }))
    .filter((suggestion) => suggestion.label.length > 0);
}

// המאגר המקומי קודם. Photon נכנס רק כשאין ממנו תשובה — עיר שעוד לא
// טענו, או כתובת חדשה מדי לצילום שבידינו. כישלון של המאגר המקומי
// אינו מפיל את השדה: נופלים ל-Photon ומודיעים רק אם גם הוא נכשל.
export async function searchAddresses(
  supabase: SupabaseClient,
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  try {
    const local = await searchLocal(supabase, query, signal);
    if (local.length > 0) return local;
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
  }

  return searchPhoton(query, signal);
}

// ═══════════════ useAddressSearch ═══════════════
// השהיה לפני שליחה, וביטול הבקשה הקודמת בכל הקלדה. בלי שניהם כל תו
// שנקלד מייצר בקשה, ותשובה איטית של שאילתה ישנה עלולה לדרוס תשובה
// טרייה — המשתמש היה רואה הצעות של מה שהקליד לפני שתי אותיות.
export function useAddressSearch(
  supabase: SupabaseClient,
  query: string,
  minLength = 3,
  delayMs = 300
) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();

    if (query.trim().length < minLength) {
      setSuggestions([]);
      setSearching(false);
      setFailed(false);
      return;
    }

    const next = new AbortController();
    controller.current = next;
    setSearching(true);

    const timer = setTimeout(() => {
      searchAddresses(supabase, query, next.signal)
        .then((results) => {
          setSuggestions(results);
          setFailed(false);
        })
        .catch((error) => {
          if ((error as Error).name === 'AbortError') return;
          setSuggestions([]);
          setFailed(true);
        })
        .finally(() => {
          if (!next.signal.aborted) setSearching(false);
        });
    }, delayMs);

    return () => {
      clearTimeout(timer);
      next.abort();
    };
  }, [supabase, query, minLength, delayMs]);

  return { suggestions, searching, failed };
}
