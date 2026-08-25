// ═══════════════ duration-matrix ═══════════════
//
// מחזיר מטריצת זמני נסיעה בין נקודות. זה כל מה שהיא עושה.
//
// ── למה הפונקציה הזו דקה כל כך ──
// האפיון המקורי תכנן כאן `optimize-route` שמריצה גם את האלגוריתם,
// משני נימוקים: להסתיר את מפתח ה-API, ו"חישוב שאסור לתת ללקוח לזייף".
// הנימוק השני אינו תקף: בעל העסק כבר מסדר את העצירות ידנית בכל סדר
// שירצה (RouteCard.swap), וה-RLS מתיר לו זאת במכוון. אין מה להגן עליו.
//
// נשאר נימוק אחד — המפתח — ולכן הפונקציה מספקת מטריצה בלבד.
// האלגוריתם רץ בצד הלקוח מתוך packages/shared/src/optimize.ts, שהוא
// המודול שכבר מכוסה בבדיקות. החלופה הייתה להעתיק אותו לכאן ולהחזיק
// שני עותקים של פונקציית המטרה — בדיוק הכשל שהפיל את ספירת המסירות
// בשלב 4: אל תחזיקו את אותו נתון, או את אותה לוגיקה, בשני מקומות.
//
// ── פריסה ──
//   npx supabase functions deploy duration-matrix
//   npx supabase secrets set ORS_API_KEY=...

const ORS_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car';

// ORS אינו מציע פרופיל לאופנוע. driving-car הוא הקירוב הקרוב ביותר,
// והוא שמרני: אופנוע בעיר מהיר יותר מרכב, לא איטי יותר. הטיה בכיוון
// הזה בטוחה — ETA שמרי עדיף על הבטחה שלא תתקיים.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Point {
  lat: number;
  lng: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('ORS_API_KEY');
  if (!apiKey) {
    // נכשל ברעש. פונקציה שמחזירה בשקט מטריצה ריקה תגרום לסדר שגוי
    // שנראה תקין, וזה הכשל הגרוע ביותר במערכת הזו.
    console.error('ORS_API_KEY חסר בסביבת הפונקציה');
    return json({ error: 'missing_api_key' }, 500);
  }

  let points: Point[];
  try {
    ({ points } = await req.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!Array.isArray(points) || points.length < 2) {
    return json({ error: 'need_at_least_two_points' }, 400);
  }
  // המסעדה + 8 עצירות = 9. התקרה של ORS גבוהה בהרבה (3,500 צמדים),
  // אבל בקשה חריגה כאן מעידה על באג בקליינט ולא על צורך אמיתי.
  if (points.length > 12) {
    return json({ error: 'too_many_points' }, 400);
  }
  if (points.some((p) => typeof p?.lat !== 'number' || typeof p?.lng !== 'number')) {
    return json({ error: 'invalid_point' }, 400);
  }

  let res: Response;
  try {
    res = await fetch(ORS_URL, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // ORS מצפה ל-[lng, lat] — הפוך מהסדר המקובל בדיבור ובסכימה
        // שלנו. מקור קלאסי לבאג שקט: הקואורדינטות נוחתות בסומליה
        // והמטריצה חוזרת עם מספרים שנראים סבירים.
        locations: points.map((p) => [p.lng, p.lat]),
        metrics: ['duration'],
      }),
    });
  } catch (e) {
    console.error('הקריאה ל-ORS נכשלה', e);
    return json({ error: 'provider_unreachable' }, 502);
  }

  if (!res.ok) {
    const detail = await res.text();
    console.error(`ORS החזיר ${res.status}: ${detail}`);
    // 429 = חריגה ממכסה. מבדילים אותה כדי שהקליינט יוכל לומר למשתמש
    // משהו נכון במקום "שגיאה כללית".
    return json({ error: res.status === 429 ? 'quota_exceeded' : 'provider_error' }, 502);
  }

  const body = await res.json();
  const durations = body?.durations;

  if (!Array.isArray(durations) || durations.length !== points.length) {
    console.error('ORS החזיר מטריצה בגודל לא צפוי', durations?.length);
    return json({ error: 'bad_matrix' }, 502);
  }
  // ORS מחזיר null כשאין מסלול נסיע בין שתי נקודות — למשל כתובת
  // שנעצה ידנית באמצע שדה. null שיעבור הלאה יהפוך לחישוב NaN ולסדר
  // שרירותי, ולכן עוצרים כאן.
  if (durations.some((row: unknown[]) => row.some((v) => typeof v !== 'number'))) {
    return json({ error: 'unroutable_point' }, 422);
  }

  return json({ durations });
});
